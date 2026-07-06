"""ad_ou_mappings table — OU to role mapping (006-ad-auth)

Revision ID: 0014_ad_ou
Revises: 0013_roles
Create Date: 2026-07-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_ad_ou"
down_revision: str | None = "0013_roles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ad_ou_mappings",
        sa.Column("ou_name", sa.String(255), primary_key=True),
        sa.Column("role_key", sa.String(64), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ad_ou_mappings_role_key", "ad_ou_mappings", ["role_key"])


def downgrade() -> None:
    op.drop_index("ix_ad_ou_mappings_role_key", table_name="ad_ou_mappings")
    op.drop_table("ad_ou_mappings")
