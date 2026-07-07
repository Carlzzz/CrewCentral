from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ad_ou_mapping import ADOUMapping
from app.models.ad_role_mapping import ADRoleMapping
from app.models.role import Role
from app.models.role_menu_permission import RoleMenuPermission
from app.models.user_role import UserRole

ROLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")

ROLE_MENUS: dict[str, list[str]] = {
    "super_admin": [
        "home",
        "download",
        "docs",
        "skills",
        "skills.assignments",
        "devices",
        "releases",
        "docs.manage",
        "users.manage",
        "usage",
        "models.manage",
        "gateway",
    ],
    "skill_admin": ["home", "download", "docs", "skills", "skills.assignments"],
    "ops_admin": ["home", "download", "docs", "devices", "releases", "usage", "gateway"],
    "docs_admin": ["home", "download", "docs", "docs.manage"],
    "viewer": ["home", "download", "docs"],
}

ALL_MENU_KEYS: list[dict[str, str]] = [
    {"key": "home", "label": "首页"},
    {"key": "download", "label": "下载中心"},
    {"key": "docs", "label": "文档查看"},
    {"key": "skills", "label": "技能中心"},
    {"key": "skills.assignments", "label": "技能权限配置"},
    {"key": "devices", "label": "设备管理"},
    {"key": "releases", "label": "客户端发布"},
    {"key": "docs.manage", "label": "文档管理"},
    {"key": "users.manage", "label": "用户管理"},
    {"key": "usage", "label": "用量分析"},
    {"key": "models.manage", "label": "模型权限管理"},
    {"key": "gateway", "label": "网关监控"},
]

BUILTIN_ROLE_META: dict[str, dict[str, Any]] = {
    "super_admin": {"label": "超级管理员", "is_admin": True, "sort_order": 10},
    "skill_admin": {"label": "技能管理员", "is_admin": True, "sort_order": 20},
    "ops_admin": {"label": "运维管理员", "is_admin": True, "sort_order": 30},
    "docs_admin": {"label": "文档管理员", "is_admin": True, "sort_order": 40},
    "viewer": {"label": "普通用户", "is_admin": False, "sort_order": 100},
}

ADMIN_LIKE_ROLES = {k for k, v in BUILTIN_ROLE_META.items() if v["is_admin"]}
ROLE_LABELS = {k: str(v["label"]) for k, v in BUILTIN_ROLE_META.items()}
_VALID_MENU_KEYS = {m["key"] for m in ALL_MENU_KEYS}


def clean_role_key(key: str) -> str:
    return key.strip().lower()


def is_valid_role_key(key: str) -> bool:
    return bool(ROLE_KEY_RE.fullmatch(clean_role_key(key)))


def clean_menu_keys(menu_keys: list[str]) -> list[str]:
    out: list[str] = []
    for key in menu_keys:
        if key in _VALID_MENU_KEYS and key not in out:
            out.append(key)
    return out


def normalize_role(role: str | None) -> str:
    # Compatibility helper for old callers. New validation should use get_role().
    r = clean_role_key(role or "")
    return r or "viewer"


async def ensure_builtin_roles(db: AsyncSession) -> None:
    for key, meta in BUILTIN_ROLE_META.items():
        row = await db.get(Role, key)
        if row is None:
            row = Role(
                key=key,
                label=str(meta["label"]),
                is_system=True,
                is_admin=bool(meta["is_admin"]),
                sort_order=int(meta["sort_order"]),
            )
            db.add(row)
            await set_role_menu_config(db, key, ROLE_MENUS[key])
        else:
            row.is_system = True
            row.sort_order = int(meta["sort_order"])
            if key == "super_admin":
                row.is_admin = True
    await db.flush()


async def list_roles(db: AsyncSession) -> list[Role]:
    await ensure_builtin_roles(db)
    rows = await db.scalars(select(Role).order_by(Role.sort_order, Role.key))
    return list(rows.all())


async def get_role(db: AsyncSession, key: str) -> Role | None:
    await ensure_builtin_roles(db)
    return await db.get(Role, clean_role_key(key))


async def get_user_role(db: AsyncSession, *, user_id: str, is_admin: bool) -> str:
    row = await db.scalar(select(UserRole.role).where(UserRole.user_id == user_id))
    if row and await get_role(db, str(row)) is not None:
        return str(row)
    return "super_admin" if is_admin else "viewer"


async def set_user_role(db: AsyncSession, *, user_id: str, role: str) -> str | None:
    nr = clean_role_key(role)
    if await get_role(db, nr) is None:
        return None
    existing = await db.get(UserRole, user_id)
    if existing:
        existing.role = nr
    else:
        db.add(UserRole(user_id=user_id, role=nr))
    return nr


async def set_user_role_raw(db: AsyncSession, *, user_id: str, role: str) -> str | None:
    return await set_user_role(db, user_id=user_id, role=role)


