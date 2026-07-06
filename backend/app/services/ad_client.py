"""ldap3 wrapper for Windows AD bind-auth and user search (006-ad-auth).

Synchronous by design (ldap3 has no asyncio backend); callers run these in a
thread via ``anyio.to_thread.run_sync`` so an unreachable AD fails fast without
blocking the event loop. No AD password is ever logged (FR-009).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

from ldap3 import ALL, SUBTREE, Connection, Server, Tls
from ldap3.core.exceptions import (
    LDAPBindError,
    LDAPException,
    LDAPInvalidCredentialsResult,
    LDAPSocketOpenError,
)
from ldap3.utils.conv import escape_filter_chars

from app.core.config import Settings

log = logging.getLogger(__name__)

# userAccountControl bit flags
UAC_ACCOUNTDISABLE = 0x0002

# AD sub-error codes surfaced in the diagnostic message of error 49 (invalid creds)
_ERR_ACCOUNT_DISABLED = "533"
_ERR_ACCOUNT_LOCKED = "775"
_ERR_PASSWORD_EXPIRED = "701"
_ERR_MUST_CHANGE_PASSWORD = "773"


class ADError(Exception):
    """Base for AD failures. `public_message` is safe to show end users."""

    public_message = "认证服务暂时不可用，请联系管理员"


class ADUnavailable(ADError):
    """AD server unreachable / TLS handshake failed / config error."""

    public_message = "认证服务暂时不可用，请联系管理员"


class ADInvalidCredentials(ADError):
    public_message = "账号或密码错误"


class ADAccountDisabled(ADError):
    public_message = "账号已被禁用"


class ADPasswordExpired(ADError):
    public_message = "密码已过期，请在 Windows 上修改密码后重试"


@dataclass
class ADUserAttrs:
    """Normalized AD user attributes mapped to local field names."""

    ad_guid: str
    sam_account_name: str
    email: str | None = None
    display_name: str | None = None
    department: str | None = None
    title: str | None = None
    disabled: bool = False
    groups: list[str] = field(default_factory=list)
    raw: dict = field(default_factory=dict)


def _guid_to_hex(value: object) -> str | None:
    """Normalize objectGUID to a stable lowercase hex string.

    ldap3 returns objectGUID in different shapes depending on how the attribute
    is decoded: a raw 16-byte ``bytes`` (paged/raw search), or a formatted GUID
    string like ``{c82f1816-e1a9-42a2-91b2-1db242bb55a2}`` (``entry_attributes_as_dict``),
    either of which may be wrapped in a single-element list.

    Both are normalized to the same canonical 32-char hex (the standard GUID
    string form, no braces/dashes) so login and batch-sync produce an identical
    ``ad_guid`` for the same account. objectGUID stores the first three fields in
    little-endian byte order, so raw bytes are parsed via ``bytes_le``.
    """
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if isinstance(value, bytes):
        if len(value) != 16:
            return value.hex()
        return uuid.UUID(bytes_le=value).hex
    if isinstance(value, str) and value:
        # Formatted GUID ({8-4-4-4-12}); drop braces/dashes -> 32 hex chars.
        return value.strip("{}").replace("-", "").lower()
    return None


def _first(value: object) -> str | None:
    """ldap3 attribute values may be a list; take the first non-empty scalar."""
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _domain_root_from_dn(dn: str) -> str:
    """Infer the domain root DN from a possibly-narrow base DN.

    ``OU=Users,OU=ambilight,DC=ambilight,DC=cc`` -> ``DC=ambilight,DC=cc``.
    """
    dc_parts = [part.strip() for part in dn.split(",") if part.strip().lower().startswith("dc=")]
    return ",".join(dc_parts) if dc_parts else dn


def _member_of_cns(value: object) -> list[str]:
    """Extract group CNs from a memberOf attribute (list of group DNs).

    ``CN=SG-IT,OU=Security Group,...`` -> ``SG-IT``. Only the first RDN is taken;
    DNs are the AD-canonical form so the CN component is reliably first.
    """
    if value is None:
        return []
    dns = value if isinstance(value, (list, tuple)) else [value]
    cns: list[str] = []
    for dn in dns:
        text = str(dn).strip()
        if not text:
            continue
        first_rdn = text.split(",", 1)[0]
        key, _, cn = first_rdn.partition("=")
        if key.strip().lower() == "cn" and cn.strip():
            cns.append(cn.strip())
    return cns


class ADClient:
    def __init__(self, settings: Settings) -> None:
        self._s = settings
        if not settings.ad_url or not settings.ad_base_dn:
            raise ADUnavailable("AD 未正确配置")
        tls = None
        if settings.ad_tls_enabled:
            # Validate the server cert against the system trust store.
            import ssl

            tls = Tls(validate=ssl.CERT_REQUIRED)
        self._server = Server(
            settings.ad_url,
            get_info=ALL,
            use_ssl=settings.ad_url.lower().startswith("ldaps://"),
            tls=tls,
            connect_timeout=settings.ad_connect_timeout_seconds,
        )

    def _connect(self, user: str | None, password: str | None) -> Connection:
        try:
            conn = Connection(
                self._server,
                user=user,
                password=password,
                auto_bind=False,
                receive_timeout=self._s.ad_connect_timeout_seconds,
            )
            if self._s.ad_tls_enabled and not self._server.ssl:
                conn.open()
                conn.start_tls()
            if not conn.bind():
                self._raise_for_bind(conn)
            return conn
        except LDAPSocketOpenError as exc:
            log.warning("AD unreachable: %s", exc)
            raise ADUnavailable() from exc
        except LDAPInvalidCredentialsResult as exc:
            raise self._classify_invalid(str(exc)) from exc
        except (LDAPBindError, LDAPException) as exc:
            log.warning("AD bind error: %s", type(exc).__name__)
            raise ADUnavailable() from exc

    def _raise_for_bind(self, conn: Connection) -> None:
        result = conn.result or {}
        diagnostic = str(result.get("message", ""))
        if result.get("result") == 49:  # invalidCredentials
            raise self._classify_invalid(diagnostic)
        log.warning("AD bind failed: result=%s", result.get("result"))
        raise ADUnavailable()

    @staticmethod
    def _classify_invalid(diagnostic: str) -> ADError:
        # AD embeds a "data <code>" token in the diagnostic message of error 49.
        if _ERR_ACCOUNT_DISABLED in diagnostic or _ERR_ACCOUNT_LOCKED in diagnostic:
            return ADAccountDisabled()
        if _ERR_PASSWORD_EXPIRED in diagnostic or _ERR_MUST_CHANGE_PASSWORD in diagnostic:
            return ADPasswordExpired()
        return ADInvalidCredentials()

    def _attr_map(self, entry_attrs: dict) -> ADUserAttrs:
        s = self._s
        uac_raw = _first(entry_attrs.get("userAccountControl"))
        disabled = False
        if uac_raw and uac_raw.isdigit():
            disabled = bool(int(uac_raw) & UAC_ACCOUNTDISABLE)
        guid = _guid_to_hex(entry_attrs.get("objectGUID"))
        if not guid:
            raise ADUnavailable("AD 条目缺少 objectGUID")
        return ADUserAttrs(
            ad_guid=guid,
            sam_account_name=_first(entry_attrs.get("sAMAccountName")) or "",
            email=_first(entry_attrs.get(s.ad_attr_email)),
            display_name=_first(entry_attrs.get(s.ad_attr_display_name)),
            department=_first(entry_attrs.get(s.ad_attr_department)),
            title=_first(entry_attrs.get(s.ad_attr_title)),
            disabled=disabled,
            groups=_member_of_cns(entry_attrs.get("memberOf")),
        )

    def _search_attributes(self) -> list[str]:
        s = self._s
        return [
            "objectGUID",
            "sAMAccountName",
            "userAccountControl",
            s.ad_attr_email,
            s.ad_attr_display_name,
            s.ad_attr_department,
            s.ad_attr_title,
            "memberOf",
        ]

    def authenticate(self, account: str, password: str) -> ADUserAttrs:
        """Bind as the service account, locate the user, then re-bind as the user.

        Returns the mapped user attributes on success; raises an ``ADError``
        subclass whose ``public_message`` is safe to surface to the frontend.
        """
        if not account or not password:
            raise ADInvalidCredentials()

        # 1. Service-account bind to search for the user's DN.
        svc = self._connect(self._s.ad_bind_dn or None, self._s.ad_bind_password or None)
        try:
            safe_account = escape_filter_chars(account)
            search_filter = self._s.ad_user_search_filter.format(account=safe_account)
            svc.search(
                search_base=self._s.ad_base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=self._search_attributes(),
            )
            if not svc.entries:
                raise ADInvalidCredentials()
            entry = svc.entries[0]
            user_dn = entry.entry_dn
            attrs = self._attr_map(entry.entry_attributes_as_dict)
        finally:
            svc.unbind()

        if attrs.disabled:
            raise ADAccountDisabled()

        # 2. Re-bind as the user to verify the supplied password.
        user_conn = self._connect(user_dn, password)
        user_conn.unbind()
        return attrs

    def iter_users(self, base_dn: str | None = None, search_filter: str | None = None):
        """Paged search over user entries for batch sync. Yields ``ADUserAttrs``."""
        base = base_dn or self._s.ad_base_dn
        flt = search_filter or "(&(objectCategory=person)(objectClass=user))"
        svc = self._connect(self._s.ad_bind_dn or None, self._s.ad_bind_password or None)
        try:
            entries = svc.extend.standard.paged_search(
                search_base=base,
                search_filter=flt,
                search_scope=SUBTREE,
                attributes=self._search_attributes(),
                paged_size=self._s.ad_page_size,
                generator=True,
            )
            for item in entries:
                if item.get("type") != "searchResEntry":
                    continue
                raw_attrs = item.get("raw_attributes") or {}
                attrs = item.get("attributes") or {}
                # Prefer decoded attributes; objectGUID needs the raw bytes.
                merged = dict(attrs)
                if raw_attrs.get("objectGUID"):
                    val = raw_attrs["objectGUID"]
                    merged["objectGUID"] = val[0] if isinstance(val, list) else val
                try:
                    yield self._attr_map(merged)
                except ADError:
                    continue
        finally:
            svc.unbind()

    def list_groups(self, base_dn: str | None = None) -> list[dict[str, str]]:
        """List AD groups (CN + optional description) for the mapping picker.

        Uses AD_GROUP_BASE_DN when configured; otherwise searches the domain root
        inferred from AD_BASE_DN so a narrow user OU does not hide group OUs.
        """
        base = base_dn or self._s.ad_group_base_dn or _domain_root_from_dn(self._s.ad_base_dn)
        svc = self._connect(self._s.ad_bind_dn or None, self._s.ad_bind_password or None)
        out: list[dict[str, str]] = []
        try:
            entries = svc.extend.standard.paged_search(
                search_base=base,
                search_filter="(objectCategory=group)",
                search_scope=SUBTREE,
                attributes=["cn", "description"],
                paged_size=self._s.ad_page_size,
                generator=True,
            )
            for item in entries:
                if item.get("type") != "searchResEntry":
                    continue
                a = item.get("attributes") or {}
                cn = _first(a.get("cn"))
                if cn:
                    out.append({"cn": cn, "description": _first(a.get("description")) or ""})
        finally:
            svc.unbind()
        out.sort(key=lambda g: g["cn"].lower())
        return out
