"""seed providers.manage menu permission for admin roles

Revision ID: 0016_providers_manage_menu
Revises: 0015_gateway_menu
Create Date: 2026-07-08
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "0016_providers_manage_menu"
down_revision: str | None = "0015_gateway_menu"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PROVIDERS_ROLES = ("super_admin", "ops_admin")


def upgrade() -> None:
    for role in PROVIDERS_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = menu_keys || ',providers.manage' "
                "WHERE role = :r AND (menu_keys IS NULL OR menu_keys NOT LIKE '%providers.manage%')"
            ).bindparams(r=role)
        )
        op.execute(
            sa.text(
                "INSERT OR IGNORE INTO role_menu_permissions(role, menu_keys) "
                "VALUES (:r, 'providers.manage')"
            ).bindparams(r=role)
        )


def downgrade() -> None:
    for role in PROVIDERS_ROLES:
        op.execute(
            sa.text(
                "UPDATE role_menu_permissions "
                "SET menu_keys = TRIM("
                "  REPLACE(',' || menu_keys || ',', ',providers.manage,', ','), ','"
                ") "
                "WHERE role = :r"
            ).bindparams(r=role)
        )
