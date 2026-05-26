"""Admin usage analytics APIs — queries Elasticsearch for proxy LLM call data."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import require_session_permission
from app.core.es import es_search, get_es
from app.models.user import User
from app.schemas.rc import rc_err, rc_ok

router = APIRouter(prefix="/admin/usage", tags=["usage-admin"])

TZ8 = timezone(timedelta(hours=8))


def _histogram_bucket_day(bucket: dict) -> str:
    """Parse date_histogram bucket to yyyy-MM-dd (ES may omit key_as_string in some versions)."""
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


@router.get("/overview")
async def usage_overview(
    _: Request,
    __: User = Depends(require_session_permission("usage")),
    username: str | None = None,
    gte: str | None = None,
    lte: str | None = None,
) -> dict:
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置（请在 .env 设置 ES_NODE）")

    filters: list[dict] = []
    if username:
        filters.append({"term": {"username.keyword": username}})
    range_q: dict = {"gte": gte or _default_gte()}
    if lte:
        range_q["lte"] = lte
    filters.append({"range": {"start_time": range_q}})

    body = {
        "size": 0,
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
            "by_user": {
                "terms": {"field": "username.keyword", "size": 10000},
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
        "by_user": [
            {
                "username": b["key"],
                "calls": int(b["calls"]["value"]),
                "input_tokens": int(b["input"]["value"]),
                "output_tokens": int(b["output"]["value"]),
            }
            for b in aggs.get("by_user", {}).get("buckets", [])
        ],
    })


@router.get("/trend")
async def usage_trend(
    _: Request,
    __: User = Depends(require_session_permission("usage")),
    username: str | None = None,
    gte: str | None = None,
    lte: str | None = None,
    days: int = Query(14, ge=1, le=90),
) -> dict:
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置")

    if not gte:
        dt = datetime.now(TZ8) - timedelta(days=days)
        gte = dt.strftime("%Y-%m-%dT%H:%M:%S.000+08:00")

    filters: list[dict] = []
    if username:
        filters.append({"term": {"username.keyword": username}})
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


@router.get("/records")
async def usage_records(
    _: Request,
    __: User = Depends(require_session_permission("usage")),
    username: str | None = None,
    modelid: str | None = None,
    session_id: str | None = None,
    gte: str | None = None,
    lte: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
) -> dict:
    if await get_es() is None:
        return rc_err("Elasticsearch 未配置")

    filters: list[dict] = []
    if username:
        filters.append({"term": {"username.keyword": username}})
    if modelid:
        filters.append({"term": {"modelid.keyword": modelid}})
    if session_id:
        filters.append({"term": {"session_id.keyword": session_id}})
    range_q: dict = {"gte": gte or _default_gte()}
    if lte:
        range_q["lte"] = lte
    filters.append({"range": {"start_time": range_q}})

    body = {
        "size": page_size,
        "from": (page - 1) * page_size,
        "sort": [{"start_time": "desc"}],
        "query": {"bool": {"filter": filters}},
        "track_total_hits": True,
    }
    result = await es_search(
        body,
        source=[
            "clientid", "username", "modelid",
            "input_token", "output_token", "input_cached_token",
            "start_time", "out_time", "cost_time",
            "stream", "session_id", "routing_key",
            "input_content", "output_content",
        ],
    )
    total = result.get("hits", {}).get("total", {}).get("value", 0)
    items = [h["_source"] for h in result.get("hits", {}).get("hits", [])]

    return rc_ok({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    })
