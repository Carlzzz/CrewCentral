"""roles table and AD group role mapping conversion

Revision ID: 0013_roles
Revises: 0012_ad_role
Create Date: 2026-07-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_roles"
down_revision: str | None = "0012_ad_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BUILTIN_ROLES = [
    ("super_admin", "超级管理员", True, True, 10),
    ("skill_admin", "技能管理员", True, True, 20),
    ("ops_admin", "运维管理员", True, True, 30),
    ("docs_admin", "文档管理员", True, True, 40),
    ("viewer", "普通用户", True, False, 100),
]


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    roles = sa.table(
        "roles",
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("is_system", sa.Boolean),
        sa.column("is_admin", sa.Boolean),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        roles,
        [
            {
                "key": key,
                "label": label,
                "is_system": is_system,
                "is_admin": is_admin,
                "sort_order": sort_order,
            }
            for key, label, is_system, is_admin, sort_order in BUILTIN_ROLES
        ],
    )

    # Convert the earlier AD mapping shape from AD-group-as-role to AD-group -> role_key.
    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.add_column(sa.Column("role_key", sa.String(64), nullable=True))

    op.execute(
        sa.text(
            "UPDATE ad_role_mappings SET role_key = ad_group "
            "WHERE ad_group IN ('super_admin','skill_admin','ops_admin','docs_admin','viewer')"
        )
    )
    op.execute(sa.text("UPDATE ad_role_mappings SET role_key = 'viewer' WHERE role_key IS NULL"))

    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.alter_column("role_key", existing_type=sa.String(64), nullable=False)
        batch.create_index("ix_ad_role_mappings_role_key", ["role_key"])
        batch.drop_column("label")
        batch.drop_column("menu_keys")
        batch.drop_column("is_admin")


def downgrade() -> None:
    with op.batch_alter_table("ad_role_mappings") as batch:
        batch.add_column(sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("menu_keys", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("label", sa.String(255), nullable=True))
        batch.drop_index("ix_ad_role_mappings_role_key")
        batch.drop_column("role_key")
    op.drop_table("roles")
