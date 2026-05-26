import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.token_service import refresh_token_pair
from app.core.config import get_settings
from app.core.security import decode_token_optional_type
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import RefreshBody
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/auth", tags=["auth-api"])
log = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


@router.post("/refresh")
async def refresh_tokens(
    body: RefreshBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    pair = await refresh_token_pair(db, raw_refresh=body.refresh_token)
    if pair is None:
        log.info("refresh rejected: invalid token")
        return rc_err("续期凭证无效或已废除")
    access, refresh = pair
    await db.commit()
    s = get_settings()
    return rc_ok(
        {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "Bearer",
            "expires_in": s.access_token_expire_minutes * 60,
        }
    )


@router.post("/token/introspect")
async def introspect_token(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """供 Proxy 调用的 token 验证端点：验证 access_token 并返回用户信息。"""
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        payload = decode_token_optional_type(creds.credentials, "access")
        sub = payload.get("sub")
        if not sub or not isinstance(sub, str):
            raise HTTPException(status_code=401, detail="invalid token")
        u = await db.scalar(select(User).where(User.id == sub))
        if u is None:
            raise HTTPException(status_code=401, detail="user not found")
        
        from app.auth.role_service import get_user_role
        from app.auth.role_model_permission_service import get_role_model_permissions
        role = await get_user_role(db, user_id=u.id, is_admin=u.is_admin)
        allowed_models = await get_role_model_permissions(db, role)
        log.debug("introspect user=%s role=%s allowed_models=%s", u.id, role, allowed_models)

        return rc_ok({
            "user_id": u.id,
            "name": u.display_name or u.email,
            "allowed_models": allowed_models,
        })
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token") from None
