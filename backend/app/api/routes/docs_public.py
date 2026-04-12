"""Public docs — anonymous GET (constitution: contract-first)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.doc_page import DocPage
from app.schemas.docs import DocPagePublicOut
from app.schemas.rc import rc_err, rc_ok
from app.services.doc_search import search_docs
from app.services.doc_tree import build_tree

router = APIRouter(prefix="/public/docs", tags=["docs-public"])
log = logging.getLogger(__name__)


@router.get("/tree")
async def get_tree(
    db: AsyncSession = Depends(get_db),
    nav_section: str | None = Query(default=None),
) -> dict[str, Any]:
    stmt = select(DocPage).where(DocPage.status == "published")
    if nav_section:
        stmt = stmt.where(DocPage.nav_section == nav_section)
    stmt = stmt.order_by(DocPage.nav_section, DocPage.sort_order, DocPage.title)
    rows = list((await db.scalars(stmt)).all())
    roots = build_tree(rows)
    return rc_ok({"roots": [r.model_dump() for r in roots]})


@router.get("/pages/{slug}")
async def get_page(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    row = await db.scalar(select(DocPage).where(DocPage.slug == slug.strip().lower(), DocPage.status == "published"))
    if row is None:
        log.info("docs page not found slug=%s", slug)
        return rc_err("文档不存在或未发布")
    data = DocPagePublicOut(
        slug=row.slug,
        title=row.title,
        body_md=row.body_md,
        nav_section=row.nav_section,  # type: ignore[arg-type]
    )
    return rc_ok(data.model_dump())


@router.get("/search")
async def search(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    if not q or not q.strip():
        return rc_err("请输入搜索关键词")
    try:
        hits = await search_docs(db, q.strip(), limit=limit)
    except Exception:
        log.exception("docs search failed q=%s", q)
        return rc_err("搜索失败")
    return rc_ok({"items": hits})
