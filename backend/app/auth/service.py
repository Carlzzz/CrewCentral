"""Authorization requests and login flow helpers."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_util import ensure_aware_utc
from app.models.authorization_request import AuthorizationRequest


def generate_state() -> str:
    return secrets.token_urlsafe(32)


async def create_authorization_request(
    db: AsyncSession,
    *,
    client_label: str,
    device_label: str,
    redirect_scheme: str,
    device_uuid: str | None = None,
    mac_address: str | None = None,
    os_version: str | None = None,
    client_version: str | None = None,
    platform: str | None = None,
    ttl_minutes: int = 15,
) -> AuthorizationRequest:
    state = generate_state()
    now = datetime.now(UTC)
    row = AuthorizationRequest(
        state=state,
        client_label=client_label,
        device_label=device_label,
        redirect_scheme=redirect_scheme,
        device_uuid=(device_uuid.strip() if device_uuid else None) or None,
        mac_address=(mac_address.strip() if mac_address else None) or None,
        os_version=(os_version.strip() if os_version else None) or None,
        client_version=(client_version.strip() if client_version else None) or None,
        platform=(platform.strip() if platform else None) or None,
        status="pending",
        expires_at=now + timedelta(minutes=ttl_minutes),
    )
    db.add(row)
    await db.flush()
    return row


async def get_auth_request_by_state(db: AsyncSession, state: str) -> AuthorizationRequest | None:
    row = await db.scalar(select(AuthorizationRequest).where(AuthorizationRequest.state == state))
    if row is None:
        return None
    if ensure_aware_utc(row.expires_at) < datetime.now(UTC):
        row.status = "expired"
        return None
    if row.status != "pending":
        return None
    return row


async def bind_user_to_request(db: AsyncSession, req: AuthorizationRequest, user_id: str) -> None:
    req.user_id = user_id
    await db.flush()
