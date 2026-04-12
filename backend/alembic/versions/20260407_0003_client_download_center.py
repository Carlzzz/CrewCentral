"""client download center schema

Revision ID: 0003_client_download_center
Revises: 0002_skill_hub
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_client_download_center"
down_revision: str | None = "0002_skill_hub"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "client_releases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("release_notes", sa.Text(), nullable=False),
        sa.Column("changelog_entries", sa.JSON(), nullable=True),
        sa.Column("update_policy", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled_platforms", sa.JSON(), nullable=False),
        sa.Column("logo_url", sa.String(length=512), nullable=True),
        sa.Column("slogan", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version", name="uq_client_releases_version"),
    )

    op.create_table(
        "client_release_assets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("release_id", sa.String(length=36), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("download_url", sa.String(length=2048), nullable=False),
        sa.Column("file_name", sa.String(length=512), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("md5", sa.String(length=64), nullable=False),
        sa.Column("sha256", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["release_id"], ["client_releases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("release_id", "platform", name="uq_client_release_asset_platform"),
    )
    op.create_index(op.f("ix_client_release_assets_release_id"), "client_release_assets", ["release_id"])

    op.create_table(
        "client_release_audits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("release_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=False),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("diff_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["release_id"], ["client_releases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_release_audits_release_id"), "client_release_audits", ["release_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_client_release_audits_release_id"), table_name="client_release_audits")
    op.drop_table("client_release_audits")
    op.drop_index(op.f("ix_client_release_assets_release_id"), table_name="client_release_assets")
    op.drop_table("client_release_assets")
    op.drop_table("client_releases")
