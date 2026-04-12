"""Infer desktop OS from User-Agent and optional Client Hints (Sec-CH-UA-Platform)."""

from __future__ import annotations

import re
from typing import Literal

PlatformGuess = Literal["windows", "macos", "linux", "unknown"]


def infer_platform(
    user_agent: str | None,
    sec_ch_ua_platform: str | None = None,
) -> PlatformGuess:
    hint = (sec_ch_ua_platform or "").lower()
    if "windows" in hint:
        return "windows"
    if "macos" in hint or "mac os" in hint:
        return "macos"
    if "linux" in hint:
        return "linux"

    ua = (user_agent or "").lower()
    if not ua:
        return "unknown"

    if "windows nt" in ua or "win64" in ua or "wow64" in ua:
        return "windows"
    if "mac os x" in ua or "macintosh" in ua:
        return "macos"
    if re.search(r"\blinux\b", ua) or "x11" in ua:
        return "linux"

    return "unknown"
