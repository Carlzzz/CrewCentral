from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

NavSection = Literal["getting_started", "device", "skill_dev", "api_ref"]
DocStatus = Literal["draft", "published"]


class DocTreeNodeOut(BaseModel):
    id: str
    slug: str
    title: str
    nav_section: NavSection
    children: list[DocTreeNodeOut] = Field(default_factory=list)


class DocPagePublicOut(BaseModel):
    slug: str
    title: str
    body_md: str
    nav_section: NavSection


class SearchHitOut(BaseModel):
    slug: str
    title: str
    snippet: str | None = None


class DocPageCreateBody(BaseModel):
    slug: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=512)
    body_md: str = ""
    nav_section: NavSection
    parent_id: str | None = None
    sort_order: int = 0
    status: DocStatus = "draft"


class DocPagePatchBody(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    title: str | None = Field(default=None, min_length=1, max_length=512)
    body_md: str | None = None
    nav_section: NavSection | None = None
    parent_id: str | None = None
    sort_order: int | None = None
    status: DocStatus | None = None


class DocPageAdminOut(BaseModel):
    id: str
    slug: str
    title: str
    body_md: str
    nav_section: NavSection
    parent_id: str | None
    sort_order: int
    status: DocStatus
    published_at: str | None
    updated_at: str | None

    model_config = {"from_attributes": False}

    @classmethod
    def from_row(cls, r: Any) -> DocPageAdminOut:
        return cls(
            id=r.id,
            slug=r.slug,
            title=r.title,
            body_md=r.body_md,
            nav_section=r.nav_section,  # type: ignore[arg-type]
            parent_id=r.parent_id,
            sort_order=r.sort_order,
            status=r.status,  # type: ignore[arg-type]
            published_at=r.published_at.isoformat() if r.published_at else None,
            updated_at=r.updated_at.isoformat() if r.updated_at else None,
        )
