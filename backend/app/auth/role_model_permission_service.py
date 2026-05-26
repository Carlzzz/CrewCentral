from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role_model_permission import RoleModelPermission


async def get_role_model_permissions(db: AsyncSession, role: str) -> list[str] | None:
    """获取角色的可用模型列表。super_admin 始终返回 None（无限制）。无记录也返回 None。"""
    if role == "super_admin":
        return None
    row = await db.scalar(
        select(RoleModelPermission.allowed_models).where(RoleModelPermission.role == role)
    )
    if row is None:
        return None
    res_str = str(row).strip()
    if not res_str:
        return []
    return [m.strip() for m in res_str.split(",") if m.strip()]


async def set_role_model_permissions(db: AsyncSession, role: str, allowed_models: list[str] | None) -> None:
    """设置角色的模型白名单。None 删除记录（无限制）。不允许对 super_admin 操作。"""
    if role == "super_admin":
        return
    existing = await db.get(RoleModelPermission, role)
    if allowed_models is None:
        if existing:
            await db.delete(existing)
            await db.flush()
    else:
        clean_models = [m.strip() for m in allowed_models if m.strip()]
        models_str = ",".join(clean_models)
        if existing:
            existing.allowed_models = models_str
        else:
            db.add(RoleModelPermission(role=role, allowed_models=models_str))
        await db.flush()
