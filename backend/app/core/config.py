from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    base_path: str = "/woicrew"
    """Must match frontend basename, cookie Path, and reverse proxy."""

    frontend_origin: str = "http://127.0.0.1:5173"
    """Origin of the Vite dev server (no trailing slash)."""

    database_url: str = "sqlite+aiosqlite:///./dev.db"
    session_secret: str = "change-me-session-secret-min-32-chars!!"
    jwt_secret: str = "change-me-jwt-secret-min-32-chars!!!!"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 600
    refresh_token_expire_days: int = 7
    refresh_grace_seconds: int = 60
    """After rotation, the old refresh token is still accepted within this window."""
    skip_auth: int = 0
    """1 = development only: bypass password check for /api/v1/auth/login."""

    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # Device domain (002-device-manage); fallback SQLite file if unset for local dev
    database_url_devices: str = "sqlite+aiosqlite:///./devices_dev.db"
    redis_url: str = ""
    trusted_proxy_cidrs: str = "127.0.0.1/32,::1/128"
    geoip_mmdb_path: str = ""
    offline_threshold_minutes: int = 15

    # Skill hub (003-skill-hub)
    skill_storage_root: str = "./storage/skills"
    skill_download_token_ttl_seconds: int = 300
    skill_max_upload_mb: int = 50

    # Download center (004-download-center) — defaults for landing when release omits branding
    client_download_default_logo_url: str = ""
    client_download_default_slogan: str = "CrewCentral 客户端"

    # Proxy usage analytics (Elasticsearch)
    es_node: str = ""
    es_index: str = "woicrew-usage"

    # CrewProxy communication
    crew_proxy_url: str = "http://localhost:3456"
    crew_proxy_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
