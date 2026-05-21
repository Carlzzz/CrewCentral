"""Public download landing data — anonymous GET (constitution: contract-first)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.rc import rc_ok
from app.services.release_registry import get_aggregated_platform_assets
from app.services.ua_platform import infer_platform

router = APIRouter(prefix="/public/releases", tags=["releases-public"])
log = logging.getLogger(__name__)
UPLOAD_DIR = Path("uploads") / "releases"


@router.get("/download-context")
async def download_context(
    db: AsyncSession = Depends(get_db),
    user_agent: str | None = Header(default=None, alias="User-Agent"),
    sec_ch_ua_platform: str | None = Header(default=None, alias="Sec-CH-UA-Platform"),
) -> dict[str, Any]:
    settings = get_settings()
    latest, aggregated_assets = await get_aggregated_platform_assets(db)
    if latest is None:
        log.info("download-context: no published client release")
        return rc_ok(
            {
                "version": "",
                "published_at": None,
                "slogan": settings.client_download_default_slogan,
                "logo_url": settings.client_download_default_logo_url or "",
                "recommended_platform": None,
                "primary_asset": None,
                "all_assets": [],
                "release_notes_excerpt": "",
                "changelog_entries": [],
            },
            message="暂无发布",
        )

    guess = infer_platform(user_agent, sec_ch_ua_platform)
    recommended = None if guess == "unknown" else guess

    by_pf = {a["platform"]: a for a in aggregated_assets}

    primary = None
    if recommended and recommended in by_pf:
        primary = by_pf[recommended]
    elif recommended and recommended not in by_pf:
        primary = None

    slogan = latest.slogan or settings.client_download_default_slogan
    logo = latest.logo_url or settings.client_download_default_logo_url or ""

    notes = (latest.release_notes or "")[:2000]
    changelog = latest.changelog_entries or []

    return rc_ok(
        {
            "version": latest.version,
            "published_at": latest.published_at.isoformat() if latest.published_at else None,
            "slogan": slogan,
            "logo_url": logo,
            "recommended_platform": recommended,
            "primary_asset": primary,
            "all_assets": aggregated_assets,
            "release_notes_excerpt": notes,
            "changelog_entries": changelog,
        }
    )


@router.get("/files/{filename}")
async def public_release_file(
    filename: str,
    download_name: str | None = Query(default=None),
) -> FileResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    target = (UPLOAD_DIR / filename).resolve()
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    safe_download_name = Path(download_name).name if download_name else filename
    return FileResponse(
        path=target,
        filename=safe_download_name,
        content_disposition_type="attachment",
    )
