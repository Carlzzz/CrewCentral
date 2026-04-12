"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-07
"""

from collections.abc import Sequence

from alembic import op

from app.db.base import Base
from app.models import AuthorizationRequest, RefreshToken, User, WebSession  # noqa: F401

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    # Ensure metadata is clean for first revision
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
