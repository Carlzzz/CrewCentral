"""Persist admin actions + lightweight device logs."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_audit import AdminDeviceAction, DeviceLog


async def record_admin_action(
    session: AsyncSession,
    *,
    actor_user_id: str,
    device_id: str,
    action: str,
    payload: dict[str, Any] | None = None,
) -> None:
    session.add(
        AdminDeviceAction(
            actor_user_id=actor_user_id,
            device_id=device_id,
            action=action,
            payload=payload,
        )
    )


async def append_device_log(
    session: AsyncSession,
    *,
    device_id: str,
    message: str,
    level: str = "info",
) -> None:
    session.add(DeviceLog(device_id=device_id, level=level, message=message))
