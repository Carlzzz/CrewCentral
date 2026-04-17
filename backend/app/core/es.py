"""Elasticsearch async client singleton for proxy usage analytics."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)
_client: httpx.AsyncClient | None = None


def _base_url() -> str | None:
    url = get_settings().es_node.rstrip("/")
    return url if url else None


async def get_es() -> httpx.AsyncClient | None:
    global _client
    base = _base_url()
    if not base:
        return None
    if _client is None:
        _client = httpx.AsyncClient(base_url=base, timeout=15.0)
        log.info("ES client created: %s", base)
    return _client


async def es_search(body: dict[str, Any], *, source: list[str] | None = None) -> dict[str, Any]:
    client = await get_es()
    if client is None:
        return {"hits": {"total": {"value": 0}, "hits": []}, "aggregations": {}}
    settings = get_settings()
    url = f"/{settings.es_index}/_search"
    if source is not None:
        body["_source"] = source
    resp = await client.post(url, json=body, headers={"Content-Type": "application/json"})
    resp.raise_for_status()
    return resp.json()
