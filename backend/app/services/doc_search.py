"""Full-text search: SQLite FTS5; PostgreSQL fallback ILIKE."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.doc_page import DocPage


def _fts_escape(q: str) -> str:
    return re.sub(r'["\\]', "", q).strip()


async def sync_fts_row(session: AsyncSession, doc_id: str, title: str, body_plain: str) -> None:
    settings = get_settings()
    if "sqlite" not in settings.database_url.lower():
        return
    await session.execute(text("DELETE FROM doc_pages_fts WHERE doc_page_id = :id"), {"id": doc_id})
    await session.execute(
        text("INSERT INTO doc_pages_fts (doc_page_id, title, body_plain) VALUES (:id, :t, :b)"),
        {"id": doc_id, "t": title, "b": body_plain},
    )


async def delete_fts_row(session: AsyncSession, doc_id: str) -> None:
    settings = get_settings()
    if "sqlite" not in settings.database_url.lower():
        return
    await session.execute(text("DELETE FROM doc_pages_fts WHERE doc_page_id = :id"), {"id": doc_id})


async def search_docs(
    session: AsyncSession,
    q: str,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    settings = get_settings()
    q2 = _fts_escape(q)
    if len(q2) < 1:
        return []

    if "sqlite" in settings.database_url.lower():
        terms = [t for t in q2.split() if t]
        if not terms:
            return []
        pat = " OR ".join(f"{t}*" for t in terms)
        sql = text(
            """
            SELECT d.slug, d.title,
                   snippet(doc_pages_fts, 2, '', '', '…', 24) AS snippet
            FROM doc_pages_fts AS f
            INNER JOIN doc_pages AS d ON d.id = f.doc_page_id
            WHERE f MATCH :pat AND d.status = 'published'
            LIMIT :lim
            """
        )
        rows = (await session.execute(sql, {"pat": pat, "lim": limit})).mappings().all()
        return [{"slug": r["slug"], "title": r["title"], "snippet": r["snippet"]} for r in rows]

    like = f"%{q2}%"
    stmt = (
        select(DocPage.slug, DocPage.title, DocPage.body_plain)
        .where(DocPage.status == "published")
        .where((DocPage.title.ilike(like)) | (DocPage.body_plain.ilike(like)))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for slug, title, body in rows:
        b = body or ""
        snip = b[:120] + ("…" if len(b) > 120 else "")
        out.append({"slug": slug, "title": title, "snippet": snip})
    return out
