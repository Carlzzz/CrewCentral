"""skills.distribution_enabled — client manifest / download gate

Revision ID: 0006_skill_dist
Revises: 0005_auth_device
Create Date: 2026-04-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_skill_dist"
down_revision: str | None = "0005_auth_device"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column(
            "distribution_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        sa.text(
            "UPDATE skills SET distribution_enabled = 1 "
            "WHERE id IN (SELECT DISTINCT skill_id FROM skill_assignments WHERE enabled = 1)"
        )
    )


def downgrade() -> None:
    op.drop_column("skills", "distribution_enabled")
