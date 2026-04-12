"""SQLite 等驱动常返回无时区 datetime，与 UTC aware 比较会抛 TypeError。"""

from __future__ import annotations

from datetime import UTC, datetime


def ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)
