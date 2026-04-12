"""Device allow / block / kick checks (PG + Redis)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_kick_flag
from app.models.blocklist import BlocklistEntry
from app.models.device import Device
from app.schemas.device_errors import RC_DEVICE_BLOCKED, RC_DEVICE_KICKED


class DevicePolicyError(Exception):
    def __init__(self, rc: int, message: str) -> None:
        self.rc = rc
        self.message = message
        super().__init__(message)


async def get_device_for_user(
    session: AsyncSession, *, device_uuid: str, owner_user_id: str
) -> Device | None:
    return await session.scalar(
        select(Device).where(
            Device.device_uuid == device_uuid,
            Device.owner_user_id == owner_user_id,
        )
    )


async def assert_device_allowed(session: AsyncSession, device: Device) -> None:
    if await get_kick_flag(device.device_uuid):
        raise DevicePolicyError(RC_DEVICE_KICKED, "设备已被强制下线")

    if device.status == "blocked":
        raise DevicePolicyError(RC_DEVICE_BLOCKED, "设备已封禁")

    active = await session.scalar(
        select(BlocklistEntry).where(
            BlocklistEntry.device_id == device.id,
            BlocklistEntry.revoked_at.is_(None),
        )
    )
    if active is not None:
        raise DevicePolicyError(RC_DEVICE_BLOCKED, "设备在黑名单中")