async def menus_for_role(db: AsyncSession, role: str) -> list[str]:
    nr = clean_role_key(role)
    if nr == "super_admin":
        return ROLE_MENUS["super_admin"]
    if await get_role(db, nr) is None:
        return ROLE_MENUS["viewer"]
    row = await db.get(RoleMenuPermission, nr)
    if row is not None:
        keys = [k.strip() for k in row.menu_keys.split(",") if k.strip()]
        return clean_menu_keys(keys)
    return ROLE_MENUS.get(nr, ROLE_MENUS["viewer"])


async def get_role_menu_config(db: AsyncSession, role: str) -> dict[str, Any]:
    nr = clean_role_key(role)
    r = await get_role(db, nr)
    if r is None:
        nr = "viewer"
    row = await db.get(RoleMenuPermission, nr)
    if row is not None:
        keys = clean_menu_keys([k.strip() for k in row.menu_keys.split(",") if k.strip()])
        return {"role": nr, "menu_keys": keys, "is_default": False}
    return {"role": nr, "menu_keys": ROLE_MENUS.get(nr, []), "is_default": True}


async def set_role_menu_config(db: AsyncSession, role: str, menu_keys: list[str]) -> None:
    nr = clean_role_key(role)
    clean = clean_menu_keys(menu_keys)
    existing = await db.get(RoleMenuPermission, nr)
    if existing:
        existing.menu_keys = ",".join(clean)
    else:
        db.add(RoleMenuPermission(role=nr, menu_keys=",".join(clean)))
    await db.flush()


async def create_role(
    db: AsyncSession,
    *,
    key: str,
    label: str,
    is_admin: bool,
    menu_keys: list[str],
) -> Role:
    nr = clean_role_key(key)
    if not is_valid_role_key(nr):
        raise ValueError("invalid_role_key")
    if await db.get(Role, nr) is not None:
        raise ValueError("duplicate_role_key")
    row = Role(key=nr, label=label.strip(), is_system=False, is_admin=is_admin, sort_order=200)
    db.add(row)
    await db.flush()
    await set_role_menu_config(db, nr, menu_keys)
    return row


async def update_role(
    db: AsyncSession,
    *,
    key: str,
    label: str,
    is_admin: bool,
    menu_keys: list[str],
) -> Role | None:
    row = await get_role(db, key)
    if row is None:
        return None
    row.label = label.strip()
    if not row.is_system or row.key != "super_admin":
        row.is_admin = is_admin
    await set_role_menu_config(db, row.key, menu_keys)
    await db.flush()
    return row


async def role_reference_counts(db: AsyncSession, role: str) -> tuple[int, int, int]:
    nr = clean_role_key(role)
    user_count = await db.scalar(select(func.count()).select_from(UserRole).where(UserRole.role == nr))
    mapping_count = await db.scalar(
        select(func.count()).select_from(ADRoleMapping).where(ADRoleMapping.role_key == nr)
    )
    ou_count = await db.scalar(
        select(func.count()).select_from(ADOUMapping).where(ADOUMapping.role_key == nr)
    )
    return int(user_count or 0), int(mapping_count or 0), int(ou_count or 0)


async def delete_role(db: AsyncSession, key: str) -> tuple[bool, str]:
    row = await get_role(db, key)
    if row is None:
        return False, "角色不存在"
    if row.is_system:
        return False, "系统内置角色不能删除"
    user_count, mapping_count, ou_count = await role_reference_counts(db, row.key)
    if user_count:
        return False, f"该角色正在被 {user_count} 个用户使用，不能删除"
    if mapping_count:
        return False, f"该角色已被 {mapping_count} 个 AD 组映射引用，不能删除"
    if ou_count:
        return False, f"该角色已被 {ou_count} 个 AD OU 映射引用，不能删除"
    menu = await db.get(RoleMenuPermission, row.key)
    if menu is not None:
        await db.delete(menu)
    await db.delete(row)
    await db.flush()
    return True, "角色已删除"


def serialize_role(
    role: Role,
    menu_keys: list[str],
    user_count: int = 0,
    ad_mapping_count: int = 0,
) -> dict[str, Any]:
    return {
        "key": role.key,
        "label": role.label,
        "is_system": role.is_system,
        "is_admin": role.is_admin,
        "sort_order": role.sort_order,
        "menu_keys": menu_keys,
        "user_count": user_count,
        "ad_mapping_count": ad_mapping_count,
        "created_at": role.created_at.isoformat() if role.created_at else None,
        "updated_at": role.updated_at.isoformat() if role.updated_at else None,
    }


def serialize_role_payload(role: str, menu_permissions: list[str]) -> dict[str, Any]:
    return {"role": clean_role_key(role), "menu_permissions": menu_permissions}
