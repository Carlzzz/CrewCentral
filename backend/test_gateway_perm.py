import asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.db.base import Base
from app.auth.role_service import menus_for_role, ensure_builtin_roles, ALL_MENU_KEYS


async def main() -> None:
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Sess = async_sessionmaker(eng, expire_on_commit=False)
    async with Sess() as db:
        await ensure_builtin_roles(db)
        super_perms = await menus_for_role(db, "super_admin")
        ops_perms = await menus_for_role(db, "ops_admin")
        assert "gateway" in super_perms, f"super_admin missing gateway: {super_perms}"
        assert "gateway" in ops_perms, f"ops_admin missing gateway: {ops_perms}"
        assert any(m["key"] == "gateway" for m in ALL_MENU_KEYS), "ALL_MENU_KEYS missing gateway"
    await eng.dispose()
    print("GATEWAY PERM TEST OK")


if __name__ == "__main__":
    asyncio.run(main())
