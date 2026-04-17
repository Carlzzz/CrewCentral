"""Admin device APIs (browser Session cookie + admin role)."""

from __future__ import annotations

import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import and_, exists, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.core.redis import set_kick_flag
from app.db.devices_session import get_db_devices
from app.db.session import get_db
from app.jobs.flush_presence import is_stale_presence, offline_cutoff
from app.models.blocklist import BlocklistEntry
from app.models.device import Device, DevicePresence
from app.models.device_audit import DeviceCommand, DeviceLog
from app.models.user import User
from app.schemas.rc import rc_ok
from app.services.device_audit import append_device_log, record_admin_action

router = APIRouter(prefix="/admin/devices", tags=["devices-admin"])


async def _presence_map(session: AsyncSession) -> dict[str, DevicePresence]:
    rows = (await session.scalars(select(DevicePresence))).all()
    return {r.device_id: r for r in rows}


@router.get("/stats")
async def device_stats(
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    __: User = Depends(require_session_permission("devices")),
) -> dict:
    devices = (await dbs.scalars(select(Device))).all()
    pmap = await _presence_map(dbs)
    cutoff = offline_cutoff()
    total = len(devices)
    online = 0
    offline = 0
    anomaly = 0
    for d in devices:
        pr = pmap.get(d.id)
        recent = False
        if pr is not None:
            dt = pr.last_seen_at
            if dt.tzinfo is None:
                recent = dt >= cutoff.replace(tzinfo=None)
            else:
                recent = dt >= cutoff
                
        if d.status == "error":
            anomaly += 1
            continue
        if d.status == "blocked":
            anomaly += 1
            continue
        if recent:
            online += 1
        else:
            offline += 1

    return rc_ok(
        {
            "total": total,
            "online": online,
            "offline": offline,
            "anomaly": anomaly,
        }
    )


def _apply_status_filter(stmt, status: str | None, cutoff):
    if not status:
        return stmt
    recent = exists(
        select(literal_column("1"))
        .select_from(DevicePresence)
        .where(
            DevicePresence.device_id == Device.id,
            DevicePresence.last_seen_at >= cutoff,
        )
    )
    if status == "blocked":
        return stmt.where(Device.status == "blocked")
    if status == "error":
        return stmt.where(Device.status == "error")
    if status == "online":
        return stmt.where(Device.status != "blocked").where(recent)
    if status == "offline":
        return stmt.where(Device.status != "blocked").where(Device.status != "error").where(
            or_(
                ~recent,
                ~exists(
                    select(literal_column("1"))
                    .select_from(DevicePresence)
                    .where(DevicePresence.device_id == Device.id)
                )
            )
        )
    if status == "anomaly":
        return stmt.where(or_(Device.status == "error", Device.status == "blocked"))
    return stmt


