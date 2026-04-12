"""Initial device schema (SQLite / PostgreSQL via SQLAlchemy metadata)."""

from alembic import op
from sqlalchemy import inspect

revision = "0001_device"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from app.db.devices_base import DevicesBase
    from app.models.blocklist import BlocklistEntry  # noqa: F401
    from app.models.device import Device, DevicePresence  # noqa: F401
    from app.models.device_audit import AdminDeviceAction, DeviceCommand, DeviceLog  # noqa: F401

    bind = op.get_bind()
    if bind is None:
        return
    insp = inspect(bind)
    if insp.has_table("devices"):
        return
    DevicesBase.metadata.create_all(bind=bind)


def downgrade() -> None:
    from app.db.devices_base import DevicesBase
    from app.models.blocklist import BlocklistEntry  # noqa: F401
    from app.models.device import Device, DevicePresence  # noqa: F401
    from app.models.device_audit import AdminDeviceAction, DeviceCommand, DeviceLog  # noqa: F401

    bind = op.get_bind()
    if bind is None:
        return
    DevicesBase.metadata.drop_all(bind=bind)
