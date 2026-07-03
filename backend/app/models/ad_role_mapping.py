from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADRoleMapping(Base):
    """Maps an AD group (by CN) to a dynamic role with its own menu permissions.

    Each AD group becomes a role. When a user belongs to several mapped groups,
    the one with the highest ``priority`` wins (006-ad-auth).
    """

    __tablename__ = "ad_role_mappings"

    # AD group common name (memberOf CN), e.g. "SG-IT". Serves as the role key.
    ad_group: Mapped[str] = mapped_column(String(255), primary_key=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    menu_keys: Mapped[str] = mapped_column(Text, nullable=False, default="")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
