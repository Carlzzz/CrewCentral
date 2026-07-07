"""seed gateway menu permission for admin roles

Revision ID: 0015_gateway_menu
Revises: 0014_ad_ou
Create Date: 2026-07-07
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0015_gateway_menu"
down_revision: str | None = "0014_ad_ou"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GATEWAY_ROLES = ("super_admin", "ops_admin")


def upgrade() -> None:
    # Append 'gateway' to existing role_menu_permissions rows (CSV menu_keys).
    for role in GATEWAY_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = menu_keys || ',gateway' "
                "WHERE role = :r AND (menu_keys IS NULL OR menu_keys NOT LIKE '%gateway%')"
            ).bindparams(r=role)
        )
        # For a fresh DB where ensure_builtin_roles hasn't seeded the row yet,
        # insert a minimal row (ensure_builtin_roles will broaden it on next run).
        op.execute(
            sa.text(
                "INSERT OR IGNORE INTO role_menu_permissions(role, menu_keys) "
                "VALUES (:r, 'gateway')"
            ).bindparams(r=role)
        )


def downgrade() -> None:
    for role in GATEWAY_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = TRIM("
                "  REPLACE(',' || menu_keys || ',', ',gateway,', ','), ','"
                ") "
                "WHERE role = :r"
            ).bindparams(r=role)
        )
