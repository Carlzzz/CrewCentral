"""Smoke test for model_ops_admin router registration.

Validates the router imports, the app builds, and the expected routes are
mounted under the configured base_path. Does not perform real HTTP requests
against CrewProxy; end-to-end forwarding is verified by Task 10.
"""

import asyncio

from app.core.config import get_settings
from app.main import create_app


async def main() -> None:
    app = create_app()
    settings = get_settings()
    bp = (settings.base_path or "").rstrip("/")
    expected_suffixes = (
        "/api/v1/admin/model-ops/providers/config",
        "/api/v1/admin/model-ops/providers/validate",
        "/api/v1/admin/model-ops/providers/effective",
    )
    expected = {bp + s for s in expected_suffixes}
    actual = {getattr(r, "path", "") for r in app.routes}
    missing = expected - actual
    assert not missing, f"missing routes: {missing}"
    print("MODEL_OPS ROUTER OK")


if __name__ == "__main__":
    asyncio.run(main())
