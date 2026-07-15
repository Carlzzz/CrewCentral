"""Client device APIs (JWT Bearer)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.forwarded_for import client_ip
from app.core.redis import clear_kick_flag
from app.db.devices_session import get_db_devices
from app.schemas.device import DeviceHeartbeatBody, DeviceRegisterBody
from app.schemas.rc import rc_ok
from app.services.device_policy import DevicePolicyError, assert_device_allowed, get_device_for_user
from app.services.device_registry import register_or_update_device
from app.services.heartbeat_pipeline import process_heartbeat

router = APIRouter(prefix="/devices", tags=["devices-client"])


@router.post("/register")
async def register_device(
    request: Request,
    body: DeviceRegisterBody,
    user_id: Annotated[str, Depends(get_current_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_devices)],
) -> dict:
    existing = await get_device_for_user(
        session,
        device_uuid=body.device_uuid,
        owner_user_id=user_id,
        mac_address=body.mac_address,
    )
    if existing is not None:
        try:
            await assert_device_allowed(session, existing)
        except DevicePolicyError as e:
            if e.rc == 40302:
                await clear_kick_flag(existing.device_uuid)
            else:
                return JSONResponse(
                    status_code=403, content={"rc": e.rc, "message": e.message, "data": None}
                )

    ip = client_ip(request)
    await register_or_update_device(
        session,
        owner_user_id=user_id,
        device_uuid=body.device_uuid,
        client_ip=ip,
        name=body.name,
        mac_address=body.mac_address,
        os_version=body.os_version,
        client_version=body.client_version,
        hardware=body.hardware,
    )
    await session.commit()
    return rc_ok(message="ok")


@router.post("/heartbeat")
async def heartbeat(
    request: Request,
    body: DeviceHeartbeatBody,
    user_id: Annotated[str, Depends(get_current_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_devices)],
) -> dict:
    device = await get_device_for_user(
        session,
        device_uuid=body.device_uuid,
        owner_user_id=user_id,
        mac_address=body.mac_address,
    )
    if device is None:
        return JSONResponse(
            status_code=404, content={"rc": 1, "message": "设备未注册", "data": None}
        )
    try:
        await assert_device_allowed(session, device)
    except DevicePolicyError as e:
        return JSONResponse(
            status_code=403, content={"rc": e.rc, "message": e.message, "data": None}
        )

    ip = client_ip(request)
    await process_heartbeat(
        session,
        device=device,
        client_ip=ip,
        current_skill_slug=body.current_skill_slug,
    )
    await session.commit()
    return rc_ok(message="ok")
