from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_role import UserRole

ROLE_MENUS: dict[str, list[str]] = {
    "super_admin": ["home", "download", "docs", "skills", "skills.assignments", "devices", "releases", "docs.manage", "users.manage", "usage", "models.manage"],
    "skill_admin": ["home", "download", "docs", "skills", "skills.assignments"],
    "ops_admin": ["home", "download", "docs", "devices", "releases", "usage"],
    "docs_admin": ["home", "download", "docs", "docs.manage"],
    "viewer": ["home", "download", "docs"],
}

ADMIN_LIKE_ROLES = {"super_admin", "skill_admin", "ops_admin", "docs_admin"}


def normalize_role(role: str | None) -> str:
    r = (role or "").strip().lower()
    return r if r in ROLE_MENUS else "viewer"


async def get_user_role(db: AsyncSession, *, user_id: str, is_admin: bool) -> str:
    row = await db.scalar(select(UserRole.role).where(UserRole.user_id == user_id))
    if row:
        return normalize_role(str(row))
    return "super_admin" if is_admin else "viewer"


async def set_user_role(db: AsyncSession, *, user_id: str, role: str) -> str:
    nr = normalize_role(role)
    existing = await db.get(UserRole, user_id)
    if existing:
        existing.role = nr
    else:
        db.add(UserRole(user_id=user_id, role=nr))
    return nr


def menus_for_role(role: str) -> list[str]:
    return ROLE_MENUS.get(normalize_role(role), ROLE_MENUS["viewer"])


def serialize_role_payload(role: str) -> dict[str, Any]:
    nr = normalize_role(role)
    return {"role": nr, "menu_permissions": menus_for_role(nr)}

