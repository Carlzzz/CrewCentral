from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocPage(Base):
    __tablename__ = "doc_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    body_md: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    body_plain: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    nav_section: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("doc_pages.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