@router.get("")
async def list_devices(
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    db: Annotated[AsyncSession, Depends(get_db)],
    __: User = Depends(require_session_permission("devices")),
    status: str | None = None,
    user_id: str | None = None,
    ip: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    cutoff = offline_cutoff()
    stmt = select(Device)
    if user_id:
        stmt = stmt.where(Device.owner_user_id == user_id)
    if ip:
        stmt = stmt.where(Device.last_ip.isnot(None)).where(Device.last_ip.ilike(f"%{ip}%"))
    stmt = _apply_status_filter(stmt, status, cutoff)

    count_sub = stmt.subquery()
    total = await dbs.scalar(select(func.count()).select_from(count_sub)) or 0

    stmt = stmt.order_by(Device.updated_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await dbs.scalars(stmt)).all()
    pmap = await _presence_map(dbs)

    owner_ids = list({r.owner_user_id for r in rows})
    users: dict[str, User] = {}
    if owner_ids:
        urows = (await db.scalars(select(User).where(User.id.in_(owner_ids)))).all()
        users = {u.id: u for u in urows}

    items = []
    for d in rows:
        pr = pmap.get(d.id)
        recent = False
        if pr is not None:
            dt = pr.last_seen_at
            if dt.tzinfo is None:
                recent = dt >= cutoff.replace(tzinfo=None)
            else:
                recent = dt >= cutoff

        if d.status == "blocked":
            st = "blocked"
        elif d.status == "error":
            st = "error"
        elif recent:
            st = "online"
        else:
            st = "offline"

        u = users.get(d.owner_user_id)
        items.append(
            {
                "id": d.id,
                "device_uuid": d.device_uuid,
                "name": d.name,
                "owner_user_id": d.owner_user_id,
                "owner_display_name": u.display_name if u else None,
                "owner_email": u.email if u else None,
                "os_version": d.os_version,
                "client_version": d.client_version,
                "last_ip": d.last_ip,
                "last_ip_geo": d.last_ip_geo,
                "mac_address": d.mac_address,
                "current_skill_slug": d.current_skill_slug,
                "status": st,
                "last_seen_at": pr.last_seen_at.isoformat() if pr else None,
                "hardware_snapshot": d.hardware_snapshot,
            }
        )

    pages = max(1, math.ceil(total / page_size)) if page_size else 1
    return rc_ok({"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages})


@router.post("/{device_id}/kick")
async def kick_device(
    device_id: str,
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    admin: User = Depends(require_session_permission("devices")),
) -> dict:
    dev = await dbs.get(Device, device_id)
    if dev is None:
        return {"rc": 1, "message": "设备不存在", "data": None}
    await set_kick_flag(dev.device_uuid)
    await record_admin_action(
        dbs, actor_user_id=admin.id, device_id=dev.id, action="kick", payload=None
    )
    await append_device_log(
        dbs, device_id=dev.id, message=f"管理员 {admin.id} 触发强制下线（kick 标记）"
    )
    await dbs.commit()
    return rc_ok(message="已标记强制下线")


@router.post("/{device_id}/block")
async def block_device(
    device_id: str,
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    admin: User = Depends(require_session_permission("devices")),
) -> dict:
    dev = await dbs.get(Device, device_id)
    if dev is None:
        return {"rc": 1, "message": "设备不存在", "data": None}
    dev.status = "blocked"
    dev.blocked_reason = "admin_block"
    dbs.add(
        BlocklistEntry(
            device_id=dev.id,
            reason_code="admin_block",
            created_by=admin.id,
        )
    )
    await record_admin_action(
        dbs, actor_user_id=admin.id, device_id=dev.id, action="block", payload=None
    )
    await append_device_log(dbs, device_id=dev.id, message=f"管理员 {admin.id} 封禁设备")
    await dbs.commit()
    return rc_ok(message="已封禁")


@router.post("/{device_id}/unblock")
async def unblock_device(
    device_id: str,
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    admin: User = Depends(require_session_permission("devices")),
) -> dict:
    dev = await dbs.get(Device, device_id)
    if dev is None:
        return {"rc": 1, "message": "设备不存在", "data": None}
    if dev.status != "blocked":
        return {"rc": 2, "message": "设备未处于封禁状态", "data": None}

    dev.status = "online"
    dev.blocked_reason = None

    from datetime import datetime, UTC
    active_entries = (
        await dbs.scalars(
            select(BlocklistEntry).where(
                BlocklistEntry.device_id == dev.id,
                BlocklistEntry.revoked_at.is_(None),
            )
        )
    ).all()
    now = datetime.now(UTC)
    for entry in active_entries:
        entry.revoked_at = now

    await record_admin_action(
        dbs, actor_user_id=admin.id, device_id=dev.id, action="unblock", payload=None
    )
    await append_device_log(dbs, device_id=dev.id, message=f"管理员 {admin.id} 解封设备")
    await dbs.commit()
    return rc_ok(message="已解封")


@router.post("/{device_id}/reboot")
async def reboot_device(
    device_id: str,
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    admin: User = Depends(require_session_permission("devices")),
) -> dict:
    dev = await dbs.get(Device, device_id)
    if dev is None:
        return {"rc": 1, "message": "设备不存在", "data": None}
    cmd = DeviceCommand(device_id=dev.id, command="reboot", status="pending")
    dbs.add(cmd)
    await dbs.flush()
    await record_admin_action(
        dbs,
        actor_user_id=admin.id,
        device_id=dev.id,
        action="reboot_cmd",
        payload={"command_id": cmd.id},
    )
    await append_device_log(dbs, device_id=dev.id, message=f"管理员 {admin.id} 下发远程重启")
    await dbs.commit()
    return rc_ok({"command_id": cmd.id}, message="已排队远程重启")


@router.get("/{device_id}/logs")
async def device_logs(
    device_id: str,
    _: Request,
    dbs: Annotated[AsyncSession, Depends(get_db_devices)],
    __: User = Depends(require_session_permission("devices")),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    dev = await dbs.get(Device, device_id)
    if dev is None:
        return {"rc": 1, "message": "设备不存在", "data": None}
    rows = (
        await dbs.scalars(
            select(DeviceLog)
            .where(DeviceLog.device_id == device_id)
            .order_by(DeviceLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return rc_ok(
        [
            {
                "id": r.id,
                "level": r.level,
                "message": r.message,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    )
