from __future__ import annotations

from pydantic import BaseModel, Field


class LoginBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str
    state: str | None = None


class ConsentBody(BaseModel):
    state: str = Field(..., min_length=8)


class RefreshBody(BaseModel):
    refresh_token: str
