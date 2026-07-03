"""Windows AD authentication adapter (006-ad-auth).

Verifies credentials against AD via LDAP bind, then resolves them to a local
``User`` — binding by immutable ``ad_guid`` first, then by username
(sAMAccountName), then by matching a pre-existing local account's email prefix,
else creating a new record. Never syncs ``is_admin`` (FR-006).
"""

from __future__ import annotations

import anyio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.adapters.base import AuthAdapter
from app.auth.ad_role_service import resolve_role_from_groups
from app.auth.role_service import set_user_role_raw
from app.core.config import get_settings
from app.models.user import User
from app.services.ad_client import ADClient, ADUserAttrs


class ADAuthAdapter(AuthAdapter):
    def name(self) -> str:
        return "ad"

    async def authenticate(
        self, db: AsyncSession, *, account: str, password: str
    ) -> User:
        settings = get_settings()
        client = ADClient(settings)
        # ldap3 is blocking; run in a worker thread so an unreachable AD cannot
        # stall the event loop and returns within the connect timeout (SC-003).
        attrs = await anyio.to_thread.run_sync(client.authenticate, account, password)
        return await sync_user_from_ad(db, attrs)


async def sync_user_from_ad(db: AsyncSession, attrs: ADUserAttrs) -> User:
    """Find-or-create the local user for an AD identity and update mutable fields.

    Match order: ad_guid → username(sAMAccountName) → 现有本地账号的邮箱前缀唯一匹配
    → create new. ``is_admin`` and other local-managed fields are never touched.
    Empty AD attributes do not overwrite existing local values.
    """
    account = attrs.sam_account_name
    user = await db.scalar(select(User).where(User.ad_guid == attrs.ad_guid))

    if user is None and account:
        # 已绑定过、或另一台设备先建过的 AD 账号：按用户名精确匹配。
        user = await db.scalar(select(User).where(User.username == account))
        if user is not None and not user.ad_guid:
            user.ad_guid = attrs.ad_guid

    if user is None and account:
        # 首次登录：尝试关联现有本地账号（邮箱前缀 == AD 用户名）。
        # 仅在唯一命中且该账号尚未绑定其它 AD 身份时绑定，避免同名误绑。
        existing = await _match_local_by_email_prefix(db, account)
        if existing is not None:
            existing.ad_guid = attrs.ad_guid
            existing.username = account
            user = existing

    if user is None:
        user = User(
            username=account,
            email=attrs.email or None,
            password_hash=None,
            display_name=attrs.display_name,
            department=attrs.department,
            title=attrs.title,
            ad_guid=attrs.ad_guid,
            is_admin=False,
        )
        db.add(user)
        await db.flush()
        await _apply_ad_role(db, user, attrs.groups)
        await db.flush()
        return user

    # Update mutable, AD-owned fields only when AD provides a non-empty value.
    if not user.username:
        user.username = account
    if attrs.display_name:
        user.display_name = attrs.display_name
    if attrs.department:
        user.department = attrs.department
    if attrs.title:
        user.title = attrs.title
    if attrs.email and not user.email:
        user.email = attrs.email
    await _apply_ad_role(db, user, attrs.groups)
    await db.flush()
    return user


async def _apply_ad_role(db: AsyncSession, user: User, groups: list[str]) -> None:
    """Set the user's role from mapped AD groups unless the role is manually locked.

    ``role_locked`` (set when an admin edits the role in the UI) takes precedence,
    so AD login/sync never overrides a manual assignment. Only groups that have a
    mapping affect the role; unmapped-only users are left untouched.
    """
    if user.role_locked:
        return
    resolved = await resolve_role_from_groups(db, groups)
    if resolved is None:
        return
    role, is_admin = resolved
    await set_user_role_raw(db, user_id=user.id, role=role)
    user.is_admin = is_admin


async def _match_local_by_email_prefix(db: AsyncSession, account: str) -> User | None:
    """Return a pre-existing local account whose email local-part == AD username.

    Only returns a match when it is unambiguous (exactly one local user) and that
    user is not already bound to a different AD identity — otherwise returns None
    so the caller creates a fresh AD-backed user instead of risking a mis-bind.
    """
    prefix = account.lower()
    candidates = (
        await db.scalars(
            select(User).where(
                func.lower(User.email).like(f"{prefix}@%"),
                User.ad_guid.is_(None),
            )
        )
    ).all()
    if len(candidates) != 1:
        return None
    # Confirm the local-part matches exactly (LIKE 'x@%' could catch 'x@' vs 'xy@').
    email = candidates[0].email or ""
    if email.split("@", 1)[0].lower() != prefix:
        return None
    return candidates[0]
