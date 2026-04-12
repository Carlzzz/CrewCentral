from __future__ import annotations

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.devices_session import DevicesAsyncSessionLocal
from app.models.device import Device
from app.models.skill import Skill
from app.models.skill_assignment import SkillAssignment
from app.models.skill_version import SkillVersion


async def _has_device_access(user_id: str, device_uuid: str, platform: str) -> bool:
    async with DevicesAsyncSessionLocal() as ds:
        row = await ds.scalar(
            select(Device).where(Device.owner_user_id == user_id, Device.device_uuid == device_uuid)
        )
        if row is None:
            return False
    return bool(platform)


def _assignment_rank(target_type: str, priority: int) -> tuple[int, int]:
    # 用户级覆盖用户组，数值越小优先级越高
    base = 0 if target_type == "user" else 1
    return (base, priority)


async def resolve_manifest(
    db: AsyncSession,
    *,
    user_id: str,
    device_uuid: str,
    platform: str,
) -> list[dict]:
    if not await _has_device_access(user_id, device_uuid, platform):
        return []

    skills = (await db.scalars(select(Skill).where(Skill.status == "active"))).all()
    if not skills:
        return []

    assignments = (
        await db.scalars(
            select(SkillAssignment).where(
                SkillAssignment.enabled.is_(True),
                SkillAssignment.target_type.in_(["user", "group"]),
            )
        )
    ).all()

    # user / group:default 为权限配置页绑定；group + target_id=all 对应管理端「一键分发」（全量启用）
    candidates: dict[str, SkillAssignment] = {}
    user_group_ids = {f"user:{user_id}", "group:default"}
    for a in assignments:
        hit = (a.target_type == "user" and a.target_id == user_id) or (
            a.target_type == "group" and a.target_id in user_group_ids
        ) or (a.target_type == "group" and a.target_id == "all" and a.scope == "all_devices")
        if not hit:
            continue
        current = candidates.get(a.skill_id)
        if current is None or _assignment_rank(a.target_type, a.priority) < _assignment_rank(
            current.target_type, current.priority
        ):
            candidates[a.skill_id] = a

    out: list[dict] = []
    for s in skills:
        a = candidates.get(s.id)
        if a is None:
            continue
        if a.platform_filter and a.platform_filter.lower() != platform.lower():
            continue
        if s.latest_version_id is None:
            continue
        v = await db.get(SkillVersion, s.latest_version_id)
        if v is None:
            continue
        if v.platforms and platform.lower() not in [p.lower() for p in v.platforms]:
            continue
        out.append(
            {
                "skill_slug": s.slug,
                "name": s.name,
                "version": v.version,
                "description": v.description,
                "package_hash": v.package_hash,
                "config": a.config_json or {},
            }
        )
    return out


async def resolve_skill_version_for_download(
    db: AsyncSession,
    *,
    user_id: str,
    device_uuid: str,
    platform: str,
    skill_slug: str,
    version: str,
) -> SkillVersion | None:
    manifest = await resolve_manifest(
        db, user_id=user_id, device_uuid=device_uuid, platform=platform
    )
    allowed = next((m for m in manifest if m["skill_slug"] == skill_slug and m["version"] == version), None)
    if allowed is None:
        return None
    return await db.scalar(
        select(SkillVersion)
        .join(Skill, Skill.id == SkillVersion.skill_id)
        .where(and_(Skill.slug == skill_slug, SkillVersion.version == version))
    )
