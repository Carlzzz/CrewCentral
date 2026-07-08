from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/model-ops/providers", tags=["model-ops-admin"])


async def _proxy(method: str, path: str, json_body: dict | None = None) -> dict:
    """转发到 CrewProxy /admin/config* 接口。"""
    settings = get_settings()
    url = f"{settings.crew_proxy_url.rstrip('/')}{path}"
    headers = {}
    if settings.crew_proxy_api_key:
        headers["Authorization"] = f"Bearer {settings.crew_proxy_api_key}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.request(method, url, headers=headers, json=json_body)
        if resp.status_code in (401, 403):
            return rc_err("CrewProxy 鉴权失败，请检查 crew_proxy_api_key 配置")
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            return rc_err(f"CrewProxy 返回 {resp.status_code}: {detail}")
        try:
            return rc_ok(resp.json())
        except Exception:
            return rc_err("CrewProxy 返回非 JSON")
    except Exception as e:
        return rc_err(f"无法连接 CrewProxy: {e}")


@router.get("/config")
async def provider_config(
    _admin: User = Depends(require_session_permission("providers.manage")),
) -> dict:
    """转发 GET /admin/config，读取 providers 配置。"""
    return await _proxy("GET", "/admin/config")


@router.post("/validate")
async def provider_validate(
    request: Request,
    _admin: User = Depends(require_session_permission("providers.manage")),
) -> dict:
    """转发 POST /admin/config/validate，校验 providers 配置。"""
    body = await request.json()
    return await _proxy("POST", "/admin/config/validate", json_body=body)


@router.put("/config")
async def provider_save(
    request: Request,
    _admin: User = Depends(require_session_permission("providers.manage")),
) -> dict:
    """转发 PUT /admin/config，保存 providers 配置。"""
    body = await request.json()
    return await _proxy("PUT", "/admin/config", json_body=body)


@router.get("/effective")
async def provider_effective(
    _admin: User = Depends(require_session_permission("providers.manage")),
) -> dict:
    """转发 GET /admin/config/effective，返回已生效的 providers 配置。"""
    return await _proxy("GET", "/admin/config/effective")
