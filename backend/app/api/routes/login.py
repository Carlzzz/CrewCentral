from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import bind_user_to_request, get_auth_request_by_state
from app.auth.token_service import ensure_dev_user
from app.core.config import get_settings
from app.core.security import verify_password
from app.db.session import get_db
from app.models.session import WebSession
from app.models.user import User
from app.schemas.auth import LoginBody
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/auth", tags=["auth-api"])


@router.post("/login")
async def api_login(
    request: Request,
    body: LoginBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    req_row = await get_auth_request_by_state(db, body.state)
    if req_row is None:
        return rc_err("无效或已过期的 state")

    user = await db.scalar(select(User).where(User.email == body.email))
    if user is None:
        return rc_err("账号或密码错误")

    if settings.skip_auth:
        await ensure_dev_user(db)
    elif not user.password_hash or not verify_password(body.password, user.password_hash):
        return rc_err("账号或密码错误")

    await bind_user_to_request(db, req_row, user.id)
    ws = WebSession(user_id=user.id, authorization_request_id=req_row.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)

    request.session["uid"] = user.id
    request.session["sid"] = ws.id

    bp = settings.base_path.rstrip("/") or ""
    return rc_ok(
        {
            "redirect": f"{bp}/consent?state={body.state}",
        },
        message="登录成功",
    )
