from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADOUMapping(Base):
    """Maps an AD organizational unit (by direct OU name) to a database role.

    OU mappings and AD group mappings share the same priority space: when a user
    matches both, the highest-priority mapping across both sources wins.
    """

    __tablename__ = "ad_ou_mappings"

    ou_name: Mapped[str] = mapped_column(String(255), primary_key=True)
    role_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
