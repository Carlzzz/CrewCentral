"""Admin audit + device commands + lightweight logs (PG 设备域)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.devices_base import DevicesBase


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class AdminDeviceAction(DevicesBase):
    __tablename__ = "admin_device_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict | None] = mapped_column(
        MutableDict.as_mutable(_json_type()), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceCommand(DevicesBase):
    __tablename__ = "device_commands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    command: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceLog(DevicesBase):
    __tablename__ = "device_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
