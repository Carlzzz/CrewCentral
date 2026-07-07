from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/gateway", tags=["gateway-admin"])


@router.get("/metrics")
async def gateway_metrics(
    _admin: User = Depends(require_session_permission("gateway")),
) -> dict:
    """转发到 CrewProxy GET /metrics，返回网关实时监控数据。"""
    settings = get_settings()
    url = f"{settings.crew_proxy_url.rstrip('/')}/metrics"
    headers = {}
    if settings.crew_proxy_api_key:
        headers["Authorization"] = f"Bearer {settings.crew_proxy_api_key}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=5.0)
            if resp.status_code == 200:
                return rc_ok(resp.json())
            return rc_err(f"网关返回状态码 {resp.status_code}")
    except Exception as e:
        return rc_err(f"无法连接网关: {e}")
