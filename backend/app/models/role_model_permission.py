from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RoleModelPermission(Base):
    __tablename__ = "role_model_permissions"

    role: Mapped[str] = mapped_column(String(64), primary_key=True)
    allowed_models: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
