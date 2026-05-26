import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.auth.token_service import revoke_web_session
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/sessions", tags=["admin"])
log = logging.getLogger(__name__)


@router.post("/{session_id}/revoke")
async def revoke_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("users.manage")),
) -> dict:
    try:
        uuid.UUID(session_id)
    except ValueError:
        return rc_err("非法 session_id")

    ok = await revoke_web_session(db, session_id)
    if not ok:
        return rc_err("会话不存在")
    await db.commit()
    log.info("session revoked: session_id=%s actor=%s", session_id, admin.id)
    return rc_ok(message="已废除会话")
