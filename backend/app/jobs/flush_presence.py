"""Batch flush Redis `presence:*` snapshots into PostgreSQL/SQLite device tables."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.redis import acquire_or_renew_leader, get_redis, release_leader
from app.db.devices_session import DevicesAsyncSessionLocal
from app.models.device import Device, DevicePresence
from app.services.geo_ip import resolve_geo_label

# Identifies this worker process when contending for the flush leader lease.
_LEADER_NAME = "flush_presence"
_LEADER_TOKEN = f"{os.getpid()}:{uuid.uuid4().hex[:8]}"

log = logging.getLogger(__name__)


async def flush_presence_once() -> int:
    r = await get_redis()
    if r is None:
        return 0

    keys: list[str] = []
    async for raw_key in r.scan_iter("presence:*", count=80):
        k = raw_key.decode() if isinstance(raw_key, bytes) else raw_key
        keys.append(k)

    updated = 0
    async with DevicesAsyncSessionLocal() as session:
        flushed_device_ids: set[str] = set()

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

            if not is_stale_presence(last_seen):
                dev.status = "online"
            else:
                if dev.status == "online":
                    dev.status = "offline"

            pr = await session.scalar(select(DevicePresence).where(DevicePresence.device_id == device_id))
            if pr is None:
                session.add(DevicePresence(device_id=device_id, last_seen_at=last_seen))
            else:
                pr.last_seen_at = last_seen
            flushed_device_ids.add(device_id)
            updated += 1

        # 清理：将没有活跃 Redis key 但 status 仍为 online 的设备标记为 offline
        stale_devs = (
            await session.scalars(
                select(Device).where(Device.status == "online")
            )
        ).all()
        pmap = {
            r.device_id: r
            for r in (await session.scalars(select(DevicePresence))).all()
        }
        for dev in stale_devs:
            if dev.id in flushed_device_ids:
                continue
            pr = pmap.get(dev.id)
            if is_stale_presence(pr.last_seen_at if pr else None):
                dev.status = "offline"

        await session.commit()

    return updated


async def flush_presence_loop(stop: asyncio.Event) -> None:
    """Run the presence flush on a single worker at a time.

    With multiple uvicorn workers each process starts this loop, but only the
    one holding the Redis leader lease does the actual flush; the rest idle and
    stand by to take over if the leader dies. The lease TTL is a few intervals
    long so the leader keeps it across cycles, while a crashed leader's lease
    expires quickly enough for a standby to pick up the work.

    When Redis is disabled ``acquire_or_renew_leader`` returns False and the
    flush is skipped — that is correct, because ``flush_presence_once`` has
    nothing to do without Redis (heartbeats write the DB synchronously).
    """
    interval = 30
    lease_ttl = interval * 3
    was_leader = False
    try:
        while not stop.is_set():
            try:
                is_leader = await acquire_or_renew_leader(_LEADER_NAME, _LEADER_TOKEN, lease_ttl)
                if is_leader:
                    if not was_leader:
                        log.info("flush_presence: acquired leader lease (token=%s)", _LEADER_TOKEN)
                    was_leader = True
                    n = await flush_presence_once()
                    if n:
                        log.debug("flush_presence: updated %s devices", n)
                elif was_leader:
                    log.info("flush_presence: lost leader lease (token=%s)", _LEADER_TOKEN)
                    was_leader = False
            except Exception:
                log.exception("flush_presence failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except TimeoutError:
                pass
    finally:
        if was_leader:
            try:
                await release_leader(_LEADER_NAME, _LEADER_TOKEN)
            except Exception:
                log.debug("flush_presence: leader release failed on shutdown", exc_info=True)


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
