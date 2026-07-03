"""Pluggable authentication adapter interface.

Each adapter resolves a set of credentials to a local ``User`` row, creating or
updating it as needed, so callers (routes) can establish a session uniformly
regardless of the underlying identity source (local password, AD, future IdP).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class AuthAdapter(ABC):
    @abstractmethod
    def name(self) -> str:
        """Stable identifier for this auth method (e.g. "local", "ad")."""
        raise NotImplementedError

    @abstractmethod
    async def authenticate(
        self, db: AsyncSession, *, account: str, password: str
    ) -> User:
        """Verify credentials and return the resolved local ``User``.

        Implementations should raise an adapter-specific exception carrying a
        user-safe message on failure. The returned user is flushed but not
        committed; the caller owns session establishment and the transaction.
        """
        raise NotImplementedError
