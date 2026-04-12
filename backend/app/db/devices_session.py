from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()
devices_engine = create_async_engine(_settings.database_url_devices, echo=False)
DevicesAsyncSessionLocal = async_sessionmaker(
    devices_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db_devices() -> AsyncGenerator[AsyncSession, None]:
    async with DevicesAsyncSessionLocal() as session:
        yield session
