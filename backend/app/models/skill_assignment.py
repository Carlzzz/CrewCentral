import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class SkillAssignment(Base):
    __tablename__ = "skill_assignments"
    __table_args__ = (
        UniqueConstraint(
            "skill_id", "target_type", "target_id", name="uq_skill_target_binding"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    skill_id: Mapped[str] = mapped_column(String(36), ForeignKey("skills.id"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, default="all_devices")
    platform_filter: Mapped[str | None] = mapped_column(String(32), nullable=True)
    config_json: Mapped[dict] = mapped_column(
        MutableDict.as_mutable(_json_type()), nullable=False, default=dict
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    updated_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
