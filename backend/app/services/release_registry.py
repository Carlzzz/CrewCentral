"""Release registry: semver comparison, latest published, publish validation."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client_release import ClientRelease
from app.models.client_release_asset import ClientReleaseAsset
from app.schemas.releases import ReleaseAssetIn


def semver_tuple(v: str) -> tuple[int, int, int]:
    s = v.strip()
    m = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?", s)
    if not m:
        return (0, 0, 0)
    major = int(m.group(1) or 0)
    minor = int(m.group(2) or 0)
    patch = int(m.group(3) or 0)
    return (major, minor, patch)


def compare_semver(a: str, b: str) -> int:
    """Return >0 if a>b, 0 if equal, <0 if a<b."""
    ta, tb = semver_tuple(a), semver_tuple(b)
    if ta > tb:
        return 1
    if ta < tb:
        return -1
    return 0


async def get_latest_published(session: AsyncSession) -> ClientRelease | None:
    result = await session.scalars(
        select(ClientRelease)
        .where(ClientRelease.status == "published")
        .options(selectinload(ClientRelease.assets))
    )
    rows = list(result.all())
    if not rows:
        return None
    best = rows[0]
    for r in rows[1:]:
        if compare_semver(r.version, best.version) > 0:
            best = r
    return best


def validate_assets_for_publish(
    enabled_platforms: list[str],
    assets: list[ReleaseAssetIn],
) -> str | None:
    """Return error message or None if OK."""
    if not enabled_platforms:
        return "至少启用一个平台"
    by_platform = {a.platform: a for a in assets}
    for p in enabled_platforms:
        a = by_platform.get(p)
        if a is None:
            return f"平台 {p} 缺少资产记录"
        if not a.download_url.strip() or not a.md5.strip() or not a.sha256.strip():
            return f"平台 {p} 必须提供 download_url、md5、sha256"
    return None


def asset_to_public(a: ClientReleaseAsset) -> dict[str, Any]:
    return {
        "platform": a.platform,
        "download_url": a.download_url,
        "file_name": a.file_name,
        "file_size_bytes": a.file_size_bytes,
        "md5": a.md5,
        "sha256": a.sha256,
    }


async def get_aggregated_platform_assets(
    session: AsyncSession,
) -> tuple[ClientRelease | None, list[dict[str, Any]]]:
    """Return (latest_release, aggregated_assets).

    For each platform, pick the asset from the highest-semver published release
    that provides that platform.  This ensures uploading a Mac-only release does
    not hide existing Windows downloads from an earlier release.
    """
    result = await session.scalars(
        select(ClientRelease)
        .where(ClientRelease.status == "published")
        .options(selectinload(ClientRelease.assets))
    )
    rows = list(result.all())
    if not rows:
        return None, []

    # Sort descending by semver
    rows.sort(key=lambda r: semver_tuple(r.version), reverse=True)
    latest = rows[0]

    # Collect best (highest-version) asset per platform
    best_per_platform: dict[str, dict[str, Any]] = {}
    for r in rows:
        for a in (r.assets or []):
            if a.platform not in best_per_platform:
                best_per_platform[a.platform] = asset_to_public(a)

    return latest, list(best_per_platform.values())
