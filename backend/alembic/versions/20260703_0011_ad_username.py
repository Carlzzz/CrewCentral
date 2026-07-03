"""users.username + email nullable — AD login by sAMAccountName (006-ad-auth)

Revision ID: 0011_ad_username
Revises: 0010_ad_guid
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_ad_username"
down_revision: str | None = "0010_ad_guid"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SQLite can't ALTER a column in place; batch mode recreates the table.
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("username", sa.String(255), nullable=True))
        batch.alter_column("email", existing_type=sa.String(255), nullable=True)
        batch.create_index("ix_users_username", ["username"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_username")
        batch.alter_column("email", existing_type=sa.String(255), nullable=False)
        batch.drop_column("username")
