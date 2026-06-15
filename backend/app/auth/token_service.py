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
    """Validate refresh JWT + DB row; rotate. Returns new (access, refresh) or None.

    Rotation revokes the presented token and issues a fresh pair. To tolerate
    concurrent / lagging refreshes from the same client (multiple components may
    hold the same token), an already-rotated token is still accepted within a
    short grace window (``refresh_grace_seconds``) as long as the session is live.
    The row is locked ``FOR UPDATE`` so concurrent refreshes of the same token are
    serialized instead of racing on ``revoked_at``.
    """
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
        select(RefreshToken)
        .where(RefreshToken.id == jti, RefreshToken.token_hash == th)
        .with_for_update()
    )
    if row is None:
        return None
    now = datetime.now(UTC)
    if ensure_aware_utc(row.expires_at) < now:
        return None
    if row.revoked_at is not None:
        # Already rotated. Accept within the grace window so a lagging concurrent
        # refresh does not kill an otherwise-valid session; reject beyond it.
        s = get_settings()
        grace = timedelta(seconds=s.refresh_grace_seconds)
        if ensure_aware_utc(row.revoked_at) + grace < now:
            return None
    sess = await db.scalar(select(WebSession).where(WebSession.id == row.session_id))
    if sess is None or sess.revoked_at is not None:
        return None
    if row.revoked_at is None:
        row.revoked_at = now
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
