"""Client-facing user API (JWT Bearer)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.auth.role_service import get_user_role, menus_for_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/users", tags=["users-client"])


@router.get("/me")
async def get_me(
    user_id: Annotated[str, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")
    role = await get_user_role(db, user_id=u.id, is_admin=u.is_admin)
    return rc_ok({
        "id": u.id,
        "email": u.email,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "role": role,
        "menu_permissions": menus_for_role(role),
    })
