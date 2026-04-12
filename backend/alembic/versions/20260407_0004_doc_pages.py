"""doc pages + FTS5

Revision ID: 0004_doc_pages
Revises: 0003_client_download_center
Create Date: 2026-04-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_doc_pages"
down_revision: str | None = "0003_client_download_center"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "doc_pages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("body_plain", sa.Text(), nullable=False, server_default=""),
        sa.Column("nav_section", sa.String(length=32), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["doc_pages.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_doc_pages_slug"),
    )
    op.create_index(op.f("ix_doc_pages_parent_id"), "doc_pages", ["parent_id"], unique=False)
    op.create_index(op.f("ix_doc_pages_nav_section"), "doc_pages", ["nav_section"], unique=False)
    op.create_index(op.f("ix_doc_pages_status"), "doc_pages", ["status"], unique=False)

    op.execute(
        """
        CREATE VIRTUAL TABLE doc_pages_fts USING fts5(
            doc_page_id UNINDEXED,
            title,
            body_plain,
            tokenize='porter unicode61'
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS doc_pages_fts;")
    op.drop_index(op.f("ix_doc_pages_status"), table_name="doc_pages")
    op.drop_index(op.f("ix_doc_pages_nav_section"), table_name="doc_pages")
    op.drop_index(op.f("ix_doc_pages_parent_id"), table_name="doc_pages")
    op.drop_table("doc_pages")
