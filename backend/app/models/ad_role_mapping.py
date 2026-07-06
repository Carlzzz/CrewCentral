from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADRoleMapping(Base):
    """Maps an AD group CN to a database role key.

    When a user belongs to several mapped AD groups, the mapping with the
    highest priority wins. Ties are resolved by ad_group sort order in service code.
    """

    __tablename__ = "ad_role_mappings"

    ad_group: Mapped[str] = mapped_column(String(255), primary_key=True)
    role_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
