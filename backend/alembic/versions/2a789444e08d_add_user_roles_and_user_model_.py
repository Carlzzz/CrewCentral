"""add user_roles and user_model_permissions tables

Revision ID: 2a789444e08d
Revises: 0006_skill_dist
Create Date: 2026-05-26 13:45:18.823456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a789444e08d'
down_revision: Union[str, None] = '0006_skill_dist'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    if "user_roles" not in existing:
        op.create_table(
            "user_roles",
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("role", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "user_model_permissions" not in existing:
        op.create_table(
            "user_model_permissions",
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("allowed_models", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("user_model_permissions")
    op.drop_table("user_roles")
