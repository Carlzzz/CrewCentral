"""Device + presence (PG 设备域)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.devices_base import DevicesBase


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class Device(DevicesBase):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("device_uuid", "owner_user_id", name="uq_device_uuid_owner"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_uuid: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    owner_user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    last_ip_geo: Mapped[str | None] = mapped_column(String(128), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    current_skill_slug: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="offline")
    blocked_reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    hardware_snapshot: Mapped[dict | None] = mapped_column(
        MutableDict.as_mutable(_json_type()), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DevicePresence(DevicesBase):
    __tablename__ = "device_presence"

    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    redis_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
