"""ad_role_mappings + users.role_locked — AD group role control (006-ad-auth)

Revision ID: 0012_ad_role
Revises: 0011_ad_username
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_ad_role"
down_revision: str | None = "0011_ad_username"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ad_role_mappings",
        sa.Column("ad_group", sa.String(255), primary_key=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("menu_keys", sa.Text(), nullable=False, server_default=""),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column(
        "users",
        sa.Column("role_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "role_locked")
    op.drop_table("ad_role_mappings")
