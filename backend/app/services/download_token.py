from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.datetime_util import ensure_aware_utc
from app.core.security import new_jti
from app.models.skill_audit import SkillDownloadToken


def _now() -> datetime:
    return datetime.now(UTC)


def _encode(payload: dict[str, Any]) -> str:
    s = get_settings()
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def _decode(token: str) -> dict[str, Any]:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])


async def issue_download_token(
    db: AsyncSession,
    *,
    skill_version_id: str,
    principal_type: str,
    principal_id: str,
) -> tuple[str, datetime]:
    ttl = max(30, get_settings().skill_download_token_ttl_seconds)
    now = _now()
    exp = now + timedelta(seconds=ttl)
    jti = new_jti()
    db.add(
        SkillDownloadToken(
            token_jti=jti,
            skill_version_id=skill_version_id,
            principal_type=principal_type,
            principal_id=principal_id,
            expires_at=exp,
        )
    )
    await db.flush()
    raw = _encode(
        {
            "type": "skill_download",
            "jti": jti,
            "sid": skill_version_id,
            "pt": principal_type,
            "pid": principal_id,
            "exp": int(exp.timestamp()),
        }
    )
    return raw, exp


async def validate_download_token(
    db: AsyncSession,
    *,
    token: str,
    principal_type: str,
    principal_id: str,
    mark_used: bool = False,
) -> SkillDownloadToken:
    try:
        payload = _decode(token)
    except JWTError:
        raise ValueError("token invalid") from None
    if payload.get("type") != "skill_download":
        raise ValueError("token type invalid")
    jti = payload.get("jti")
    if not jti:
        raise ValueError("token missing jti")

    row = await db.scalar(select(SkillDownloadToken).where(SkillDownloadToken.token_jti == jti))
    if row is None:
        raise ValueError("token not found")
    if row.principal_type != principal_type or row.principal_id != principal_id:
        raise ValueError("token principal mismatch")
    if row.revoked_at is not None:
        raise ValueError("token revoked")
    if ensure_aware_utc(row.expires_at) < _now():
        raise ValueError("token expired")
    if row.used_at is not None:
        raise ValueError("token already used")
    if mark_used:
        row.used_at = _now()
    return row
