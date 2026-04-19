from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from pathlib import Path

from app.api.deps import require_session_permission
from app.core.config import get_settings
from app.db.session import get_db
from app.models.skill import Skill
from app.models.skill_assignment import SkillAssignment
from app.models.skill_audit import SkillAuditLog
from app.models.skill_version import SkillVersion
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok
from app.schemas.skills import AssignmentUpdateBody, ToggleDispatchBody
from app.services.skill_distribution import sync_skill_distribution_flags
from app.services.skill_registry import parse_upload_metadata, upsert_skill_version

router = APIRouter(prefix="/admin/skills", tags=["skills-admin"])


def _http_exc_message(exc: HTTPException) -> str:
    d = exc.detail
    if isinstance(d, str):
        return d
    if isinstance(d, list):
        parts: list[str] = []
        for item in d:
            if isinstance(item, dict) and item.get("msg") is not None:
                parts.append(str(item["msg"]))
            else:
                parts.append(str(item))
        return "; ".join(parts) if parts else "校验失败"
    return str(d) if d is not None else "校验失败"


@router.post("/upload")
async def upload_skill(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills")),
) -> dict:
    _ = request
    try:
        meta, raw_zip, package_hash = await parse_upload_metadata(file)
    except HTTPException as e:
        return rc_err(_http_exc_message(e))
    try:
        skill, ver = await upsert_skill_version(
            db,
            actor_user_id=admin.id,
            meta=meta,
            raw_zip=raw_zip,
            package_hash=package_hash,
        )
        db.add(
            SkillAuditLog(
                actor_user_id=admin.id,
                action="publish",
                skill_id=skill.id,
                skill_version_id=ver.id,
                detail_json={"slug": skill.slug, "version": ver.version},
            )
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return rc_err("保存失败：数据冲突或版本重复，请检查后重试")
    except HTTPException as e:
        await db.rollback()
        return rc_err(_http_exc_message(e))
    return rc_ok(
        {
            "skill_id": skill.id,
            "slug": skill.slug,
            "version_id": ver.id,
            "version": ver.version,
            "hash": ver.package_hash,
        },
        message="上传成功",
    )


@router.get("")
async def list_skills(
    request: Request,
    category: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills")),
) -> dict:
    _ = request, admin
    stmt = select(Skill)
    if category and category != "全部":
        stmt = stmt.where(Skill.category == category)
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.where(Skill.name.ilike(like) | Skill.slug.ilike(like))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.scalars(
            stmt.order_by(Skill.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()

    data = []
    for row in rows:
        latest = await db.get(SkillVersion, row.latest_version_id) if row.latest_version_id else None
        data.append(
            {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "category": row.category,
                "summary": row.summary,
                "icon_url": row.icon_url,
                "status": row.status,
                "latest_version": latest.version if latest else None,
                "distribution_enabled": row.distribution_enabled,
            }
        )
    return rc_ok({"items": data, "total": total, "page": page, "page_size": page_size})


@router.get("/{skill_id}/versions")
async def list_skill_versions(
    skill_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills")),
) -> dict:
    _ = request, admin
    rows = (
        await db.scalars(
            select(SkillVersion)
            .where(SkillVersion.skill_id == skill_id)
            .order_by(SkillVersion.published_at.desc())
        )
    ).all()
    return rc_ok(
        [
            {
                "id": r.id,
                "version": r.version,
                "description": r.description,
                "changelog": r.changelog,
                "platforms": r.platforms or [],
                "package_hash": r.package_hash,
                "published_at": r.published_at.isoformat(),
            }
            for r in rows
        ]
    )


@router.post("/{skill_id}/toggle-dispatch")
async def toggle_dispatch(
    skill_id: str,
    body: ToggleDispatchBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills")),
) -> dict:
    _ = request
    skill = await db.get(Skill, skill_id)
    if skill is None:
        return rc_err("技能不存在")
    target_type = "group"
    target_id = body.group_id if body.scope == "group_only" and body.group_id else "all"
    row = await db.scalar(
        select(SkillAssignment).where(
            SkillAssignment.skill_id == skill_id,
            SkillAssignment.target_type == target_type,
            SkillAssignment.target_id == target_id,
        )
    )
    if row is None:
        row = SkillAssignment(
            skill_id=skill_id,
            target_type=target_type,
            target_id=target_id,
            enabled=body.enabled,
            scope=body.scope,
            config_json={},
            updated_by=admin.id,
            priority=200,
        )
        db.add(row)
    else:
        row.enabled = body.enabled
        row.scope = body.scope
        row.updated_by = admin.id
    db.add(
        SkillAuditLog(
            actor_user_id=admin.id,
            action="toggle",
            skill_id=skill_id,
            skill_version_id=skill.latest_version_id,
            detail_json={"enabled": body.enabled, "scope": body.scope, "group_id": body.group_id},
        )
    )
    await db.flush()
    await sync_skill_distribution_flags(db, {skill_id})
    await db.commit()
    return rc_ok(message="分发状态已更新")


@router.put("/assignments")
async def update_assignments(
    body: AssignmentUpdateBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills.assignments")),
) -> dict:
    _ = request
    for item in body.skills:
        row = await db.scalar(
            select(SkillAssignment).where(
                SkillAssignment.skill_id == item.skill_id,
                SkillAssignment.target_type == body.target_type,
                SkillAssignment.target_id == body.target_id,
            )
        )
        if row is None:
            row = SkillAssignment(
                skill_id=item.skill_id,
                target_type=body.target_type,
                target_id=body.target_id,
                enabled=item.enabled,
                scope="all_devices",
                config_json=item.config,
                updated_by=admin.id,
                priority=10 if body.target_type == "user" else 100,
            )
            db.add(row)
        else:
            row.enabled = item.enabled
            row.config_json = item.config
            row.updated_by = admin.id
            row.priority = 10 if body.target_type == "user" else 100

        db.add(
            SkillAuditLog(
                actor_user_id=admin.id,
                action="assign" if item.enabled else "unassign",
                skill_id=item.skill_id,
                skill_version_id=None,
                detail_json={
                    "target_type": body.target_type,
                    "target_id": body.target_id,
                    "enabled": item.enabled,
                },
            )
        )

    await db.flush()
    await sync_skill_distribution_flags(db, {item.skill_id for item in body.skills})
    await db.commit()
    return rc_ok(message="绑定配置已保存")


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("skills")),
) -> dict:
    _ = request
    skill = await db.get(Skill, skill_id)
    if skill is None:
        return rc_err("技能不存在")

    # 获取所有版本并删除文件
    versions = (
        await db.scalars(select(SkillVersion).where(SkillVersion.skill_id == skill_id))
    ).all()

    settings = get_settings()
    for ver in versions:
        if ver.package_path:
            p = Path(ver.package_path)
            if p.is_file():
                try:
                    p.unlink()
                except OSError:
                    pass  # 删除失败继续执行

    # 删除相关记录（通过数据库级联或显式删除）
    await db.execute(
        SkillAssignment.__table__.delete().where(SkillAssignment.skill_id == skill_id)
    )
    await db.execute(
        SkillAuditLog.__table__.delete().where(SkillAuditLog.skill_id == skill_id)
    )
    await db.execute(
        SkillVersion.__table__.delete().where(SkillVersion.skill_id == skill_id)
    )
    await db.delete(skill)

    await db.commit()
    return rc_ok(message="技能已删除")
