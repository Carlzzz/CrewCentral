"""Skill Hub 终端契约：见 docs/skill-hub-api-contract.md（index.json + 公开 ZIP 下载）。"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.models.skill import Skill
from app.models.skill_version import SkillVersion

router = APIRouter(tags=["skills-hub-public"])


def _hub_base_url(request: Request) -> str:
    settings = get_settings()
    bp = settings.base_path.rstrip("/") or ""
    host = str(request.base_url).rstrip("/")
    return f"{host}{bp}" if bp else host


@router.get("/index.json")
async def hub_skill_index(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """契约：GET {baseUrl}/index.json — 返回 version + items（id/name/version/description/author/category/downloadUrl）。"""
    base = _hub_base_url(request)
    rows = (
        await db.scalars(
            select(Skill)
            .where(Skill.status == "active", Skill.distribution_enabled.is_(True))
            .order_by(Skill.updated_at.desc())
        )
    ).all()
    items: list[dict] = []
    for s in rows:
        if not s.latest_version_id:
            continue
        v = await db.get(SkillVersion, s.latest_version_id)
        if v is None or not v.package_path:
            continue
        path = Path(v.package_path)
        if not path.is_file():
            continue
        slug_enc = quote(s.slug, safe="")
        ver_enc = quote(v.version, safe="")
        download_url = f"{base}/skills/packages/{slug_enc}/{ver_enc}.zip"
        entry: dict = {"id": s.slug, "downloadUrl": download_url}
        if s.name:
            entry["name"] = s.name
        if v.version:
            entry["version"] = v.version
        desc = (v.description or s.summary or "").strip()
        if desc:
            entry["description"] = desc[:4096]
        if s.category and s.category != "custom":
            entry["category"] = s.category
        items.append(entry)
    payload = {"version": 2, "items": items}
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=60"},
    )


@router.get("/skills/packages/{skill_slug}/{version}.zip", response_model=None)
async def hub_download_skill_zip(
    skill_slug: str,
    version: str,
    db: AsyncSession = Depends(get_db),
):
    """契约：GET {downloadUrl} — application/zip。"""
    skill = await db.scalar(select(Skill).where(Skill.slug == skill_slug))
    if skill is None or skill.status != "active" or not skill.distribution_enabled:
        return JSONResponse(status_code=404, content={"detail": "skill not found"})
    ver = await db.scalar(
        select(SkillVersion).where(SkillVersion.skill_id == skill.id, SkillVersion.version == version)
    )
    if ver is None:
        return JSONResponse(status_code=404, content={"detail": "version not found"})
    path = Path(ver.package_path)
    if not path.is_file():
        return JSONResponse(status_code=404, content={"detail": "package missing"})
    fname = f"{skill_slug}-{version}.zip"
    return FileResponse(
        path=path,
        filename=fname,
        media_type="application/zip",
        headers={"Cache-Control": "public, max-age=300"},
    )


__all__ = ["router"]
