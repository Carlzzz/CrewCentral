"""AD group -> database role mapping and unified role resolution (006-ad-auth).

Role resolution considers both group mappings (ad_role_mappings) and OU mappings
(ad_ou_mappings). Both share the same priority space; the highest-priority match
across both sources wins.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.role_service import get_role
from app.models.ad_role_mapping import ADRoleMapping
from app.models.role import Role

log = logging.getLogger(__name__)


async def list_mappings(db: AsyncSession) -> list[ADRoleMapping]:
    rows = await db.scalars(
        select(ADRoleMapping).order_by(ADRoleMapping.priority.desc(), ADRoleMapping.ad_group)
    )
    return list(rows.all())


async def upsert_mapping(
    db: AsyncSession,
    *,
    ad_group: str,
    role_key: str,
    priority: int,
) -> ADRoleMapping:
    group = ad_group.strip()
    role = await get_role(db, role_key)
    if role is None:
        raise ValueError("role_not_found")
    row = await db.get(ADRoleMapping, group)
    if row is None:
        row = ADRoleMapping(ad_group=group, role_key=role.key, priority=priority)
        db.add(row)
    else:
        row.role_key = role.key
        row.priority = priority
    await db.flush()
    return row


async def delete_mapping(db: AsyncSession, ad_group: str) -> bool:
    row = await db.get(ADRoleMapping, ad_group.strip())
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    return True


async def resolve_role_from_ad(
    db: AsyncSession, groups: list[str], ou: str | None = None
) -> Role | None:
    """Resolve the highest-priority role across group and OU mappings.

    Collects all matching mappings (group memberships + the user's direct OU),
    then picks the one with the highest priority. Group and OU mappings share
    the same priority space. Ties are resolved by iteration order (priority desc).
    """
    candidates: list[tuple[int, str, str]] = []  # (priority, role_key, source_label)

    group_set = set(groups) if groups else set()
    for mapping in await list_mappings(db):
        if mapping.ad_group in group_set:
            candidates.append((mapping.priority, mapping.role_key, f"group:{mapping.ad_group}"))

    if ou:
        from app.auth.ad_ou_service import list_mappings as list_ou_mappings
        for mapping in await list_ou_mappings(db):
            if mapping.ou_name == ou:
                candidates.append((mapping.priority, mapping.role_key, f"ou:{mapping.ou_name}"))

    if not candidates:
        return None

    # Highest priority wins; sort descending so the first resolved role is the winner.
    candidates.sort(key=lambda c: c[0], reverse=True)
    for _, role_key, source in candidates:
        role = await get_role(db, role_key)
        if role is not None:
            return role
        log.warning("AD %s references missing role %r", source, role_key)
    return None


async def resolve_role_from_groups(db: AsyncSession, groups: list[str]) -> Role | None:
    """Backward-compatible wrapper: resolve by groups only (no OU)."""
    return await resolve_role_from_ad(db, groups, ou=None)


async def serialize_mapping(db: AsyncSession, m: ADRoleMapping) -> dict[str, Any]:
    role = await get_role(db, m.role_key)
    return {
        "ad_group": m.ad_group,
        "role_key": m.role_key,
        "role_label": role.label if role else m.role_key,
        "priority": m.priority,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
