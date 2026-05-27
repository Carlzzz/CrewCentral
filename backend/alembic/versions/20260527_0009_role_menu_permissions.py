"""add role_menu_permissions table

Revision ID: 0009_role_menu
Revises: 0008_role_perm
Create Date: 2026-05-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0009_role_menu'
down_revision: Union[str, None] = '0008_role_perm'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "role_menu_permissions",
        sa.Column("role", sa.String(64), primary_key=True),
        sa.Column("menu_keys", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("role_menu_permissions")
