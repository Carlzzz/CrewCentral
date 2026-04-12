"""Trusted proxy aware client IP extraction."""

from __future__ import annotations

import ipaddress
from ipaddress import IPv4Network, IPv6Network

from fastapi import Request

from app.core.config import get_settings


def _parse_cidrs(raw: str) -> list[IPv4Network | IPv6Network]:
    out: list[IPv4Network | IPv6Network] = []
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        out.append(ipaddress.ip_network(p, strict=False))
    return out


def client_ip(request: Request) -> str:
    """Return best-effort client IP using X-Forwarded-For when peer is trusted."""
    settings = get_settings()
    trusted = _parse_cidrs(settings.trusted_proxy_cidrs)
    client_host = request.client.host if request.client else "127.0.0.1"
    try:
        peer = ipaddress.ip_address(client_host)
    except ValueError:
        return client_host

    if not trusted or not any(peer in net for net in trusted):
        return client_host

    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if not xff:
        return client_host

    parts = [p.strip() for p in xff.split(",") if p.strip()]
    if not parts:
        return client_host
    # Use left-most as original client when behind trusted proxy (common pattern)
    return parts[0]
