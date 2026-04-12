"""GeoIP label (省/市) with Redis cache `geo:{ip}`."""

from __future__ import annotations

import logging
from pathlib import Path

import geoip2.database
import geoip2.errors

from app.core.config import get_settings
from app.core.redis import cache_geo, get_cached_geo

log = logging.getLogger(__name__)
_reader: geoip2.database.Reader | None = None


def _reader_open() -> geoip2.database.Reader | None:
    global _reader
    if _reader is not None:
        return _reader
    path = get_settings().geoip_mmdb_path
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        log.warning("GEOIP_MMDB_PATH set but file missing: %s", path)
        return None
    _reader = geoip2.database.Reader(str(p))
    return _reader


async def resolve_geo_label(ip: str) -> str | None:
    cached = await get_cached_geo(ip)
    if cached:
        return cached

    reader = _reader_open()
    if reader is None:
        return None
    try:
        rec = reader.city(ip)
        parts = []
        if rec.subdivisions:
            parts.append(rec.subdivisions[0].names.get("zh-CN") or rec.subdivisions[0].iso_code or "")
        if rec.city and rec.city.names:
            parts.append(rec.city.names.get("zh-CN") or rec.city.name or "")
        label = " ".join(p for p in parts if p).strip() or None
        if label:
            await cache_geo(ip, label)
        return label
    except (geoip2.errors.AddressNotFoundError, ValueError, OSError):
        return None
