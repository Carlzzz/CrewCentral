import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class SkillDownloadToken(Base):
    __tablename__ = "skill_download_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    skill_version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("skill_versions.id"), nullable=False, index=True
    )
    principal_type: Mapped[str] = mapped_column(String(16), nullable=False)
    principal_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SkillAuditLog(Base):
    __tablename__ = "skill_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    skill_id: Mapped[str] = mapped_column(String(36), ForeignKey("skills.id"), nullable=False, index=True)
    skill_version_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("skill_versions.id"), nullable=True, index=True
    )
    detail_json: Mapped[dict] = mapped_column(
        MutableDict.as_mutable(_json_type()), nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
