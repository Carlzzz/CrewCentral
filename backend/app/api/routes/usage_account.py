"""Account-scoped usage analytics: each logged-in user sees only their own
token consumption. Session-only auth (no ``usage`` permission); the username
filter is enforced server-side so a user can never read another user's data.

Mirrors ``usage_admin`` query shapes, but drops the ``by_user`` breakdown
(the page is single-user) and scopes the model filter list to the caller.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.es import es_search, get_es
from app.db.session import get_db
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/account/usage", tags=["usage-account"])

TZ8 = timezone(timedelta(hours=8))


def _histogram_bucket_day(bucket: dict) -> str:
    """Parse date_histogram bucket to yyyy-MM-dd (ES may omit key_as_string)."""
    ks = bucket.get("key_as_string")
    if isinstance(ks, str):
        s = ks.strip()
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            return s[:10]
    key = bucket.get("key")
    if isinstance(key, (int, float)):
        dt = datetime.fromtimestamp(key / 1000.0, tz=timezone.utc).astimezone(TZ8)
        return dt.strftime("%Y-%m-%d")
    return ""


def _default_gte() -> str:
    dt = datetime.now(TZ8) - timedelta(days=7)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000+08:00")


def _parse_multi(param: str | None) -> list[str] | None:
    """将逗号分隔的字符串解析为列表，用于多选筛选"""
    if not param:
        return None
    result = [v.strip() for v in param.split(",") if v.strip()]
    return result if result else None


async def _require_session_user(request: Request, db: AsyncSession) -> User:
    """Session-only guard: any logged-in user. No permission check."""
    uid = request.session.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="未登录")
    row = await db.scalar(select(User).where(User.id == str(uid)))
    if row is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return row


def _user_identifiers(user: User) -> list[str]:
    """All non-empty, deduped values CrewProxy may record as ``username`` in ES.

    CrewProxy resolves the user name from CrewCentral's introspect endpoint
    (``data.name = display_name or email``) and writes it to the usage record's
    ``username`` field; clients may alternatively pass a name via the
    ``x-llm-proxy-user`` header. So ES ``username`` is most commonly the
    display_name, falling back to email - match on all of display_name / email /
    username to cover every recording path.
    """
    ids: list[str] = []
    for v in (user.display_name, user.email, user.username):
        if v and v not in ids:
            ids.append(v)
    return ids


def _user_filter_clause(user: User) -> dict | None:
    ids = _user_identifiers(user)
    if not ids:
        return None
    return {"terms": {"username.keyword": ids}}


@router.get("/overview")
async def my_usage_overview(
    request: Request,
    modelid: str | None = None,
    gte: str | None = None,
    lte: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await _require_session_user(request, db)
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置（请在 .env 设置 ES_NODE）")

    user_clause = _user_filter_clause(user)
    if user_clause is None:
        # No identifier to match on - the user has no usage by definition.
        return rc_ok({
            "total_calls": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_cached_tokens": 0,
            "by_model": [],
        })

    filters: list[dict] = [user_clause]
    modelids = _parse_multi(modelid)
    if modelids:
        filters.append({"terms": {"modelid.keyword": modelids}})
    range_q: dict = {"gte": gte or _default_gte()}
    if lte:
        range_q["lte"] = lte
    filters.append({"range": {"start_time": range_q}})

    body = {
        "size": 0,
        "track_total_hits": True,
        "query": {"bool": {"filter": filters}},
        "aggs": {
            "total_input": {"sum": {"field": "input_token"}},
            "total_output": {"sum": {"field": "output_token"}},
            "total_cached": {"sum": {"field": "input_cached_token"}},
            "by_model": {
                "terms": {"field": "modelid.keyword", "size": 50},
                "aggs": {
                    "input": {"sum": {"field": "input_token"}},
                    "output": {"sum": {"field": "output_token"}},
                    "calls": {"value_count": {"field": "start_time"}},
                },
            },
        },
    }
    result = await es_search(body)
    aggs = result.get("aggregations", {})
    total_hits = result.get("hits", {}).get("total", {}).get("value", 0)

    return rc_ok({
        "total_calls": total_hits,
        "total_input_tokens": int(aggs.get("total_input", {}).get("value", 0)),
        "total_output_tokens": int(aggs.get("total_output", {}).get("value", 0)),
        "total_cached_tokens": int(aggs.get("total_cached", {}).get("value", 0)),
        "by_model": [
            {
                "model": b["key"],
                "calls": int(b["calls"]["value"]),
                "input_tokens": int(b["input"]["value"]),
                "output_tokens": int(b["output"]["value"]),
            }
            for b in aggs.get("by_model", {}).get("buckets", [])
        ],
    })


@router.get("/trend")
async def my_usage_trend(
    request: Request,
    modelid: str | None = None,
    gte: str | None = None,
    lte: str | None = None,
    days: int = Query(14, ge=1, le=366),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await _require_session_user(request, db)
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置")

    if not gte:
        dt = datetime.now(TZ8) - timedelta(days=days)
        gte = dt.strftime("%Y-%m-%dT%H:%M:%S.000+08:00")

    user_clause = _user_filter_clause(user)
    if user_clause is None:
        # No identifier to match on - the user has no usage by definition.
        return rc_ok([])
    filters: list[dict] = [user_clause]
    modelids = _parse_multi(modelid)
    if modelids:
        filters.append({"terms": {"modelid.keyword": modelids}})
    range_q: dict = {"gte": gte}
    if lte:
        range_q["lte"] = lte
    filters.append({"range": {"start_time": range_q}})

    body = {
        "size": 0,
        "query": {"bool": {"filter": filters}},
        "aggs": {
            "by_day": {
                "date_histogram": {
                    "field": "start_time",
                    "calendar_interval": "day",
                    "time_zone": "Asia/Shanghai",
                    "format": "yyyy-MM-dd",
                    "min_doc_count": 1,
                },
                "aggs": {
                    "input_tokens": {"sum": {"field": "input_token"}},
                    "output_tokens": {"sum": {"field": "output_token"}},
                },
            }
        },
    }
    result = await es_search(body)
    buckets = result.get("aggregations", {}).get("by_day", {}).get("buckets", [])
    rows: list[dict] = []
    for b in buckets:
        day = _histogram_bucket_day(b)
        if not day:
            continue
        tin = b.get("input_tokens") or {}
        tout = b.get("output_tokens") or {}
        rows.append(
            {
                "date": day,
                "calls": int(b.get("doc_count", 0)),
                "input_tokens": int(tin.get("value", 0)),
                "output_tokens": int(tout.get("value", 0)),
            }
        )
    return rc_ok(rows)


@router.get("/filters")
async def my_usage_filters(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """返回当前用户用过的模型列表，供前端下拉筛选。用户列表无需返回（恒为本人）。"""
    user = await _require_session_user(request, db)
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置（请在 .env 设置 ES_NODE）")

    user_clause = _user_filter_clause(user)
    if user_clause is None:
        return rc_ok({"models": []})

    items: list[str] = []
    after_key: dict | None = None
    while True:
        composite: dict = {
            "sources": [{"val": {"terms": {"field": "modelid.keyword"}}}],
            "size": 10000,
        }
        if after_key:
            composite["after"] = after_key
        body = {
            "size": 0,
            "query": {"bool": {"filter": [user_clause]}},
            "aggs": {"comp": {"composite": composite}},
        }
        result = await es_search(body)
        comp = result.get("aggregations", {}).get("comp", {})
        for b in comp.get("buckets", []):
            key = b.get("key", {}).get("val")
            if key:
                items.append(key)
        after_key = comp.get("after_key")
        if not after_key or not comp.get("buckets"):
            break
    return rc_ok({"models": sorted(items)})
