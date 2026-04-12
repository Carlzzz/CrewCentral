"""Refresh token lifecycle: persist hashes, rotation, session revoke."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.datetime_util import ensure_aware_utc
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token_optional_type,
    hash_token_raw,
    new_jti,
)
from app.models.refresh_token import RefreshToken
from app.models.session import WebSession
from app.models.user import User


def _refresh_expiry_dt() -> datetime:
    s = get_settings()
    return datetime.now(UTC) + timedelta(days=s.refresh_token_expire_days)


async def issue_token_pair(
    db: AsyncSession,
    *,
    user_id: str,
    web_session_id: str,
) -> tuple[str, str]:
    """Return (access_token, refresh_token raw). Persists refresh token row."""
    jti = new_jti()
    raw_refresh = create_refresh_token(user_id, jti, session_id=web_session_id)
    th = hash_token_raw(raw_refresh)
    rt = RefreshToken(
        id=jti,
        user_id=user_id,
        session_id=web_session_id,
        token_hash=th,
        expires_at=_refresh_expiry_dt(),
    )
    db.add(rt)
    await db.flush()
    access = create_access_token(user_id)
    return access, raw_refresh


async def refresh_token_pair(
    db: AsyncSession,
    *,
    raw_refresh: str,
) -> tuple[str, str] | None:
    """Validate refresh JWT + DB row; rotate. Returns new (access, refresh) or None."""
    try:
        payload = decode_token_optional_type(raw_refresh, "refresh")
    except JWTError:
        return None
    jti = payload.get("jti")
    sub = payload.get("sub")
    sid = payload.get("sid")
    if not jti or not sub or not sid:
        return None
    th = hash_token_raw(raw_refresh)
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.id == jti, RefreshToken.token_hash == th)
    )
    if row is None or row.revoked_at is not None:
        return None
    if ensure_aware_utc(row.expires_at) < datetime.now(UTC):
        return None
    sess = await db.scalar(select(WebSession).where(WebSession.id == row.session_id))
    if sess is None or sess.revoked_at is not None:
        return None
    row.revoked_at = datetime.now(UTC)
    new_jti_val = new_jti()
    raw_new = create_refresh_token(sub, new_jti_val, session_id=sid)
    th_new = hash_token_raw(raw_new)
    new_row = RefreshToken(
        id=new_jti_val,
        user_id=sub,
        session_id=sid,
        token_hash=th_new,
        expires_at=_refresh_expiry_dt(),
        rotated_from_id=row.id,
    )
    db.add(new_row)
    await db.flush()
    access = create_access_token(sub)
    return access, raw_new


async def revoke_web_session(db: AsyncSession, session_id: str) -> bool:
    sess = await db.scalar(select(WebSession).where(WebSession.id == session_id))
    if sess is None:
        return False
    now = datetime.now(UTC)
    sess.revoked_at = now
    await db.execute(
        update(RefreshToken).where(RefreshToken.session_id == session_id).values(revoked_at=now)
    )
    return True


async def ensure_dev_user(db: AsyncSession) -> User | None:
    from app.core.security import hash_password

    s = get_settings()
    if not s.skip_auth:
        return None
    u = await db.scalar(select(User).where(User.email == "dev@local"))
    if u:
        return u
    u = User(
        email="dev@local",
        password_hash=hash_password("dev"),
        display_name="Dev User",
        is_admin=True,
    )
    db.add(u)
    await db.flush()
    return u
