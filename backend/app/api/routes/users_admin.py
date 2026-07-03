from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.auth.ad_role_service import (
    delete_mapping,
    list_mappings,
    serialize_mapping,
    upsert_mapping,
)
from app.auth.role_service import ADMIN_LIKE_ROLES, ALL_MENU_KEYS, ROLE_LABELS, ROLE_MENUS, get_role_menu_config, get_user_role, menus_for_role, normalize_role, set_role_menu_config, set_user_role
from app.models.ad_role_mapping import ADRoleMapping
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/users", tags=["users-admin"])


class UserRolePatchBody(BaseModel):
    role: str = Field(..., min_length=3, max_length=64)


class UserCreateBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=255)
    role: str = Field(default="viewer", min_length=3, max_length=64)


class UserPatchBody(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: str | None = Field(default=None, min_length=3, max_length=64)


async def _serialize_user(db: AsyncSession, u: User) -> dict[str, Any]:
    role = await get_user_role(db, user_id=u.id, is_admin=u.is_admin)
    menu_permissions = await menus_for_role(db, role)
    role_label = ROLE_LABELS.get(role)
    if role_label is None:
        m = await db.get(ADRoleMapping, role)
        role_label = (m.label if m and m.label else role)
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "department": u.department,
        "title": u.title,
        "avatar_url": u.avatar_url,
        "is_admin": u.is_admin,
        "role": role,
        "role_label": role_label,
        "role_locked": u.role_locked,
        "source": "ad" if u.ad_guid else "local",
        "menu_permissions": menu_permissions,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


@router.get("")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    rows = await db.scalars(select(User).order_by(User.created_at.desc()))
    items = []
    for u in rows.all():
        items.append(await _serialize_user(db, u))
    return rc_ok({"items": items})


@router.post("")
async def create_user(
    body: UserCreateBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    role = normalize_role(body.role)
    u = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_admin=role in ADMIN_LIKE_ROLES,
    )
    db.add(u)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return rc_err("邮箱已存在")
    await set_user_role(db, user_id=u.id, role=role)
    await db.commit()
    await db.refresh(u)
    return rc_ok(await _serialize_user(db, u), message="用户创建成功")


@router.patch("/{user_id}")
async def patch_user(
    user_id: str,
    body: UserPatchBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")
    if body.email is not None:
        u.email = body.email
    if body.display_name is not None:
        u.display_name = body.display_name
    if body.password:
        u.password_hash = hash_password(body.password)
    if body.role is not None:
        role = normalize_role(body.role)
        if u.id == admin.id and role not in ADMIN_LIKE_ROLES:
            return rc_err("不能将自己降级为非管理角色")
        u.is_admin = role in ADMIN_LIKE_ROLES
        await set_user_role(db, user_id=u.id, role=role)
        # Manual assignment locks the role so AD login/sync won't overwrite it.
        u.role_locked = True
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return rc_err("邮箱已存在")
    await db.refresh(u)
    return rc_ok(await _serialize_user(db, u), message="用户更新成功")


@router.patch("/{user_id}/role")
async def patch_user_role(
    user_id: str,
    body: UserRolePatchBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")
    role = normalize_role(body.role)
    if u.id == admin.id and role not in ADMIN_LIKE_ROLES:
        return rc_err("不能将自己降级为非管理角色")
    u.is_admin = role in ADMIN_LIKE_ROLES
    await set_user_role(db, user_id=u.id, role=role)
    u.role_locked = True
    await db.commit()
    await db.refresh(u)
    return rc_ok(await _serialize_user(db, u), message="角色已更新")


@router.post("/{user_id}/unlock-role")
async def unlock_user_role(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    """Clear the manual role lock so the next AD login/sync re-applies group roles."""
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")
    u.role_locked = False
    await db.commit()
    await db.refresh(u)
    return rc_ok(await _serialize_user(db, u), message="已解除锁定，下次 AD 同步将按组重算角色")


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")
    if u.id == admin.id:
        return rc_err("不能删除当前登录用户")
    await db.delete(u)
    await db.commit()
    return rc_ok(message="用户已删除")


# --- Role menu permissions management ---

class RoleMenuBody(BaseModel):
    menu_keys: list[str] = Field(...)


@router.get("/roles/menu-permissions")
async def list_role_menu_permissions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    """获取所有角色的菜单权限配置"""
    items = []
    for role in ROLE_MENUS:
        cfg = await get_role_menu_config(db, role)
        items.append(cfg)
    return rc_ok({"items": items, "all_menus": ALL_MENU_KEYS})


@router.post("/roles/{role}/menu-permissions")
async def set_role_menu_perms(
    role: str,
    body: RoleMenuBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    """设置角色的菜单权限"""
    nr = normalize_role(role)
    if nr not in ROLE_MENUS:
        return rc_err("无效的角色")
    if nr == "super_admin":
        return rc_err("super_admin 始终拥有全部权限，不可修改")
    await set_role_menu_config(db, nr, body.menu_keys)
    await db.commit()
    return rc_ok(message="菜单权限已更新")


# --- AD group → role mappings (006-ad-auth) ---

class ADRoleMappingBody(BaseModel):
    ad_group: str = Field(..., min_length=1, max_length=255)
    label: str | None = Field(default=None, max_length=255)
    menu_keys: list[str] = Field(default_factory=list)
    priority: int = Field(default=0, ge=0, le=1000)
    is_admin: bool = False


@router.get("/ad-role-mappings")
async def list_ad_role_mappings(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    rows = await list_mappings(db)
    return rc_ok({"items": [serialize_mapping(m) for m in rows], "all_menus": ALL_MENU_KEYS})


@router.post("/ad-role-mappings")
async def upsert_ad_role_mapping(
    body: ADRoleMappingBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    m = await upsert_mapping(
        db,
        ad_group=body.ad_group,
        label=body.label,
        menu_keys=body.menu_keys,
        priority=body.priority,
        is_admin=body.is_admin,
    )
    await db.commit()
    await db.refresh(m)
    return rc_ok(serialize_mapping(m), message="映射已保存")


@router.delete("/ad-role-mappings/{ad_group}")
async def delete_ad_role_mapping(
    ad_group: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    ok = await delete_mapping(db, ad_group)
    if not ok:
        return rc_err("映射不存在")
    await db.commit()
    return rc_ok(message="映射已删除")

