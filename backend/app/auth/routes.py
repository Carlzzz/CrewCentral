"""Browser-facing /auth/* routes (redirects, session-bound JSON)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import create_authorization_request
from app.auth.role_service import get_user_role, menus_for_role
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User

router = APIRouter()


@router.get("/login")
async def auth_login_entry(
    request: Request,
    db: AsyncSession = Depends(get_db),
    client_label: str = "CrewCentral 客户端",
    device_label: str = "当前设备",
    redirect_scheme: str = "xiaolongxia",
    device_uuid: str | None = None,
    mac_address: str | None = None,
    os_version: str | None = None,
    client_version: str | None = None,
    platform: str | None = None,
) -> RedirectResponse:
    """Desktop client opens this URL; we create `state` and send user to SPA login.

    可选查询参数（供授权完成后在中控注册设备并监控）：device_uuid、mac_address、os_version、
    client_version、platform。其中 device_uuid 建议为客户端稳定唯一 ID。
    """
    row = await create_authorization_request(
        db,
        client_label=client_label,
        device_label=device_label,
        redirect_scheme=redirect_scheme,
        device_uuid=device_uuid,
        mac_address=mac_address,
        os_version=os_version,
        client_version=client_version,
        platform=platform,
    )
    await db.commit()
    settings = get_settings()
    base = settings.base_path.rstrip("/") or ""
    loc = f"{settings.frontend_origin}{base}/login?state={row.state}"
    return RedirectResponse(loc, status_code=302)


@router.get("/callback")
async def auth_oauth_callback(
    error: str | None = None,
    error_description: str | None = None,
) -> RedirectResponse:
    """SSO / IdP callback placeholder — redirect to SPA cancelled or login."""
    settings = get_settings()
    base = settings.base_path.rstrip("/") or ""
    if error:
        q = f"?error={error}"
        if error_description:
            q += f"&error_description={error_description}"
        return RedirectResponse(f"{settings.frontend_origin}{base}/cancelled{q}", status_code=302)
    return RedirectResponse(f"{settings.frontend_origin}{base}/login", status_code=302)


@router.get("/userinfo")
async def auth_userinfo(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Session-bound user profile for consent / SPA."""
    uid = request.session.get("uid")
    if not uid:
        return JSONResponse(status_code=401, content={"detail": "未登录"})
    user = await db.scalar(select(User).where(User.id == uid))
    if user is None:
        return JSONResponse(status_code=401, content={"detail": "用户不存在"})
    role = await get_user_role(db, user_id=user.id, is_admin=user.is_admin)
    menu_permissions = await menus_for_role(db, role)
    return JSONResponse(
        {
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
            "role": role,
            "menu_permissions": menu_permissions,
        }
    )


@router.get("/logout")
async def auth_logout(request: Request) -> RedirectResponse:
    request.session.clear()
    settings = get_settings()
    base = settings.base_path.rstrip("/") or ""
    return RedirectResponse(f"{settings.frontend_origin}{base}/login", status_code=302)
