from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/models", tags=["models-admin"])


class SetPermissionsBody(BaseModel):
    allowed_models: list[str] | None = Field(default=None)


@router.get("/available")
async def list_available_models(
    _admin: User = Depends(require_session_permission("models.manage")),
) -> dict:
    """从 CrewProxy 获取当前所有可用的模型列表"""
    settings = get_settings()
    url = f"{settings.crew_proxy_url.rstrip('/')}/models"
    headers = {}
    if settings.crew_proxy_api_key:
        headers["Authorization"] = f"Bearer {settings.crew_proxy_api_key}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                # Return the list of models returned by the proxy
                return rc_ok(resp.json())
            return rc_err(f"无法从网关获取模型列表: 状态码 {resp.status_code}")
    except Exception as e:
        return rc_err(f"无法从网关获取模型列表: {str(e)}")


@router.get("/users")
async def list_user_model_permissions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("models.manage")),
) -> dict:
    """获取所有用户及其关联的模型权限"""
    from app.auth.model_permission_service import get_user_model_permissions

    rows = await db.scalars(select(User).order_by(User.created_at.desc()))
    items = []
    for u in rows.all():
        allowed_models = await get_user_model_permissions(db, u.id)
        items.append({
            "id": u.id,
            "email": u.email,
            "display_name": u.display_name,
            "allowed_models": allowed_models,
        })
    return rc_ok({"items": items})


@router.post("/users/{user_id}")
async def set_user_permissions_route(
    user_id: str,
    body: SetPermissionsBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("models.manage")),
) -> dict:
    """设置指定用户的模型权限列表。传入 null 表示允许全部。"""
    u = await db.scalar(select(User).where(User.id == user_id))
    if u is None:
        return rc_err("用户不存在")

    from app.auth.model_permission_service import set_user_model_permissions

    await set_user_model_permissions(db, user_id, body.allowed_models)
    await db.commit()
    return rc_ok(message="权限更新成功")
