from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.auth.role_model_permission_service import (
    get_role_model_permissions,
    set_role_model_permissions,
)
from app.auth.role_service import ROLE_MENUS
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/models", tags=["models-admin"])


class SetRolePermissionsBody(BaseModel):
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
                return rc_ok(resp.json())
            return rc_err(f"无法从网关获取模型列表: 状态码 {resp.status_code}")
    except Exception as e:
        return rc_err(f"无法从网关获取模型列表: {str(e)}")


@router.get("/roles")
async def list_role_model_permissions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("models.manage")),
) -> dict:
    """获取所有角色及其模型权限配置"""
    items = []
    for role in ROLE_MENUS:
        allowed = await get_role_model_permissions(db, role)
        items.append({"role": role, "allowed_models": allowed})
    return rc_ok({"items": items})


@router.post("/roles/{role}")
async def set_role_permissions_route(
    role: str,
    body: SetRolePermissionsBody,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("models.manage")),
) -> dict:
    """设置指定角色的模型权限。传入 null 表示无限制。不允许修改 super_admin。"""
    if role not in ROLE_MENUS:
        return rc_err("无效的角色")
    if role == "super_admin":
        return rc_err("super_admin 始终无限制，不可修改")
    await set_role_model_permissions(db, role, body.allowed_models)
    await db.commit()
    return rc_ok(message="权限更新成功")
