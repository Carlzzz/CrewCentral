"""replace user_model_permissions with role_model_permissions

Revision ID: 0008_role_perm
Revises: 2a789444e08d
Create Date: 2026-05-26 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0008_role_perm'
down_revision: Union[str, None] = '2a789444e08d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "role_model_permissions",
        sa.Column("role", sa.String(64), primary_key=True),
        sa.Column("allowed_models", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_model_permissions" in inspector.get_table_names():
        op.drop_table("user_model_permissions")


def downgrade() -> None:
    op.create_table(
        "user_model_permissions",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("allowed_models", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.drop_table("role_model_permissions")
