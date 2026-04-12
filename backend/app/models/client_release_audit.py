from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.client_release import ClientRelease

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ClientReleaseAudit(Base):
    __tablename__ = "client_release_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    release_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("client_releases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    diff_summary: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    release: Mapped["ClientRelease"] = relationship("ClientRelease", back_populates="audits")
