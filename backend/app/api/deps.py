from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token_optional_type
from app.db.session import get_db
from app.models.user import User
from app.auth.role_service import get_user_role, menus_for_role

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> str:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        payload = decode_token_optional_type(creds.credentials, "access")
        sub = payload.get("sub")
        if not sub or not isinstance(sub, str):
            raise HTTPException(status_code=401, detail="invalid token")
        return sub
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token") from None


async def require_admin(
    user_id: Annotated[str, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    row = await db.scalar(select(User).where(User.id == user_id))
    if row is None or not row.is_admin:
        raise HTTPException(status_code=403, detail="admin required")
    return row


async def require_admin_session(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Admin guard for browser Session cookie (`uid`) — OpenAPI `sessionAuth`."""
    uid = request.session.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="未登录")
    row = await db.scalar(select(User).where(User.id == uid))
    if row is None or not row.is_admin:
        raise HTTPException(status_code=403, detail="admin required")
    return row


def require_session_permission(permission: str):
    async def _guard(
        request: Request,
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> User:
        uid = request.session.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="未登录")
        row = await db.scalar(select(User).where(User.id == uid))
        if row is None:
            raise HTTPException(status_code=401, detail="用户不存在")
        role = await get_user_role(db, user_id=row.id, is_admin=row.is_admin)
        perms = set(menus_for_role(role))
        if "users.manage" in perms or permission in perms:
            return row
        raise HTTPException(status_code=403, detail="permission denied")

    return _guard


async def get_session_user_id(request: Request) -> str:
    uid = request.session.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="未登录")
    return str(uid)
