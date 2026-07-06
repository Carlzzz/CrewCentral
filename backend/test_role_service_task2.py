import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth.role_service import (
    create_role,
    delete_role,
    ensure_builtin_roles,
    list_roles,
    menus_for_role,
    serialize_role,
    set_user_role,
    update_role,
)
from app.db.base import Base
from app.models.ad_role_mapping import ADRoleMapping
from app.models.role_menu_permission import RoleMenuPermission
from app.models.user import User
from app.models.user_role import UserRole


async def main() -> None:
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Sess = async_sessionmaker(eng, expire_on_commit=False)
    async with Sess() as db:
        await ensure_builtin_roles(db)
        roles = await list_roles(db)
        assert [r.key for r in roles][:5] == [
            "super_admin",
            "skill_admin",
            "ops_admin",
            "docs_admin",
            "viewer",
        ]

        custom = await create_role(
            db,
            key=" IT_Support ",
            label="IT支持",
            is_admin=True,
            menu_keys=["home", "invalid", "devices", "devices"],
        )
        assert custom.key == "it_support"
        assert await menus_for_role(db, "it_support") == ["home", "devices"]

        updated = await update_role(
            db,
            key="it_support",
            label="IT 支持组",
            is_admin=False,
            menu_keys=["home", "usage"],
        )
        assert updated is not None
        assert updated.label == "IT 支持组"
        assert updated.is_admin is False
        assert await menus_for_role(db, "it_support") == ["home", "usage"]

        super_updated = await update_role(
            db,
            key="super_admin",
            label="超级管理员2",
            is_admin=False,
            menu_keys=["home"],
        )
        assert super_updated is not None
        assert super_updated.is_admin is True
        assert await menus_for_role(db, "super_admin") == [
            "home",
            "download",
            "docs",
            "skills",
            "skills.assignments",
            "devices",
            "releases",
            "docs.manage",
            "users.manage",
            "usage",
            "models.manage",
        ]

        ok, msg = await delete_role(db, "super_admin")
        assert ok is False and "系统内置" in msg

        user = User(email="a@example.com")
        db.add(user)
        await db.flush()
        assert await set_user_role(db, user_id=user.id, role="it_support") == "it_support"
        assert await set_user_role(db, user_id=user.id, role="missing_role") is None
        ok, msg = await delete_role(db, "it_support")
        assert ok is False and "用户使用" in msg

        await db.delete(await db.get(UserRole, user.id))
        await db.flush()
        db.add(ADRoleMapping(ad_group="SG-IT", role_key="it_support", priority=10))
        await db.flush()
        ok, msg = await delete_role(db, "it_support")
        assert ok is False and "AD 组映射" in msg

        await db.delete(await db.get(ADRoleMapping, "SG-IT"))
        await db.flush()
        ok, msg = await delete_role(db, "it_support")
        assert ok is True and "角色已删除" in msg
        assert await db.get(RoleMenuPermission, "it_support") is None

        viewer = [r for r in await list_roles(db) if r.key == "viewer"][0]
        payload = serialize_role(viewer, ["home"], user_count=2, ad_mapping_count=3)
        assert payload["key"] == "viewer"
        assert payload["menu_keys"] == ["home"]
        assert payload["user_count"] == 2
        assert payload["ad_mapping_count"] == 3

    await eng.dispose()
    print("ROLE SERVICE TASK2 TEST OK")


if __name__ == "__main__":
    asyncio.run(main())
