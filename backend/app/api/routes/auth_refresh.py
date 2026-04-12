import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.token_service import refresh_token_pair
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.auth import RefreshBody
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/auth", tags=["auth-api"])
log = logging.getLogger(__name__)


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
