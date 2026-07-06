"""AD group -> database role mapping and resolution (006-ad-auth)."""

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


async def resolve_role_from_groups(db: AsyncSession, groups: list[str]) -> Role | None:
    if not groups:
        return None
    group_set = set(groups)
    rows = await list_mappings(db)
    for mapping in rows:
        if mapping.ad_group not in group_set:
            continue
        role = await get_role(db, mapping.role_key)
        if role is not None:
            return role
        log.warning(
            "AD mapping references missing role %r for group %r",
            mapping.role_key,
            mapping.ad_group,
        )
    return None


async def serialize_mapping(db: AsyncSession, m: ADRoleMapping) -> dict[str, Any]:
    role = await get_role(db, m.role_key)
    return {
        "ad_group": m.ad_group,
        "role_key": m.role_key,
        "role_label": role.label if role else m.role_key,
        "priority": m.priority,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
