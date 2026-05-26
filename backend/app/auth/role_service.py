from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ROLE_MENUS: dict[str, list[str]] = {
    "super_admin": ["home", "download", "docs", "skills", "skills.assignments", "devices", "releases", "docs.manage", "users.manage", "usage", "models.manage"],
    "skill_admin": ["home", "download", "docs", "skills", "skills.assignments"],
    "ops_admin": ["home", "download", "docs", "devices", "releases", "usage", "models.manage"],
    "docs_admin": ["home", "download", "docs", "docs.manage"],
    "viewer": ["home", "download", "docs"],
}

ADMIN_LIKE_ROLES = {"super_admin", "skill_admin", "ops_admin", "docs_admin"}


async def ensure_user_role_table(db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_roles (
              user_id VARCHAR(36) PRIMARY KEY,
              role VARCHAR(64) NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


def normalize_role(role: str | None) -> str:
    r = (role or "").strip().lower()
    return r if r in ROLE_MENUS else "viewer"


async def get_user_role(db: AsyncSession, *, user_id: str, is_admin: bool) -> str:
    await ensure_user_role_table(db)
    row = await db.execute(text("SELECT role FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
    role = row.scalar_one_or_none()
    if role:
        return normalize_role(str(role))
    return "super_admin" if is_admin else "viewer"


async def set_user_role(db: AsyncSession, *, user_id: str, role: str) -> str:
    await ensure_user_role_table(db)
    nr = normalize_role(role)
    await db.execute(
        text(
            """
            INSERT INTO user_roles(user_id, role, updated_at)
            VALUES (:uid, :role, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, updated_at = CURRENT_TIMESTAMP
            """
        ),
        {"uid": user_id, "role": nr},
    )
    return nr


def menus_for_role(role: str) -> list[str]:
    return ROLE_MENUS.get(normalize_role(role), ROLE_MENUS["viewer"])


def serialize_role_payload(role: str) -> dict[str, Any]:
    nr = normalize_role(role)
    return {"role": nr, "menu_permissions": menus_for_role(nr)}

