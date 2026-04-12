"""Docs admin — Session + admin only."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_session_permission
from app.db.session import get_db
from app.models.doc_page import DocPage
from app.models.user import User
from app.schemas.docs import DocPageAdminOut, DocPageCreateBody, DocPagePatchBody
from app.schemas.rc import rc_err, rc_ok
from app.services.doc_search import delete_fts_row, sync_fts_row
from app.services.doc_slug import validate_slug
from app.services.doc_tree import build_tree
from app.services.markdown_safe import markdown_to_plain

router = APIRouter(prefix="/admin/docs", tags=["docs-admin"])
log = logging.getLogger(__name__)


async def _child_count(db: AsyncSession, parent_id: str) -> int:
    return int(
        await db.scalar(select(func.count()).select_from(DocPage).where(DocPage.parent_id == parent_id)) or 0
    )


@router.get("/tree")
async def admin_tree(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    rows = list((await db.scalars(select(DocPage).order_by(DocPage.nav_section, DocPage.sort_order))).all())
    roots = build_tree(rows)
    return rc_ok({"roots": [r.model_dump() for r in roots]})


@router.get("/pages")
async def list_pages(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    rows = (await db.scalars(select(DocPage).order_by(DocPage.nav_section, DocPage.sort_order))).all()
    items = [DocPageAdminOut.from_row(r).model_dump() for r in rows]
    return rc_ok({"items": items})


@router.get("/pages/{page_id}")
async def get_page(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    row = await db.scalar(select(DocPage).where(DocPage.id == page_id))
    if row is None:
        return rc_err("文档不存在")
    return rc_ok(DocPageAdminOut.from_row(row).model_dump())


@router.post("/pages")
async def create_page(
    body: DocPageCreateBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    _ = admin
    err = validate_slug(body.slug)
    if err:
        return rc_err(err)
    plain = markdown_to_plain(body.body_md)
    row = DocPage(
        id=str(uuid.uuid4()),
        slug=body.slug.strip().lower(),
        title=body.title.strip(),
        body_md=body.body_md,
        body_plain=plain,
        nav_section=body.nav_section,
        parent_id=body.parent_id,
        sort_order=body.sort_order,
        status=body.status,
        published_at=datetime.now(timezone.utc) if body.status == "published" else None,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return rc_err("slug 已存在")
    if row.status == "published":
        await sync_fts_row(db, row.id, row.title, plain)
    await db.commit()
    await db.refresh(row)
    log.info("doc_page created id=%s slug=%s", row.id, row.slug)
    return rc_ok(DocPageAdminOut.from_row(row).model_dump(), message="创建成功")


@router.patch("/pages/{page_id}")
async def patch_page(
    page_id: str,
    body: DocPagePatchBody,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    _ = admin
    row = await db.scalar(select(DocPage).where(DocPage.id == page_id))
    if row is None:
        return rc_err("文档不存在")
    if body.slug is not None:
        err = validate_slug(body.slug)
        if err:
            return rc_err(err)
        row.slug = body.slug.strip().lower()
    if body.title is not None:
        row.title = body.title.strip()
    if body.body_md is not None:
        row.body_md = body.body_md
        row.body_plain = markdown_to_plain(body.body_md)
    if body.nav_section is not None:
        row.nav_section = body.nav_section
    if body.parent_id is not None:
        if body.parent_id == page_id:
            return rc_err("不能将父节点设为自己")
        row.parent_id = body.parent_id
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.status is not None:
        row.status = body.status
        if body.status == "published" and row.published_at is None:
            row.published_at = datetime.now(timezone.utc)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return rc_err("slug 已存在")
    if row.status == "published":
        await sync_fts_row(db, row.id, row.title, row.body_plain)
    else:
        await delete_fts_row(db, row.id)
    await db.commit()
    await db.refresh(row)
    log.info("doc_page updated id=%s", row.id)
    return rc_ok(DocPageAdminOut.from_row(row).model_dump(), message="更新成功")


@router.delete("/pages/{page_id}")
async def delete_page(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    _ = admin
    row = await db.scalar(select(DocPage).where(DocPage.id == page_id))
    if row is None:
        return rc_err("文档不存在")
    if await _child_count(db, page_id) > 0:
        return rc_err("存在子文档，禁止删除（请先调整子节点）")
    await delete_fts_row(db, page_id)
    await db.execute(delete(DocPage).where(DocPage.id == page_id))
    await db.commit()
    log.info("doc_page deleted id=%s", page_id)
    return rc_ok(None, message="已删除")


@router.post("/pages/{page_id}/publish")
async def publish_page(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_session_permission("docs.manage")),
) -> dict[str, Any]:
    _ = admin
    row = await db.scalar(select(DocPage).where(DocPage.id == page_id))
    if row is None:
        return rc_err("文档不存在")
    row.status = "published"
    row.published_at = datetime.now(timezone.utc)
    row.body_plain = markdown_to_plain(row.body_md)
    await sync_fts_row(db, row.id, row.title, row.body_plain)
    await db.commit()
    await db.refresh(row)
    log.info("doc_page published id=%s", page_id)
    return rc_ok(DocPageAdminOut.from_row(row).model_dump(), message="已发布")
