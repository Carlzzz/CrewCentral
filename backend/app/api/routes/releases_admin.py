"""Admin release management — Session + admin only (constitution)."""

from __future__ import annotations

import logging
import os
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.db.session import get_db
from app.models.client_release import ClientRelease
from app.models.client_release_asset import ClientReleaseAsset
from app.models.client_release_audit import ClientReleaseAudit
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok
from app.schemas.releases import ReleaseAssetIn, ReleaseCreateBody, ReleasePatchBody
from app.services.release_registry import validate_assets_for_publish

router = APIRouter(prefix="/admin/releases", tags=["releases-admin"])
log = logging.getLogger(__name__)
UPLOAD_DIR = Path("uploads") / "releases"


def _audit(
    db: AsyncSession,
    *,
    release_id: str,
    action: str,
    actor: User,
    summary: str | None,
) -> None:
    db.add(
        ClientReleaseAudit(
            id=str(uuid.uuid4()),
            release_id=release_id,
            action=action,
            actor_id=actor.id,
            actor_name=actor.display_name or actor.email,
            diff_summary=summary,
        )
    )


def _serialize(r: ClientRelease) -> dict[str, Any]:
    assets = [
        {
            "platform": a.platform,
            "download_url": a.download_url,
            "file_name": a.file_name,
            "md5": a.md5,
            "sha256": a.sha256,
            "file_size_bytes": a.file_size_bytes,
        }
        for a in (r.assets or [])
    ]
    return {
        "id": r.id,
        "version": r.version,
        "release_notes": r.release_notes,
        "changelog_entries": r.changelog_entries or [],
        "update_policy": r.update_policy,
        "status": r.status,
        "published_at": r.published_at.isoformat() if r.published_at else None,
        "logo_url": r.logo_url,
        "slogan": r.slogan,
        "enabled_platforms": r.enabled_platforms or [],
        "assets": assets,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


async def _replace_assets(
    db: AsyncSession,
    release_id: str,
    assets: list[ReleaseAssetIn],
) -> None:
    await db.execute(delete(ClientReleaseAsset).where(ClientReleaseAsset.release_id == release_id))
    for a in assets:
        db.add(
            ClientReleaseAsset(
                id=str(uuid.uuid4()),
                release_id=release_id,
                platform=a.platform,
                download_url=a.download_url,
                file_name=a.file_name,
                md5=a.md5,
                sha256=a.sha256,
                file_size_bytes=a.file_size_bytes,
            )
        )


@router.get("")
async def list_releases(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    rows = await db.scalars(
        select(ClientRelease).order_by(ClientRelease.created_at.desc()).options(selectinload(ClientRelease.assets))
    )
    items = [_serialize(r) for r in rows.all()]
    return rc_ok({"items": items})


@router.get("/{release_id}")
async def get_release(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    r = await db.scalar(
        select(ClientRelease)
        .where(ClientRelease.id == release_id)
        .options(selectinload(ClientRelease.assets))
    )
    if r is None:
        return rc_err("发布不存在")
    return rc_ok(_serialize(r))


@router.post("")
async def create_release(
    body: ReleaseCreateBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    if body.status == "published":
        err = validate_assets_for_publish(body.enabled_platforms, body.assets)
        if err:
            return rc_err(err)
    rel = ClientRelease(
        id=str(uuid.uuid4()),
        version=body.version.strip(),
        release_notes=body.release_notes,
        changelog_entries=[e.model_dump() for e in (body.changelog_entries or [])],
        update_policy=body.update_policy,
        status=body.status,
        published_at=datetime.now(timezone.utc) if body.status == "published" else None,
        enabled_platforms=list(body.enabled_platforms),
        logo_url=body.logo_url,
        slogan=body.slogan,
    )
    db.add(rel)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return rc_err("版本号已存在")
    await _replace_assets(db, rel.id, body.assets)
    _audit(
        db,
        release_id=rel.id,
        action="create",
        actor=admin,
        summary=f"version={rel.version} status={rel.status}",
    )
    await db.commit()
    await db.refresh(rel, ["assets"])
    log.info("client_release created id=%s version=%s actor=%s", rel.id, rel.version, admin.id)
    return rc_ok(_serialize(rel), message="创建成功")


@router.patch("/{release_id}")
async def patch_release(
    release_id: str,
    body: ReleasePatchBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    r = await db.scalar(
        select(ClientRelease)
        .where(ClientRelease.id == release_id)
        .options(selectinload(ClientRelease.assets))
    )
    if r is None:
        return rc_err("发布不存在")
    if r.status == "archived":
        return rc_err("已归档的发布不可修改")

    if body.version is not None:
        r.version = body.version.strip()
    if body.release_notes is not None:
        r.release_notes = body.release_notes
    if body.changelog_entries is not None:
        r.changelog_entries = [e.model_dump() for e in body.changelog_entries]
    if body.update_policy is not None:
        r.update_policy = body.update_policy
    if body.enabled_platforms is not None:
        r.enabled_platforms = list(body.enabled_platforms)
    if body.logo_url is not None:
        r.logo_url = body.logo_url
    if body.slogan is not None:
        r.slogan = body.slogan
    if body.assets is not None:
        await _replace_assets(db, r.id, body.assets)

    if r.status == "published":
        err = validate_assets_for_publish(r.enabled_platforms, _assets_from_release(r))
        if err:
            await db.rollback()
            return rc_err(err)

    _audit(db, release_id=r.id, action="update", actor=admin, summary=f"version={r.version}")
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return rc_err("版本号已存在")
    await db.refresh(r, ["assets"])
    log.info("client_release updated id=%s actor=%s", r.id, admin.id)
    return rc_ok(_serialize(r), message="更新成功")


def _assets_from_release(r: ClientRelease) -> list[ReleaseAssetIn]:
    return [
        ReleaseAssetIn.model_validate(
            {
                "platform": a.platform,
                "download_url": a.download_url,
                "file_name": a.file_name,
                "md5": a.md5,
                "sha256": a.sha256,
                "file_size_bytes": a.file_size_bytes,
            }
        )
        for a in (r.assets or [])
    ]


@router.post("/{release_id}/publish")
async def publish_release(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    r = await db.scalar(
        select(ClientRelease)
        .where(ClientRelease.id == release_id)
        .options(selectinload(ClientRelease.assets))
    )
    if r is None:
        return rc_err("发布不存在")
    if r.status == "published":
        return rc_err("已是发布状态")
    if r.status == "archived":
        return rc_err("已归档不可发布")

    assets = _assets_from_release(r)
    err = validate_assets_for_publish(r.enabled_platforms, assets)
    if err:
        return rc_err(err)

    r.status = "published"
    r.published_at = datetime.now(timezone.utc)
    _audit(db, release_id=r.id, action="publish", actor=admin, summary=f"version={r.version}")
    await db.commit()
    await db.refresh(r, ["assets"])
    log.info("client_release published id=%s version=%s actor=%s", r.id, r.version, admin.id)
    return rc_ok(_serialize(r), message="发布成功")


@router.post("/{release_id}/archive")
async def archive_release(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    r = await db.scalar(
        select(ClientRelease)
        .where(ClientRelease.id == release_id)
        .options(selectinload(ClientRelease.assets))
    )
    if r is None:
        return rc_err("发布不存在")
    if r.status == "archived":
        return rc_err("已归档")

    r.status = "archived"
    _audit(db, release_id=r.id, action="archive", actor=admin, summary=f"version={r.version}")
    await db.commit()
    await db.refresh(r, ["assets"])
    log.info("client_release archived id=%s actor=%s", r.id, admin.id)
    return rc_ok(_serialize(r), message="已归档")


@router.post("/upload")
async def upload_release_asset(
    file: UploadFile = File(...),
    _admin: User = Depends(require_session_permission("releases")),
) -> dict[str, Any]:
    settings = get_settings()
    base = settings.base_path.rstrip("/") or ""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    original = file.filename or "package.bin"
    ext = Path(original).suffix
    safe_name = f"{uuid.uuid4().hex}{ext}"
    target = UPLOAD_DIR / safe_name
    size = 0
    md5_h = hashlib.md5()
    sha_h = hashlib.sha256()
    with target.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            md5_h.update(chunk)
            sha_h.update(chunk)
            f.write(chunk)
    await file.close()
    return rc_ok(
        {
            "download_url": f"{settings.frontend_origin}{base}/api/v1/public/releases/files/{safe_name}",
            "file_name": original,
            "file_size_bytes": size,
            "md5": md5_h.hexdigest(),
            "sha256": sha_h.hexdigest(),
            "storage_path": os.fspath(target),
        },
        message="上传成功",
    )


__all__ = ["router"]
