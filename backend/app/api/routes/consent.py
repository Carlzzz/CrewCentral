import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.auth.service import bind_user_to_request, get_auth_request_by_state
from app.auth.token_service import issue_token_pair
from app.core.forwarded_for import client_ip
from app.db.devices_session import DevicesAsyncSessionLocal
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ConsentBody
from app.schemas.rc import rc_err, rc_ok
from app.services.device_registry import register_or_update_device
from app.services.heartbeat_pipeline import process_heartbeat

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth-api"])


@router.get("/consent/context")
async def consent_context(
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    uid = request.session.get("uid")
    if not uid:
        return JSONResponse(status_code=401, content={"rc": 1, "message": "未登录"})
    req_row = await get_auth_request_by_state(db, state)
    if req_row is None:
        return rc_err("授权请求无效")
    # 已登录但未再走一遍登录表单时，授权请求可能尚未绑定用户（仅「继续客户端授权」场景）
    if req_row.user_id is None:
        await bind_user_to_request(db, req_row, str(uid))
        await db.commit()
    elif req_row.user_id != uid:
        return rc_err("授权请求无效")
    return rc_ok(
        {"client_label": req_row.client_label, "device_label": req_row.device_label},
        message="ok",
    )


@router.post("/consent/confirm")
async def confirm_consent(
    request: Request,
    body: ConsentBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    uid = request.session.get("uid")
    sid = request.session.get("sid")
    if not uid or not sid:
        return rc_err("未登录，请先完成账号验证")

    req_row = await get_auth_request_by_state(db, body.state)
    if req_row is None:
        return rc_err("无效或已过期的授权请求")
    if req_row.user_id is None:
        await bind_user_to_request(db, req_row, str(uid))
        await db.commit()
    elif req_row.user_id != uid:
        return rc_err("登录用户与授权请求不一致")

    access, raw_refresh = await issue_token_pair(db, user_id=uid, web_session_id=sid)
    req_row.status = "authorized"
    snap_uuid = req_row.device_uuid
    snap_label = req_row.device_label
    snap_mac = req_row.mac_address
    snap_os = req_row.os_version
    snap_client_ver = req_row.client_version
    snap_platform = req_row.platform
    await db.commit()

    if snap_uuid:
        ip = client_ip(request) or "0.0.0.0"
        hw = {"platform": snap_platform} if snap_platform else None
        try:
            async with DevicesAsyncSessionLocal() as ds:
                dev = await register_or_update_device(
                    ds,
                    owner_user_id=str(uid),
                    device_uuid=snap_uuid,
                    client_ip=ip,
                    name=snap_label,
                    mac_address=snap_mac,
                    os_version=snap_os,
                    client_version=snap_client_ver,
                    hardware=hw,
                )
                await process_heartbeat(
                    ds,
                    device=dev,
                    client_ip=ip,
                    current_skill_slug=None,
                )
                await ds.commit()
        except Exception:
            log.exception("consent device register failed user=%s device_uuid=%s", uid, snap_uuid)

    user_row = await db.scalar(select(User).where(User.id == uid))
    params: dict[str, str] = {
        "access_token": access,
        "refresh_token": raw_refresh,
        "state": body.state,
    }
    if user_row and user_row.display_name:
        params["display_name"] = user_row.display_name
    elif user_row and user_row.email:
        params["display_name"] = user_row.email.split("@")[0]
    q = urlencode(params)
    callback_uri = f"{req_row.redirect_scheme}://auth?{q}"
    return rc_ok({"callback_uri": callback_uri, "state": body.state})


@router.post("/consent/cancel")
async def cancel_consent(
    request: Request,
    body: ConsentBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    uid = request.session.get("uid")
    if not uid:
        return rc_err("未登录")

    req_row = await get_auth_request_by_state(db, body.state)
    if req_row is None:
        return rc_err("无效或已过期的授权请求")
    if req_row.user_id and req_row.user_id != uid:
        return rc_err("用户不一致")

    req_row.status = "cancelled"
    await db.commit()
    return rc_ok({"cancelled": True}, message="已取消授权")
