"""Redis connection + key helpers for device presence / geo cache (`presence:`, `geo:`, `stats:`)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.config import get_settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

log = logging.getLogger(__name__)
_redis: Redis | None = None


async def get_redis() -> Redis | None:
    global _redis
    settings = get_settings()
    if not settings.redis_url:
        return None
    if _redis is None:
        from redis.asyncio import Redis as RedisCls

        _redis = RedisCls.from_url(settings.redis_url, decode_responses=True)
        log.info("Redis connected for device features")
    return _redis


def presence_key(device_id: str) -> str:
    return f"presence:{device_id}"


def geo_key(ip: str) -> str:
    return f"geo:{ip}"


def stats_key() -> str:
    return "stats:devices"


def kick_key(device_uuid: str) -> str:
    return f"kick:{device_uuid}"


async def hset_presence(device_id: str, mapping: dict[str, str]) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.hset(presence_key(device_id), mapping=mapping)


async def hgetall_presence(device_id: str) -> dict[str, str] | None:
    r = await get_redis()
    if r is None:
        return None
    raw = await r.hgetall(presence_key(device_id))
    return raw or None


async def cache_geo(ip: str, label: str, ttl_sec: int = 86400) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.set(geo_key(ip), label, ex=ttl_sec)


async def get_cached_geo(ip: str) -> str | None:
    r = await get_redis()
    if r is None:
        return None
    return await r.get(geo_key(ip))


async def set_kick_flag(device_uuid: str, ttl_sec: int = 3600) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.set(kick_key(device_uuid), "1", ex=ttl_sec)


async def get_kick_flag(device_uuid: str) -> bool:
    r = await get_redis()
    if r is None:
        return False
    v = await r.get(kick_key(device_uuid))
    return v is not None


async def clear_kick_flag(device_uuid: str) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.delete(kick_key(device_uuid))


async def expire_presence(device_id: str, ttl_sec: int = 3600) -> None:
    r = await get_redis()
    if r is None:
        return
    await r.expire(presence_key(device_id), ttl_sec)
