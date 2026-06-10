from __future__ import annotations

import hashlib
import io
import logging
import re
import zipfile
from pathlib import Path

import yaml
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.skill import Skill
from app.models.skill_audit import SkillAuditLog
from app.models.skill_version import SkillVersion
from app.schemas.skills import SkillUploadMeta

log = logging.getLogger(__name__)
FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.S)


def _find_skill_md_member(names: list[str]) -> str | None:
    """Pick the shallowest SKILL.md (contract: root or one nested folder)."""
    candidates: list[tuple[int, str]] = []
    for raw in names:
        if not raw or raw.endswith("/"):
            continue
        norm = raw.replace("\\", "/").lstrip("./")
        if norm == "SKILL.md" or norm.endswith("/SKILL.md"):
            depth = norm.count("/")
            if depth <= 1:
                candidates.append((depth, raw))
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x[0], len(x[1]), x[1]))
    return candidates[0][1]


def _norm_category(v: object) -> str:
    s = str(v or "custom").strip() or "custom"
    return s[:32]


def _norm_platforms(v: object) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [x.strip() for x in v.replace(";", ",").split(",") if x.strip()]
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return []


def _slug_from_name(name: str) -> str:
    """当 frontmatter 未提供 slug 时，由 name 生成目录标识。"""
    raw = name.strip()
    if not raw:
        return "skill"
    s = re.sub(r"[\s_]+", "-", raw.lower())
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff\-]+", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s or "skill")[:64]


def _resolve_slug(fm: dict) -> str:
    raw = fm.get("slug")
    if raw is not None and str(raw).strip():
        return str(raw).strip()[:64]
    name = str(fm.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="SKILL.md 缺少字段: name（未提供 slug 时必填）")
    return _slug_from_name(name)


def _safe_join(base: Path, *parts: str) -> Path:
    target = (base / Path(*parts)).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="非法路径")
    return target


def _extract_front_matter(skill_md: str) -> dict:
    m = FRONT_MATTER.match(skill_md)
    if not m:
        raise HTTPException(status_code=400, detail="SKILL.md 缺少 YAML frontmatter")
    loaded = yaml.safe_load(m.group(1)) or {}
    if not isinstance(loaded, dict):
        raise HTTPException(status_code=400, detail="SKILL.md frontmatter 非法")
    if not loaded.get("name"):
        raise HTTPException(status_code=400, detail="SKILL.md 缺少字段: name")
    return loaded


async def parse_upload_metadata(file: UploadFile) -> tuple[SkillUploadMeta, bytes, str]:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="仅支持 .zip 技能包")
    raw = await file.read()
    max_bytes = get_settings().skill_max_upload_mb * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail="上传文件超出大小限制")
    if not zipfile.is_zipfile(io.BytesIO(raw)):
        raise HTTPException(status_code=400, detail="zip 文件无效")

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = zf.namelist()
        # 基础防穿越检查（防止后续解压风险）
        for info in zf.infolist():
            norm_name = info.filename.replace("\\", "/")
            p = Path(norm_name)
            if p.is_absolute() or ".." in p.parts:
                raise HTTPException(status_code=400, detail="zip 内含非法路径")
        member = _find_skill_md_member(names)
        if member is None:
            raise HTTPException(
                status_code=400,
                detail="zip 缺少 SKILL.md（须位于根目录或一层子目录，如 my-skill/SKILL.md）",
            )
        skill_md = zf.read(member).decode("utf-8-sig", errors="ignore")

    fm = _extract_front_matter(skill_md)
    slug = _resolve_slug(fm)
    desc = fm.get("description")
    description = None if desc in (None, "") else (str(desc).strip() or None)
    raw_ch = fm.get("changelog")
    changelog = None if raw_ch in (None, "") else (str(raw_ch).strip() or None)
    iu = fm.get("icon_url")
    icon_url = None if iu in (None, "") else (str(iu).strip() or None)
    try:
        meta = SkillUploadMeta(
            slug=slug,
            name=str(fm["name"]).strip(),
            version=str(fm.get("version", "0.0.0")).strip(),
            description=description,
            category=_norm_category(fm.get("category")),
            platforms=_norm_platforms(fm.get("platforms")),
            changelog=changelog,
            icon_url=icon_url,
        )
    except ValidationError as e:
        err0 = e.errors()[0] if e.errors() else {}
        loc = ".".join(str(x) for x in err0.get("loc", ()))
        msg = str(err0.get("msg", "元数据无效"))
        detail = f"{loc}: {msg}" if loc else msg
        raise HTTPException(status_code=400, detail=detail) from e
    sha256 = hashlib.sha256(raw).hexdigest()
    return meta, raw, sha256


async def upsert_skill_version(
    db: AsyncSession, *, actor_user_id: str, meta: SkillUploadMeta, raw_zip: bytes, package_hash: str
) -> tuple[Skill, SkillVersion]:
    settings = get_settings()
    root = Path(settings.skill_storage_root)
    bundle_path = _safe_join(root, "bundles", meta.slug, f"{meta.version}.zip")
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    bundle_path.write_bytes(raw_zip)

    skill = await db.scalar(select(Skill).where(Skill.slug == meta.slug))
    if skill is None:
        skill = Skill(
            slug=meta.slug,
            name=meta.name,
            category=meta.category,
            summary=meta.description,
            icon_url=meta.icon_url,
            status="active",
        )
        db.add(skill)
        await db.flush()
    else:
        skill.name = meta.name
        skill.category = meta.category
        skill.summary = meta.description
        skill.icon_url = meta.icon_url

    ver = await db.scalar(
        select(SkillVersion).where(SkillVersion.skill_id == skill.id, SkillVersion.version == meta.version)
    )
    if ver is None:
        ver = SkillVersion(
            skill_id=skill.id,
            version=meta.version,
            description=meta.description,
            changelog=meta.changelog,
            platforms=meta.platforms,
            package_path=str(bundle_path.as_posix()),
            package_hash=package_hash,
            package_size=len(raw_zip),
            created_by=actor_user_id,
        )
        db.add(ver)
        await db.flush()
    else:
        ver.description = meta.description
        ver.changelog = meta.changelog
        ver.platforms = meta.platforms
        ver.package_path = str(bundle_path.as_posix())
        ver.package_hash = package_hash
        ver.package_size = len(raw_zip)

    skill.latest_version_id = ver.id
    db.add(
        SkillAuditLog(
            actor_user_id=actor_user_id,
            action="upload",
            skill_id=skill.id,
            skill_version_id=ver.id,
            detail_json={"version": meta.version, "slug": meta.slug},
        )
    )
    log.info("skill uploaded: slug=%s version=%s actor=%s", meta.slug, meta.version, actor_user_id)
    return skill, ver
