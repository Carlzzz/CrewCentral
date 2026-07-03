import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # email 可空：AD 账号可能没有邮箱，此时用 username(sAMAccountName) 登录/映射。
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    # AD 登录名(sAMAccountName)。本地邮箱账号可为空；AD 账号必填且唯一。
    username: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # AD binding (006-ad-auth): immutable objectGUID (16-byte binary as hex),
    # plus attributes synced from AD. is_admin is intentionally NOT synced.
    ad_guid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # True once an admin sets the role manually — AD login/sync stops overwriting it.
    role_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
