"""skill hub schema

Revision ID: 0002_skill_hub
Revises: 0001
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_skill_hub"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.String(length=512), nullable=True),
        sa.Column("icon_url", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("latest_version_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_skills_slug"),
    )
    op.create_index(op.f("ix_skills_slug"), "skills", ["slug"], unique=False)

    op.create_table(
        "skill_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("skill_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("changelog", sa.Text(), nullable=True),
        sa.Column("platforms", sa.JSON(), nullable=True),
        sa.Column("package_path", sa.String(length=1024), nullable=False),
        sa.Column("package_hash", sa.String(length=128), nullable=False),
        sa.Column("package_size", sa.BigInteger(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("skill_id", "version", name="uq_skill_version"),
    )
    op.create_index(op.f("ix_skill_versions_skill_id"), "skill_versions", ["skill_id"], unique=False)

    op.create_table(
        "skill_assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("skill_id", sa.String(length=36), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("platform_filter", sa.String(length=32), nullable=True),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "skill_id", "target_type", "target_id", name="uq_skill_target_binding"
        ),
    )
    op.create_index(
        op.f("ix_skill_assignments_skill_id"), "skill_assignments", ["skill_id"], unique=False
    )
    op.create_index(
        op.f("ix_skill_assignments_target_id"), "skill_assignments", ["target_id"], unique=False
    )

    op.create_table(
        "skill_download_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("token_jti", sa.String(length=64), nullable=False),
        sa.Column("skill_version_id", sa.String(length=36), nullable=False),
        sa.Column("principal_type", sa.String(length=16), nullable=False),
        sa.Column("principal_id", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["skill_version_id"], ["skill_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_jti"),
    )
    op.create_index(
        op.f("ix_skill_download_tokens_token_jti"), "skill_download_tokens", ["token_jti"], unique=True
    )
    op.create_index(
        op.f("ix_skill_download_tokens_skill_version_id"),
        "skill_download_tokens",
        ["skill_version_id"],
        unique=False,
    )

    op.create_table(
        "skill_audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("skill_id", sa.String(length=36), nullable=False),
        sa.Column("skill_version_id", sa.String(length=36), nullable=True),
        sa.Column("detail_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.ForeignKeyConstraint(["skill_version_id"], ["skill_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_skill_audit_logs_skill_id"), "skill_audit_logs", ["skill_id"], unique=False)
    op.create_index(
        op.f("ix_skill_audit_logs_skill_version_id"), "skill_audit_logs", ["skill_version_id"], unique=False
    )

    op.create_foreign_key(
        "fk_skills_latest_version",
        "skills",
        "skill_versions",
        ["latest_version_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_skills_latest_version", "skills", type_="foreignkey")
    op.drop_index(op.f("ix_skill_audit_logs_skill_version_id"), table_name="skill_audit_logs")
    op.drop_index(op.f("ix_skill_audit_logs_skill_id"), table_name="skill_audit_logs")
    op.drop_table("skill_audit_logs")
    op.drop_index(op.f("ix_skill_download_tokens_skill_version_id"), table_name="skill_download_tokens")
    op.drop_index(op.f("ix_skill_download_tokens_token_jti"), table_name="skill_download_tokens")
    op.drop_table("skill_download_tokens")
    op.drop_index(op.f("ix_skill_assignments_target_id"), table_name="skill_assignments")
    op.drop_index(op.f("ix_skill_assignments_skill_id"), table_name="skill_assignments")
    op.drop_table("skill_assignments")
    op.drop_index(op.f("ix_skill_versions_skill_id"), table_name="skill_versions")
    op.drop_table("skill_versions")
    op.drop_index(op.f("ix_skills_slug"), table_name="skills")
    op.drop_table("skills")
