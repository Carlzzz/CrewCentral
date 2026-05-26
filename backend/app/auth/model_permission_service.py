from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_model_permission import UserModelPermission


async def get_user_model_permissions(db: AsyncSession, user_id: str) -> list[str] | None:
    """获取用户的可用模型列表。如果返回 None 则表示拥有全部权限。"""
    row = await db.scalar(
        select(UserModelPermission.allowed_models).where(UserModelPermission.user_id == user_id)
    )
    if row is None:
        return None
    res_str = str(row).strip()
    if not res_str:
        return []
    return [m.strip() for m in res_str.split(",") if m.strip()]


async def set_user_model_permissions(db: AsyncSession, user_id: str, allowed_models: list[str] | None) -> None:
    """设置用户的可用模型列表。如果为 None 则删除记录，恢复为拥有全部权限。"""
    existing = await db.get(UserModelPermission, user_id)
    if allowed_models is None:
        if existing:
            await db.delete(existing)
    else:
        clean_models = [m.strip() for m in allowed_models if m.strip()]
        models_str = ",".join(clean_models)
        if existing:
            existing.allowed_models = models_str
        else:
            db.add(UserModelPermission(user_id=user_id, allowed_models=models_str))

