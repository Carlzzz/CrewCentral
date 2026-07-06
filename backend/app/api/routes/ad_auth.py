"""AD login + admin batch sync (006-ad-auth).

Login mirrors the local /auth/login session/state handling so AD users get the
same Web Session (and downstream JWT via /auth/refresh). Endpoints 404 when AD
is disabled so a misconfigured deployment does not expose a broken login path.
"""

from __future__ import annotations

import logging

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.auth.adapters.ad import ADAuthAdapter, sync_user_from_ad
from app.auth.service import bind_user_to_request, get_auth_request_by_state
from app.core.config import get_settings
from app.db.session import get_db
from app.models.session import WebSession
from app.models.user import User
from app.schemas.ad_auth import ADLoginBody, ADSyncBody, ADSyncResult
from app.schemas.rc import rc_err, rc_ok
from app.services.ad_client import ADClient, ADError

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ad-auth", tags=["ad-auth"])


def _require_ad_enabled() -> None:
    if not get_settings().ad_auth_enabled:
        raise HTTPException(status_code=404, detail="AD 认证未启用")


@router.get("/enabled")
async def ad_enabled() -> dict:
    """Public: lets the login page decide whether to show the AD entry."""
    return rc_ok({"enabled": bool(get_settings().ad_auth_enabled)})


@router.post("/login")
async def ad_login(
    request: Request,
    body: ADLoginBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    _require_ad_enabled()
    settings = get_settings()
    adapter = ADAuthAdapter()

    try:
        user = await adapter.authenticate(db, account=body.account, password=body.password)
    except ADError as exc:
        # public_message is curated to avoid leaking AD internals (FR-010).
        return rc_err(exc.public_message)

    if body.state:
        req_row = await get_auth_request_by_state(db, body.state)
        if req_row is None:
            return rc_err("无效或已过期的 state")
        await bind_user_to_request(db, req_row, user.id)
        ws = WebSession(user_id=user.id, authorization_request_id=req_row.id)
        db.add(ws)
        await db.commit()
        await db.refresh(ws)
        request.session["uid"] = user.id
        request.session["sid"] = ws.id
        bp = settings.base_path.rstrip("/") or ""
        return rc_ok({"redirect": f"{bp}/consent?state={body.state}"}, message="登录成功")

    ws = WebSession(user_id=user.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    request.session["uid"] = user.id
    request.session["sid"] = ws.id
    return rc_ok({"redirect": "/"}, message="登录成功")


@router.post("/admin/ad/sync")
async def ad_sync(
    body: ADSyncBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict:
    _require_ad_enabled()
    settings = get_settings()
    result = ADSyncResult(dry_run=body.dry_run)

    try:
        client = ADClient(settings)
        users = await anyio.to_thread.run_sync(
            lambda: list(client.iter_users(body.base_dn, body.filter))
        )
    except ADError as exc:
        return rc_err(exc.public_message)

    for attrs in users:
        try:
            if body.dry_run:
                result.skipped += 1
                continue
            existing = await _existing_user_for(db, attrs.ad_guid, attrs.sam_account_name)
            await sync_user_from_ad(db, attrs)
            if existing is None:
                result.created += 1
            else:
                result.updated += 1
            # Commit per user so a mid-run AD failure leaves prior work persisted
            # (idempotent, retriable — spec US3 scenario 2).
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - record and continue
            await db.rollback()
            log.warning("AD sync failed for %s: %s", attrs.sam_account_name, type(exc).__name__)
            result.errors.append(f"{attrs.sam_account_name}: 同步失败")

    return rc_ok(result.model_dump(), message="同步完成")


@router.get("/admin/ad/groups")
async def ad_groups(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict:
    """List AD groups so admins can pick when creating a group→role mapping."""
    _require_ad_enabled()
    try:
        client = ADClient(get_settings())
        groups = await anyio.to_thread.run_sync(client.list_groups)
    except ADError as exc:
        return rc_err(exc.public_message)
    return rc_ok({"items": groups})


@router.get("/admin/ad/ous")
async def ad_ous(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict:
    """List AD organizational units so admins can pick when creating an OU→role mapping."""
    _require_ad_enabled()
    try:
        client = ADClient(get_settings())
        ous = await anyio.to_thread.run_sync(client.list_ous)
    except ADError as exc:
        return rc_err(exc.public_message)
    return rc_ok({"items": ous})


async def _existing_user_for(db: AsyncSession, ad_guid: str, account: str) -> User | None:
    from sqlalchemy import select

    user = await db.scalar(select(User).where(User.ad_guid == ad_guid))
    if user is None and account:
        user = await db.scalar(select(User).where(User.username == account))
    return user
