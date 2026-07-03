"""users.ad_guid / department / title — Windows AD binding (006-ad-auth)

Revision ID: 0010_ad_guid
Revises: 0009_role_menu
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_ad_guid"
down_revision: str | None = "0009_role_menu"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ad_guid", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("title", sa.String(255), nullable=True))
    op.create_index("ix_users_ad_guid", "users", ["ad_guid"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_ad_guid", table_name="users")
    op.drop_column("users", "title")
    op.drop_column("users", "department")
    op.drop_column("users", "ad_guid")
