"""ldap3 wrapper for Windows AD bind-auth and user search (006-ad-auth).

Synchronous by design (ldap3 has no asyncio backend); callers run these in a
thread via ``anyio.to_thread.run_sync`` so an unreachable AD fails fast without
blocking the event loop. No AD password is ever logged (FR-009).
"""

from __future__ import annotations

import logging
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
    raw: dict = field(default_factory=dict)


def _guid_to_hex(value: object) -> str | None:
    """objectGUID comes back as raw 16 bytes; store as lowercase hex."""
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, str) and value:
        # Some servers/config return it already formatted ({...}); keep as-is trimmed.
        return value.strip("{}").lower()
    return None


def _first(value: object) -> str | None:
    """ldap3 attribute values may be a list; take the first non-empty scalar."""
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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
