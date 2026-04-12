"""Single module for password hashing and JWT encode/decode (constitution enforcement)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import Settings, get_settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _jwt_settings() -> Settings:
    return get_settings()


def _now_ts() -> int:
    return int(datetime.now(UTC).timestamp())


def create_access_token(
    subject_user_id: str,
    *,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    s = _jwt_settings()
    now = _now_ts()
    exp = now + s.access_token_expire_minutes * 60
    payload: dict[str, Any] = {
        "sub": subject_user_id,
        "type": "access",
        "iat": now,
        "exp": exp,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_refresh_token(
    subject_user_id: str,
    jti: str,
    *,
    session_id: str,
) -> str:
    s = _jwt_settings()
    now = _now_ts()
    exp = now + s.refresh_token_expire_days * 86400
    payload = {
        "sub": subject_user_id,
        "type": "refresh",
        "jti": jti,
        "sid": session_id,
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    s = _jwt_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])


def decode_token_optional_type(token: str, expected_type: str) -> dict[str, Any]:
    data = decode_token(token)
    if data.get("type") != expected_type:
        raise JWTError("wrong token type")
    return data


def hash_token_raw(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_jti() -> str:
    return str(uuid.uuid4())
