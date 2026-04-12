"""Idempotent device upsert by (device_uuid, owner_user_id)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis, hset_presence
from app.models.device import Device
from app.services.geo_ip import resolve_geo_label


async def register_or_update_device(
    session: AsyncSession,
    *,
    owner_user_id: str,
    device_uuid: str,
    client_ip: str,
    name: str | None,
    mac_address: str | None,
    os_version: str | None,
    client_version: str | None,
    hardware: dict[str, Any] | None,
) -> Device:
    geo = await resolve_geo_label(client_ip)

    if mac_address:
        stmt = select(Device).where(
            Device.mac_address == mac_address,
            Device.owner_user_id == owner_user_id,
        ).order_by(Device.updated_at.desc()).limit(1)
    else:
        stmt = select(Device).where(
            Device.device_uuid == device_uuid,
            Device.owner_user_id == owner_user_id,
        ).limit(1)
        
    row = await session.scalar(stmt)
    if row is None:
        row = Device(
            device_uuid=device_uuid,
            owner_user_id=owner_user_id,
            name=name,
            mac_address=mac_address,
            last_ip=client_ip,
            last_ip_geo=geo,
            os_version=os_version,
            client_version=client_version,
            hardware_snapshot=hardware,
            status="offline",
        )
        session.add(row)
        await session.flush()
    else:
        row.device_uuid = device_uuid
        row.name = name or row.name
        row.mac_address = mac_address or row.mac_address
        row.os_version = os_version or row.os_version
        row.client_version = client_version or row.client_version
        row.last_ip = client_ip
        row.last_ip_geo = geo or row.last_ip_geo
        if hardware is not None:
            row.hardware_snapshot = hardware
        await session.flush()

    r = await get_redis()
    if r is not None:
        await hset_presence(
            row.id,
            {
                "ip": client_ip,
                "device_uuid": device_uuid,
            },
        )

    return row
