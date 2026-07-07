"""FastAPI entry: Base Path, Session + JWT separation, router order."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import (
    account,
    ad_auth,
    admin_sessions,
    auth_refresh,
    consent,
    devices_admin,
    devices_client,
    docs_admin,
    docs_public,
    gateway_admin,
    login,
    models_admin,
    releases_admin,
    releases_client,
    releases_public,
    skills_admin,
    skills_client,
    skills_hub_public,
    usage_admin,
    users_admin,
    users_client,
)
from app.auth import routes as auth_routes
from app.core.config import get_settings
from app.db.devices_base import DevicesBase
from app.db.devices_session import devices_engine
from app.jobs.flush_presence import flush_presence_loop

# Register device models on metadata before create_all
from app.models.blocklist import BlocklistEntry  # noqa: F401
from app.models.device import Device, DevicePresence  # noqa: F401
from app.models.device_audit import AdminDeviceAction, DeviceCommand, DeviceLog  # noqa: F401

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with devices_engine.begin() as conn:
        await conn.run_sync(DevicesBase.metadata.create_all)
    stop = asyncio.Event()
    task = asyncio.create_task(flush_presence_loop(stop))
    try:
        yield
    finally:
        stop.set()
        try:
            await asyncio.wait_for(task, timeout=8)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="CrewCentral", version="0.1.0", lifespan=lifespan)

    cookie_path = settings.base_path if settings.base_path != "/" else "/"
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        max_age=86400 * 7,
        same_site="lax",
        https_only=False,
        path=cookie_path,
    )
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    bp = settings.base_path.rstrip("/") or ""
    root = APIRouter(prefix=bp if bp else "")

    # JSON API under /api/v1
    root.include_router(login.router, prefix="/api/v1")
    root.include_router(ad_auth.router, prefix="/api/v1")
    root.include_router(consent.router, prefix="/api/v1")
    root.include_router(auth_refresh.router, prefix="/api/v1")
    root.include_router(admin_sessions.router, prefix="/api/v1")
    root.include_router(devices_client.router, prefix="/api/v1")
    root.include_router(devices_admin.router, prefix="/api/v1")
    root.include_router(skills_client.router, prefix="/api/v1")
    root.include_router(skills_admin.router, prefix="/api/v1")
    root.include_router(releases_public.router, prefix="/api/v1")
    root.include_router(releases_client.router, prefix="/api/v1")
    root.include_router(releases_admin.router, prefix="/api/v1")
    root.include_router(users_admin.router, prefix="/api/v1")
    root.include_router(models_admin.router, prefix="/api/v1")
    root.include_router(gateway_admin.router, prefix="/api/v1")
    root.include_router(users_client.router, prefix="/api/v1")
    root.include_router(account.router, prefix="/api/v1")
    root.include_router(docs_public.router, prefix="/api/v1")
    root.include_router(docs_admin.router, prefix="/api/v1")
    root.include_router(usage_admin.router, prefix="/api/v1")

    # Browser /auth/* (per constitution)
    root.include_router(auth_routes.router, prefix="/auth")

    # Skill Hub 终端契约：{base_path}/index.json、{base_path}/skills/packages/...
    root.include_router(skills_hub_public.router)

    app.include_router(root)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    log.info("Mounted app under base_path=%s", bp or "/")
    return app


app = create_app()
