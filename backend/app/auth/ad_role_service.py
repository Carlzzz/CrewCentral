"""AD group → role mapping and role resolution (006-ad-auth).

Each AD group (by CN) maps to a dynamic role carrying its own menu permissions.
When a user belongs to multiple mapped groups, the highest ``priority`` wins.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.role_service import ALL_MENU_KEYS
from app.models.ad_role_mapping import ADRoleMapping

_VALID_MENU_KEYS = {m["key"] for m in ALL_MENU_KEYS}


def _clean_menu_keys(keys: list[str]) -> list[str]:
    seen: list[str] = []
    for k in keys:
        if k in _VALID_MENU_KEYS and k not in seen:
            seen.append(k)
    return seen


async def list_mappings(db: AsyncSession) -> list[ADRoleMapping]:
    rows = await db.scalars(
        select(ADRoleMapping).order_by(ADRoleMapping.priority.desc(), ADRoleMapping.ad_group)
    )
    return list(rows.all())


async def upsert_mapping(
    db: AsyncSession,
    *,
    ad_group: str,
    label: str | None,
    menu_keys: list[str],
    priority: int,
    is_admin: bool,
) -> ADRoleMapping:
    group = ad_group.strip()
    row = await db.get(ADRoleMapping, group)
    clean = ",".join(_clean_menu_keys(menu_keys))
    if row is None:
        row = ADRoleMapping(
            ad_group=group,
            label=(label or None),
            menu_keys=clean,
            priority=priority,
            is_admin=is_admin,
        )
        db.add(row)
    else:
        row.label = label or None
        row.menu_keys = clean
        row.priority = priority
        row.is_admin = is_admin
    await db.flush()
    return row


async def delete_mapping(db: AsyncSession, ad_group: str) -> bool:
    row = await db.get(ADRoleMapping, ad_group.strip())
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    return True


async def resolve_role_from_groups(
    db: AsyncSession, groups: list[str]
) -> tuple[str, bool] | None:
    """Return (role_key, is_admin) for the highest-priority matched group, or None.

    ``role_key`` is the AD group CN itself (dynamic role). Menu permissions for
    that role are read from the same mapping row via role_service.
    """
    if not groups:
        return None
    group_set = set(groups)
    rows = await list_mappings(db)  # already sorted priority desc
    for m in rows:
        if m.ad_group in group_set:
            return m.ad_group, m.is_admin
    return None


async def menu_keys_for_ad_role(db: AsyncSession, role: str) -> list[str] | None:
    """Menu keys for a dynamic AD role, or None if the role is not an AD mapping."""
    row = await db.get(ADRoleMapping, role)
    if row is None:
        return None
    return [k.strip() for k in (row.menu_keys or "").split(",") if k.strip()]


def serialize_mapping(m: ADRoleMapping) -> dict[str, Any]:
    return {
        "ad_group": m.ad_group,
        "label": m.label,
        "menu_keys": [k.strip() for k in (m.menu_keys or "").split(",") if k.strip()],
        "priority": m.priority,
        "is_admin": m.is_admin,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
