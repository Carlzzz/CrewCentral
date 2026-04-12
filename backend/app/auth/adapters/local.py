"""Local email/password authentication (bcrypt)."""

from app.auth.adapters.base import AuthAdapter


class LocalAuthAdapter(AuthAdapter):
    def name(self) -> str:
        return "local"
