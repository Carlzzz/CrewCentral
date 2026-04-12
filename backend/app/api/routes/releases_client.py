"""Client update check — anonymous GET `/releases/latest` (Bearer optional, not required)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.rc import rc_ok
from app.services.release_registry import asset_to_public, compare_semver, get_latest_published

router = APIRouter(prefix="/releases", tags=["releases-client"])
log = logging.getLogger(__name__)


@router.get("/latest")
async def latest_release(
    db: AsyncSession = Depends(get_db),
    current_version: str | None = Query(default=None),
) -> dict[str, Any]:
    latest = await get_latest_published(db)
    if latest is None:
        log.info("releases/latest: no published release")
        return rc_ok(
            {
                "is_latest": True,
                "current_version": current_version,
                "target_version": None,
                "update_policy": None,
                "assets": [],
                "release_notes_excerpt": None,
            },
            message="暂无发布",
        )

    assets = [asset_to_public(a) for a in latest.assets]
    notes = (latest.release_notes or "")[:4000]

    if not current_version or not current_version.strip():
        return rc_ok(
            {
                "is_latest": False,
                "current_version": current_version,
                "target_version": latest.version,
                "update_policy": latest.update_policy,
                "assets": assets,
                "release_notes_excerpt": notes,
            }
        )

    cur = current_version.strip()
    if compare_semver(cur, latest.version) >= 0:
        return rc_ok(
            {
                "is_latest": True,
                "current_version": cur,
                "target_version": None,
                "update_policy": None,
                "assets": assets,
                "release_notes_excerpt": notes,
            }
        )

    return rc_ok(
        {
            "is_latest": False,
            "current_version": cur,
            "target_version": latest.version,
            "update_policy": latest.update_policy,
            "assets": assets,
            "release_notes_excerpt": notes,
        }
    )
