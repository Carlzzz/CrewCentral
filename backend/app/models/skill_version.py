import uuid
from datetime import datetime

from sqlalchemy import BIGINT, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class SkillVersion(Base):
    __tablename__ = "skill_versions"
    __table_args__ = (UniqueConstraint("skill_id", "version", name="uq_skill_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    skill_id: Mapped[str] = mapped_column(String(36), ForeignKey("skills.id"), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    platforms: Mapped[list[str] | None] = mapped_column(MutableList.as_mutable(_json_type()), nullable=True)
    package_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    package_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    package_size: Mapped[int] = mapped_column(BIGINT, nullable=False, default=0)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
