"""Strip Markdown to plain text for search indexing (best-effort)."""

from __future__ import annotations

import re


def markdown_to_plain(md: str) -> str:
    s = md
    s = re.sub(r"```[\s\S]*?```", " ", s)
    s = re.sub(r"`[^`]*`", " ", s)
    s = re.sub(r"!\[[^\]]*]\([^)]*\)", " ", s)
    s = re.sub(r"\[([^\]]*)]\([^)]*\)", r"\1", s)
    s = re.sub(r"^#{1,6}\s+", "", s, flags=re.MULTILINE)
    s = re.sub(r"[*_~>#|`-]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()
