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
]

ADMIN_LIKE_ROLES = {"super_admin", "skill_admin", "ops_admin", "docs_admin"}

ROLE_LABELS: dict[str, str] = {
    "super_admin": "超级管理员",
    "skill_admin": "技能管理员",
    "ops_admin": "运维管理员",
    "docs_admin": "文档管理员",
    "viewer": "普通用户",
}


def normalize_role(role: str | None) -> str:
    r = (role or "").strip().lower()
    return r if r in ROLE_MENUS else "viewer"


async def get_user_role(db: AsyncSession, *, user_id: str, is_admin: bool) -> str:
    row = await db.scalar(select(UserRole.role).where(UserRole.user_id == user_id))
    if row:
        # Do NOT normalize: the stored value may be a dynamic AD-group role whose
        # menus are resolved separately. normalize_role would collapse it to viewer.
        return str(row)
    return "super_admin" if is_admin else "viewer"


async def set_user_role(db: AsyncSession, *, user_id: str, role: str) -> str:
    nr = normalize_role(role)
    await set_user_role_raw(db, user_id=user_id, role=nr)
    return nr


async def set_user_role_raw(db: AsyncSession, *, user_id: str, role: str) -> str:
    """Store a role verbatim (used for dynamic AD-group roles that aren't built-in)."""
    existing = await db.get(UserRole, user_id)
    if existing:
        existing.role = role
    else:
        db.add(UserRole(user_id=user_id, role=role))
    return role


async def menus_for_role(db: AsyncSession, role: str) -> list[str]:
    """获取角色的菜单权限。

    super_admin 始终全部；内置角色先查 DB 覆盖、无则回退默认；否则按动态 AD
    组角色（ad_role_mappings）解析；都不匹配回退 viewer。
    """
    if role == "super_admin":
        return ROLE_MENUS["super_admin"]

    if role in ROLE_MENUS:
        from app.models.role_menu_permission import RoleMenuPermission
        row = await db.scalar(
            select(RoleMenuPermission.menu_keys).where(RoleMenuPermission.role == role)
        )
        if row is not None:
            keys_str = str(row).strip()
            return [k.strip() for k in keys_str.split(",") if k.strip()] if keys_str else []
        return ROLE_MENUS[role]

    # Dynamic AD-group role: menus live on the mapping row.
    from app.auth.ad_role_service import menu_keys_for_ad_role
    ad_menus = await menu_keys_for_ad_role(db, role)
    if ad_menus is not None:
        return ad_menus
    return ROLE_MENUS["viewer"]


async def get_role_menu_config(db: AsyncSession, role: str) -> dict[str, Any]:
    """获取角色菜单配置，返回 {role, menu_keys, is_default}。"""
    nr = normalize_role(role)
    from app.models.role_menu_permission import RoleMenuPermission
    row = await db.scalar(
        select(RoleMenuPermission.menu_keys).where(RoleMenuPermission.role == nr)
    )
    if row is not None:
        keys = [k.strip() for k in str(row).split(",") if k.strip()]
        return {"role": nr, "menu_keys": keys, "is_default": False}
    return {"role": nr, "menu_keys": ROLE_MENUS.get(nr, ROLE_MENUS["viewer"]), "is_default": True}


async def set_role_menu_config(db: AsyncSession, role: str, menu_keys: list[str]) -> None:
    """设置角色菜单权限。不允许修改 super_admin。"""
    nr = normalize_role(role)
    if nr == "super_admin":
        return
    from app.models.role_menu_permission import RoleMenuPermission
    valid_keys = {m["key"] for m in ALL_MENU_KEYS}
    clean = [k for k in menu_keys if k in valid_keys]
    existing = await db.get(RoleMenuPermission, nr)
    if existing:
        existing.menu_keys = ",".join(clean)
    else:
        db.add(RoleMenuPermission(role=nr, menu_keys=",".join(clean)))
    await db.flush()


def serialize_role_payload(role: str, menu_permissions: list[str]) -> dict[str, Any]:
    nr = normalize_role(role)
    return {"role": nr, "menu_permissions": menu_permissions}
