from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.rc import rc_ok
from app.schemas.skills import DownloadTokenBody
from app.services.download_token import issue_download_token, validate_download_token
from app.services.skill_distribution import resolve_manifest, resolve_skill_version_for_download

router = APIRouter(prefix="/skills", tags=["skills-client"])


@router.get("/manifest")
async def get_manifest(
    request: Request,
    device_uuid: str = Query(..., min_length=1),
    platform: str = Query(..., min_length=1),
    user_id: Annotated[str, Depends(get_current_user_id)] = "",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    _ = request
    items = await resolve_manifest(db, user_id=user_id, device_uuid=device_uuid, platform=platform)
    return rc_ok({"items": items})


@router.post("/{skill_slug}/download-token")
async def create_download_token(
    skill_slug: str,
    body: DownloadTokenBody,
    request: Request,
    platform: str = Query(..., min_length=1),
    user_id: Annotated[str, Depends(get_current_user_id)] = "",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> dict:
    _ = request
    ver = await resolve_skill_version_for_download(
        db,
        user_id=user_id,
        device_uuid=body.device_uuid,
        platform=platform,
        skill_slug=skill_slug,
        version=body.version,
    )
    if ver is None:
        return JSONResponse(status_code=403, content={"rc": 1, "message": "无权下载该版本", "data": None})

    token, expires_at = await issue_download_token(
        db,
        skill_version_id=ver.id,
        principal_type="user",
        principal_id=user_id,
    )
    await db.commit()
    return rc_ok(
        {
            "token": token,
            "expires_at": expires_at.isoformat(),
            "version": ver.version,
            "package_hash": ver.package_hash,
        }
    )


@router.get("/download")
async def download_skill(
    request: Request,
    token: str = Query(..., min_length=1),
    user_id: Annotated[str, Depends(get_current_user_id)] = "",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> FileResponse:
    _ = request
    try:
        row = await validate_download_token(
            db,
            token=token,
            principal_type="user",
            principal_id=user_id,
            mark_used=True,
        )
    except ValueError as e:
        return JSONResponse(status_code=403, content={"rc": 1, "message": str(e), "data": None})

    from app.models.skill_version import SkillVersion

    ver = await db.get(SkillVersion, row.skill_version_id)
    if ver is None:
        return JSONResponse(status_code=404, content={"rc": 1, "message": "版本不存在", "data": None})
    path = Path(ver.package_path)
    if not path.is_file():
        return JSONResponse(status_code=404, content={"rc": 1, "message": "文件不存在", "data": None})
    await db.commit()
    return FileResponse(path=path, filename=path.name, media_type="application/zip")
