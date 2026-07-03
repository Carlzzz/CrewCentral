from __future__ import annotations

from pydantic import BaseModel, Field


class ADLoginBody(BaseModel):
    account: str = Field(..., min_length=1, max_length=255, description="sAMAccountName")
    password: str = Field(..., min_length=1)
    state: str | None = None


class ADSyncBody(BaseModel):
    base_dn: str | None = Field(default=None, max_length=512)
    filter: str | None = Field(default=None, max_length=512)
    dry_run: bool = False


class ADSyncResult(BaseModel):
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = Field(default_factory=list)
    dry_run: bool = False
