"""Seed sample doc pages for local dev.

Run from repo `backend/`:
  uv run python -m scripts.seed_doc_pages
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.doc_page import DocPage
from app.services.doc_search import sync_fts_row
from app.services.markdown_safe import markdown_to_plain


async def main() -> None:
    async with AsyncSessionLocal() as db:
        n = await db.scalar(select(func.count()).select_from(DocPage))
        if n and n > 0:
            print("doc_pages already seeded, skip")
            return

        samples = [
            (
                "intro-welcome",
                "欢迎使用",
                "# 欢迎\n\n这是 **快速入门** 示例。\n\n```python\nprint('hello')\n```\n",
                "getting_started",
            ),
            (
                "device-setup",
                "设备接入概览",
                "## 设备接入\n\n请遵循安全规范。\n",
                "device",
            ),
        ]
        for slug, title, md, sec in samples:
            plain = markdown_to_plain(md)
            row = DocPage(
                id=str(uuid.uuid4()),
                slug=slug,
                title=title,
                body_md=md,
                body_plain=plain,
                nav_section=sec,
                parent_id=None,
                sort_order=0,
                status="published",
            )
            db.add(row)
            await db.flush()
            await sync_fts_row(db, row.id, row.title, plain)
        await db.commit()
        print("seeded doc_pages")


if __name__ == "__main__":
    asyncio.run(main())
