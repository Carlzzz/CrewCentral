"""Alembic env for 设备域 DB (`DATABASE_URL_DEVICES`)."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db.devices_base import DevicesBase

# Import models so metadata is populated
from app.models.blocklist import BlocklistEntry  # noqa: F401
from app.models.device import Device, DevicePresence  # noqa: F401
from app.models.device_audit import AdminDeviceAction, DeviceCommand, DeviceLog  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = DevicesBase.metadata


def _sync_database_url() -> str:
    url = get_settings().database_url_devices
    if url.startswith("sqlite+aiosqlite"):
        return url.replace("sqlite+aiosqlite", "sqlite", 1)
    if url.startswith("postgresql+asyncpg"):
        return url.replace("postgresql+asyncpg", "postgresql+psycopg", 1)
    return url


def run_migrations_offline() -> None:
    url = _sync_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _sync_database_url()
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
