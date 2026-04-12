"""Heartbeat hot path: Redis presence hash; PG updated by flush job or fallback when Redis off."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import expire_presence, get_redis, hset_presence
from app.models.device import Device, DevicePresence


async def process_heartbeat(
    session: AsyncSession,
    *,
    device: Device,
    client_ip: str,
    current_skill_slug: str | None,
) -> None:
    now = datetime.now(UTC)
    if current_skill_slug is not None:
        device.current_skill_slug = current_skill_slug

    r = await get_redis()
    if r is not None:
        await hset_presence(
            device.id,
            {
                "last_seen": now.isoformat(),
                "ip": client_ip,
                "device_uuid": device.device_uuid,
            },
        )
        await expire_presence(device.id, ttl_sec=7200)
        return

    device.last_ip = client_ip
    device.status = "online"
    pr = await session.scalar(select(DevicePresence).where(DevicePresence.device_id == device.id))
    if pr is None:
        session.add(DevicePresence(device_id=device.id, last_seen_at=now))
    else:
        pr.last_seen_at = now
