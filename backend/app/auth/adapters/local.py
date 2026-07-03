"""Local email/password authentication (bcrypt)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.adapters.base import AuthAdapter
from app.core.security import verify_password
from app.models.user import User


class LocalAuthError(Exception):
    """Local auth failure with a user-safe message."""

    def __init__(self, message: str = "账号或密码错误") -> None:
        super().__init__(message)
        self.public_message = message


class LocalAuthAdapter(AuthAdapter):
    def name(self) -> str:
        return "local"

    async def authenticate(
        self, db: AsyncSession, *, account: str, password: str
    ) -> User:
        user = await db.scalar(select(User).where(User.email == account))
        if user is None or not user.password_hash:
            raise LocalAuthError()
        if not verify_password(password, user.password_hash):
            raise LocalAuthError()
        return user
