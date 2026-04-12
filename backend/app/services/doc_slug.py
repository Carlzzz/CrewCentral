"""Slug validation and reserved words."""

from __future__ import annotations

import re

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

RESERVED_SLUGS = frozenset(
    {
        "search",
        "login",
        "api",
        "admin",
        "auth",
        "docs",
        "download",
        "consent",
        "success",
        "cancelled",
        "releases",
        "devices",
        "skills",
        "release",
        "static",
        "assets",
        "healthz",
    }
)


def validate_slug(slug: str) -> str | None:
    s = slug.strip().lower()
    if not SLUG_RE.match(s):
        return "slug 仅允许小写字母、数字与连字符"
    if s in RESERVED_SLUGS:
        return "slug 与系统保留路径冲突"
    return None
