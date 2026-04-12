from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.client_release import ClientRelease

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ClientReleaseAsset(Base):
    __tablename__ = "client_release_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    release_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("client_releases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    download_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger(), nullable=True)
    md5: Mapped[str] = mapped_column(String(64), nullable=False)
    sha256: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    release: Mapped["ClientRelease"] = relationship("ClientRelease", back_populates="assets")
