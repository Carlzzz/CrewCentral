from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Platform = Literal["windows", "macos", "linux"]
ReleaseStatus = Literal["draft", "published", "archived"]
UpdatePolicy = Literal["optional", "forced"]


class ChangelogEntryIn(BaseModel):
    type: Literal["new", "fix"]
    text: str = Field(..., min_length=1, max_length=4000)


class ReleaseAssetIn(BaseModel):
    platform: Platform
    download_url: str = Field(..., min_length=8, max_length=2048)
    file_name: str = Field(..., min_length=1, max_length=512)
    md5: str = Field(..., min_length=32, max_length=64)
    sha256: str = Field(..., min_length=64, max_length=128)
    file_size_bytes: int | None = None

    @field_validator("download_url")
    @classmethod
    def must_be_http(cls, v: str) -> str:
        if not (v.startswith("https://") or v.startswith("http://")):
            raise ValueError("download_url must be http(s)")
        return v


class ReleaseCreateBody(BaseModel):
    version: str = Field(..., min_length=1, max_length=64)
    release_notes: str = Field(default="", max_length=100_000)
    changelog_entries: list[ChangelogEntryIn] | None = None
    update_policy: UpdatePolicy = "optional"
    status: ReleaseStatus = "draft"
    enabled_platforms: list[Platform] = Field(default_factory=list)
    logo_url: str | None = Field(default=None, max_length=512)
    slogan: str | None = Field(default=None, max_length=256)
    assets: list[ReleaseAssetIn] = Field(default_factory=list)


class ReleasePatchBody(BaseModel):
    version: str | None = Field(default=None, min_length=1, max_length=64)
    release_notes: str | None = Field(default=None, max_length=100_000)
    changelog_entries: list[ChangelogEntryIn] | None = None
    update_policy: UpdatePolicy | None = None
    enabled_platforms: list[Platform] | None = None
    logo_url: str | None = None
    slogan: str | None = None
    assets: list[ReleaseAssetIn] | None = None


class AssetPublicOut(BaseModel):
    platform: Platform
    download_url: str
    file_name: str
    file_size_bytes: int | None
    md5: str
    sha256: str


class DownloadContextDataOut(BaseModel):
    version: str
    published_at: str | None = None
    slogan: str
    logo_url: str
    recommended_platform: Platform | None
    primary_asset: AssetPublicOut | None
    all_assets: list[AssetPublicOut]
    release_notes_excerpt: str
    changelog_entries: list[dict[str, Any]]


class LatestReleaseDataOut(BaseModel):
    is_latest: bool
    current_version: str | None
    target_version: str | None
    update_policy: UpdatePolicy | None
    assets: list[AssetPublicOut]
    release_notes_excerpt: str | None
