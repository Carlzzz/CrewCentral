import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuthorizationRequest(Base):
    __tablename__ = "authorization_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    state: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    client_label: Mapped[str] = mapped_column(String(128), nullable=False)
    device_label: Mapped[str] = mapped_column(String(128), nullable=False)
    redirect_scheme: Mapped[str] = mapped_column(String(64), nullable=False)
    # 桌面客户端在打开 /auth/login 时传入，用于授权完成后写入设备域（注册 + 在线心跳）
    device_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(32), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    platform: Mapped[str | None] = mapped_column(String(32), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
