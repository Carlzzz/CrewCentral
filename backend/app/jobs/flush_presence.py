"""Batch flush Redis `presence:*` snapshots into PostgreSQL/SQLite device tables."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.redis import get_redis
from app.db.devices_session import DevicesAsyncSessionLocal
from app.models.device import Device, DevicePresence
from app.services.geo_ip import resolve_geo_label

log = logging.getLogger(__name__)


async def flush_presence_once() -> int:
    r = await get_redis()
    if r is None:
        return 0

    keys: list[str] = []
    async for raw_key in r.scan_iter("presence:*", count=80):
        k = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
        keys.append(k)

    if not keys:
        return 0

    updated = 0
    async with DevicesAsyncSessionLocal() as session:
        for key in keys:
            device_id = key.split(":", 1)[-1]
            raw = await r.hgetall(key)
            if not raw:
                continue
            last_seen_raw = raw.get("last_seen")
            ip = raw.get("ip")
            if not last_seen_raw:
                continue
            try:
                last_seen = datetime.fromisoformat(last_seen_raw.replace("Z", "+00:00"))
            except ValueError:
                continue

            dev = await session.scalar(select(Device).where(Device.id == device_id))
            if dev is None:
                continue
            if ip:
                dev.last_ip = ip
                geo = await resolve_geo_label(ip)
                if geo:
                    dev.last_ip_geo = geo
            dev.status = "online"

            pr = await session.scalar(select(DevicePresence).where(DevicePresence.device_id == device_id))
            if pr is None:
                session.add(DevicePresence(device_id=device_id, last_seen_at=last_seen))
            else:
                pr.last_seen_at = last_seen
            updated += 1

        await session.commit()

    return updated


async def flush_presence_loop(stop: asyncio.Event) -> None:
    interval = 30
    while not stop.is_set():
        try:
            n = await flush_presence_once()
            if n:
                log.debug("flush_presence: updated %s devices", n)
        except Exception:
            log.exception("flush_presence failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            pass


def offline_cutoff() -> datetime:
    minutes = get_settings().offline_threshold_minutes
    return datetime.now(UTC) - timedelta(minutes=minutes)


def is_stale_presence(last_seen_at: datetime | None) -> bool:
    if last_seen_at is None:
        return True
    cutoff = offline_cutoff()
    if last_seen_at.tzinfo is None:
        return last_seen_at < cutoff.replace(tzinfo=None)
    return last_seen_at < cutoff
