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
from app.auth.role_service import (
    ALL_MENU_KEYS,
    create_role,
    delete_role,
    get_role,
    get_role_menu_config,
    get_user_role,
    list_roles,
    menus_for_role,
    role_reference_counts,
    serialize_role,
    set_role_menu_config,
    set_user_role,
    update_role,
)
from app.core.security import hash_password
from app.db.session import get_db
from app.models.role import Role
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


class RoleBody(BaseModel):
    key: str | None = Field(default=None, min_length=3, max_length=64)
    label: str = Field(..., min_length=1, max_length=255)
    is_admin: bool = False
    menu_keys: list[str] = Field(default_factory=list)


class RoleMenuBody(BaseModel):
    menu_keys: list[str] = Field(...)


class ADRoleMappingBody(BaseModel):
    ad_group: str = Field(..., min_length=1, max_length=255)
    role_key: str = Field(..., min_length=3, max_length=64)
    priority: int = Field(default=0, ge=0, le=1000)


async def _serialize_user(db: AsyncSession, u: User) -> dict[str, Any]:
    role_key = await get_user_role(db, user_id=u.id, is_admin=u.is_admin)
    role = await get_role(db, role_key)
    menu_permissions = await menus_for_role(db, role_key)
    role_label = role.label if role else role_key
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "department": u.department,
        "title": u.title,
        "avatar_url": u.avatar_url,
        "is_admin": u.is_admin,
        "role": role_key,
        "role_label": role_label,
        "role_locked": u.role_locked,
        "source": "ad" if u.ad_guid else "local",
        "menu_permissions": menu_permissions,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
    }


async def _serialize_role(db: AsyncSession, role: Role) -> dict[str, Any]:
    """Fetch menu keys + reference counts, then call the sync serialize_role."""
    menu_keys = await menus_for_role(db, role.key)
    user_count, ad_mapping_count = await role_reference_counts(db, role.key)
    return serialize_role(role, menu_keys, user_count, ad_mapping_count)


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
    role = await get_role(db, body.role)
    if role is None:
        return rc_err("角色不存在")
    u = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        is_admin=role.is_admin,
    )
    db.add(u)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return rc_err("邮箱已存在")
    if await set_user_role(db, user_id=u.id, role=role.key) is None:
        await db.rollback()
        return rc_err("角色不存在")
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
        role = await get_role(db, body.role)
        if role is None:
            return rc_err("角色不存在")
        if u.id == admin.id and not role.is_admin:
            return rc_err("不能将自己降级为非管理角色")
        u.is_admin = role.is_admin
        if await set_user_role(db, user_id=u.id, role=role.key) is None:
            await db.rollback()
            return rc_err("角色不存在")
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
    role = await get_role(db, body.role)
    if role is None:
        return rc_err("角色不存在")
    if u.id == admin.id and not role.is_admin:
        return rc_err("不能将自己降级为非管理角色")
    u.is_admin = role.is_admin
    if await set_user_role(db, user_id=u.id, role=role.key) is None:
        await db.rollback()
        return rc_err("角色不存在")
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


# --- Role CRUD ---

@router.get("/roles")
async def list_roles_endpoint(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    rows = await list_roles(db)
    return rc_ok(
        {"items": [await _serialize_role(db, r) for r in rows], "all_menus": ALL_MENU_KEYS}
    )


@router.post("/roles")
async def create_role_endpoint(
    body: RoleBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    if not body.key:
        return rc_err("角色标识不能为空")
    try:
        row = await create_role(
            db,
            key=body.key,
            label=body.label,
            is_admin=body.is_admin,
            menu_keys=body.menu_keys,
        )
    except ValueError as exc:
        if str(exc) == "duplicate_role_key":
            return rc_err("角色标识已存在")
        return rc_err("角色标识只能使用小写字母、数字和下划线，且至少 3 位")
    await db.commit()
    await db.refresh(row)
    return rc_ok(await _serialize_role(db, row), message="角色已创建")


@router.patch("/roles/{role_key}")
async def update_role_endpoint(
    role_key: str,
    body: RoleBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    existing = await get_role(db, role_key)
    if existing is None:
        return rc_err("角色不存在")
    menu_keys = body.menu_keys
    if existing.key == "super_admin":
        # super_admin always retains all menus; ignore client-supplied menu_keys.
        menu_keys = await menus_for_role(db, "super_admin")
    row = await update_role(
        db,
        key=role_key,
        label=body.label,
        is_admin=body.is_admin,
        menu_keys=menu_keys,
    )
    if row is None:
        return rc_err("角色不存在")
    await db.commit()
    await db.refresh(row)
    return rc_ok(await _serialize_role(db, row), message="角色已更新")


@router.delete("/roles/{role_key}")
async def delete_role_endpoint(
    role_key: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    ok, message = await delete_role(db, role_key)
    if not ok:
        return rc_err(message)
    await db.commit()
    return rc_ok(message=message)


# --- Role menu permissions management ---

@router.get("/roles/menu-permissions")
async def list_role_menu_permissions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    """获取所有角色的菜单权限配置"""
    rows = await list_roles(db)
    items = []
    for role in rows:
        cfg = await get_role_menu_config(db, role.key)
        cfg["label"] = role.label
        cfg["is_system"] = role.is_system
        cfg["is_admin"] = role.is_admin
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
    role_row = await get_role(db, role)
    if role_row is None:
        return rc_err("角色不存在")
    if role_row.key == "super_admin":
        return rc_err("super_admin 始终拥有全部权限，不可修改")
    await set_role_menu_config(db, role_row.key, body.menu_keys)
    await db.commit()
    return rc_ok(message="菜单权限已更新")


# --- AD group → role mappings (006-ad-auth) ---

@router.get("/ad-role-mappings")
async def list_ad_role_mappings(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    rows = await list_mappings(db)
    return rc_ok(
        {"items": [await serialize_mapping(db, m) for m in rows], "all_menus": ALL_MENU_KEYS}
    )


@router.post("/ad-role-mappings")
async def upsert_ad_role_mapping(
    body: ADRoleMappingBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("users.manage")),
) -> dict[str, Any]:
    try:
        m = await upsert_mapping(
            db,
            ad_group=body.ad_group,
            role_key=body.role_key,
            priority=body.priority,
        )
    except ValueError:
        return rc_err("角色不存在")
    await db.commit()
    await db.refresh(m)
    return rc_ok(await serialize_mapping(db, m), message="映射已保存")


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
