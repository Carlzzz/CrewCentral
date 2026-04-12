"""authorization_requests: device context for post-consent registry

Revision ID: 0005_auth_device
Revises: 0004_doc_pages
Create Date: 2026-04-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_auth_device"
down_revision: str | None = "0004_doc_pages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("authorization_requests", sa.Column("device_uuid", sa.String(length=64), nullable=True))
    op.add_column("authorization_requests", sa.Column("mac_address", sa.String(length=32), nullable=True))
    op.add_column("authorization_requests", sa.Column("os_version", sa.String(length=64), nullable=True))
    op.add_column("authorization_requests", sa.Column("client_version", sa.String(length=32), nullable=True))
    op.add_column("authorization_requests", sa.Column("platform", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("authorization_requests", "platform")
    op.drop_column("authorization_requests", "client_version")
    op.drop_column("authorization_requests", "os_version")
    op.drop_column("authorization_requests", "mac_address")
    op.drop_column("authorization_requests", "device_uuid")
