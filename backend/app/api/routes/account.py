from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/account", tags=["account"])


class ChangePasswordBody(BaseModel):
    current_password: str = Field(..., min_length=6, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/change-password")
async def change_password(
    request: Request,
    body: ChangePasswordBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    uid = request.session.get("uid")
    if not uid:
        return rc_err("未登录")
    u = await db.scalar(select(User).where(User.id == str(uid)))
    if u is None:
        return rc_err("用户不存在")
    if not u.password_hash or not verify_password(body.current_password, u.password_hash):
        return rc_err("当前密码错误")
    if body.current_password == body.new_password:
        return rc_err("新密码不能与当前密码一致")
    u.password_hash = hash_password(body.new_password)
    await db.commit()
    return rc_ok(message="密码已更新")

