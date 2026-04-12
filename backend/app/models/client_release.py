from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.client_release_asset import ClientReleaseAsset
    from app.models.client_release_audit import ClientReleaseAudit

from sqlalchemy import DateTime, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ClientRelease(Base):
    __tablename__ = "client_releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    release_notes: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    changelog_entries: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    update_policy: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled_platforms: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    slogan: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    assets: Mapped[list["ClientReleaseAsset"]] = relationship(
        "ClientReleaseAsset",
        back_populates="release",
        cascade="all, delete-orphan",
    )
    audits: Mapped[list["ClientReleaseAudit"]] = relationship(
        "ClientReleaseAudit",
        back_populates="release",
        cascade="all, delete-orphan",
    )
