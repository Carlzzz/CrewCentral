"""AD organizational unit -> database role mapping (006-ad-auth).

Mirror of ad_role_service but for OU mappings. OU and group mappings share the
same priority space — the unified resolver in ad_role_service picks the highest.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.role_service import get_role
from app.models.ad_ou_mapping import ADOUMapping


async def list_mappings(db: AsyncSession) -> list[ADOUMapping]:
    rows = await db.scalars(
        select(ADOUMapping).order_by(ADOUMapping.priority.desc(), ADOUMapping.ou_name)
    )
    return list(rows.all())


async def upsert_mapping(
    db: AsyncSession,
    *,
    ou_name: str,
    role_key: str,
    priority: int,
) -> ADOUMapping:
    ou = ou_name.strip()
    role = await get_role(db, role_key)
    if role is None:
        raise ValueError("role_not_found")
    row = await db.get(ADOUMapping, ou)
    if row is None:
        row = ADOUMapping(ou_name=ou, role_key=role.key, priority=priority)
        db.add(row)
    else:
        row.role_key = role.key
        row.priority = priority
    await db.flush()
    return row


async def delete_mapping(db: AsyncSession, ou_name: str) -> bool:
    row = await db.get(ADOUMapping, ou_name.strip())
    if row is None:
        return False
    await db.delete(row)
    await db.flush()
    return True


async def serialize_mapping(db: AsyncSession, m: ADOUMapping) -> dict[str, Any]:
    role = await get_role(db, m.role_key)
    return {
        "ou_name": m.ou_name,
        "role_key": m.role_key,
        "role_label": role.label if role else m.role_key,
        "priority": m.priority,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
