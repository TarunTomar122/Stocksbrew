from __future__ import annotations

"""Write a compact frontend data-health snapshot to tm_data_health/{MARKET}.

This script is intentionally read-mostly and cheap. It samples the materialized
documents the frontend depends on, classifies freshness, and writes one summary
doc that can be used by ops/UI without fan-out reads.
"""

import argparse
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.market_session_state import MARKET_TIMEZONES, session_doc_id
from backend.price_pipeline_contract import is_current_market_timestamp
from backend.storage import TraceMoneyStore

MARKET_FEED_AGING_HOURS = 36
MARKET_FEED_STALE_HOURS = 84


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    return value


def _json_size(value: Any) -> int:
    return len(json.dumps(_serialize(value) or {}, separators=(",", ":"), default=str).encode("utf-8"))


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _age_hours(value: Any) -> float | None:
    dt = _parse_time(value)
    if not dt:
        return None
    return round(max(0.0, (_now() - dt).total_seconds() / 3600.0), 2)


def _status(age_hours: float | None, aging_hours: float, stale_hours: float) -> str:
    if age_hours is None:
        return "unknown"
    if age_hours >= stale_hours:
        return "stale"
    if age_hours >= aging_hours:
        return "aging"
    return "fresh"


def _count_collection(store: TraceMoneyStore, collection: str) -> int | None:
    try:
        result = store.db.collection(collection).count().get()
        if result and result[0]:
            return int(result[0][0].value)
    except Exception:
        return None
    return None


def _first_ordered_doc(
    store: TraceMoneyStore,
    collection: str,
    field: str,
    *,
    market: str | None = None,
) -> dict[str, Any] | None:
    try:
        query = store.db.collection(collection)
        if market:
            query = query.where(filter=FieldFilter("market", "==", market))
        query = query.order_by(field, direction=firestore.Query.DESCENDING).limit(1)
        docs = list(query.stream())
        if not docs:
            return None
        data = _serialize(docs[0].to_dict()) or {}
        data["_doc_id"] = docs[0].id
        return data
    except Exception:
        return None


def _get_doc(store: TraceMoneyStore, path: str) -> dict[str, Any] | None:
    snap = store.db.document(path).get()
    if not snap.exists:
        return None
    data = _serialize(snap.to_dict()) or {}
    data["_doc_id"] = snap.id
    return data


def _freshness_item(
    *,
    name: str,
    path: str,
    data: dict[str, Any] | None,
    timestamp_fields: list[str],
    aging_hours: float,
    stale_hours: float,
    count_fields: list[str] | None = None,
) -> dict[str, Any]:
    timestamp_value: Any = None
    timestamp_field = ""
    if data:
        for field in timestamp_fields:
            if data.get(field):
                timestamp_value = data.get(field)
                timestamp_field = field
                break

    age = _age_hours(timestamp_value)
    item: dict[str, Any] = {
        "name": name,
        "path": path,
        "exists": bool(data),
        "status": _status(age, aging_hours, stale_hours),
        "timestamp_field": timestamp_field or None,
        "timestamp": timestamp_value,
        "age_hours": age,
        "aging_hours": aging_hours,
        "stale_hours": stale_hours,
        "approx_bytes": _json_size(data),
    }
    if data and count_fields:
        counts: dict[str, int] = {}
        for field in count_fields:
            value = data.get(field)
            if isinstance(value, list):
                counts[field] = len(value)
            elif isinstance(value, dict):
                counts[field] = len(value)
        if counts:
            item["counts"] = counts
    return item


def _open_session_item(
    *,
    market: str,
    data: dict[str, Any] | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Report whether today's opening publish chain actually completed.

    Wall-clock freshness alone is insufficient after the market opens: a
    20-hour-old anomaly or watchlist document is still "fresh" under a daily
    TTL while being wrong for the current session. The explicit session-stage
    record is the authoritative publish contract.
    """
    current = now or _now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    market = market.upper()
    zone = MARKET_TIMEZONES.get(market, timezone.utc)
    local = current.astimezone(zone)
    open_hour, open_minute = (9, 30) if market == "US" else (9, 15)
    # The opening chain starts with the 09:50 price batch; anomalies land a
    # few minutes later and the selected morning briefs by about 10:20.
    due_at = local.replace(hour=open_hour, minute=open_minute, second=0, microsecond=0) + timedelta(
        minutes=60
    )
    due = local.weekday() < 5 and local >= due_at
    required = ["price", "briefs", "anomalies"]
    stages = data.get("stages") if isinstance((data or {}).get("stages"), dict) else {}
    missing = [
        stage
        for stage in required
        if not isinstance(stages.get(stage), dict) or stages[stage].get("status") != "success"
    ]
    status = "stale" if due and missing else "fresh"
    return {
        "name": "open_session_pipeline",
        "path": f"tm_market_session_runs/{session_doc_id(market, 'open_check', local.date().isoformat())}",
        "exists": bool(data),
        "status": status,
        "due": due,
        "due_at": due_at.isoformat(),
        "required_stages": required,
        "missing_stages": missing if due else [],
        "session_date": local.date().isoformat(),
    }


def build_health(store: TraceMoneyStore, market: str) -> dict[str, Any]:
    market = market.upper()
    active = _get_doc(store, "tm_config/active_universes") or {}
    runtime_universe = str(
        active.get("US_universe")
        if market == "US"
        else active.get(f"{market}_price_universe") or active.get(f"{market}_ai_universe") or ""
    )

    doc_specs = [
        (
            "search_index",
            f"tm_search_index/{market}",
            ["updated_at"],
            24,
            72,
            ["entries"],
        ),
        (
            "home_view_core",
            f"tm_home_view_core/{market}",
            ["updated_at", "generated_at"],
            2,
            24,
            ["market_snapshot_rows"],
        ),
        (
            "home_news",
            f"tm_home_news/{market}",
            ["updated_at", "generated_at"],
            2,
            24,
            ["news"],
        ),
        (
            "home_view_full",
            f"tm_home_view/{market}",
            ["updated_at", "generated_at"],
            2,
            24,
            ["market_snapshot_rows", "news"],
        ),
        (
            "dashboard_view",
            f"tm_views_dashboard/{market}__{runtime_universe}",
            ["generated_at", "updated_at"],
            2,
            24,
            ["watchlist_rows", "gainers", "losers", "sector_context"],
        ),
        (
            "market_events",
            f"tm_market_events/{market}__latest",
            ["generated_at"],
            24,
            72,
            ["events"],
        ),
        (
            "daily_anomalies",
            f"tm_daily_anomalies/{market}__latest",
            ["enriched_at", "generated_at"],
            MARKET_FEED_AGING_HOURS,
            MARKET_FEED_STALE_HOURS,
            ["anomalies"],
        ),
        (
            "reddit_snapshot",
            f"reddit_snapshots/{market}__latest",
            ["generated_at"],
            MARKET_FEED_AGING_HOURS,
            MARKET_FEED_STALE_HOURS,
            ["tickers", "top_posts", "notable_discussions"],
        ),
        (
            "interesting_stocks",
            f"tm_interesting_stocks/{market}",
            ["generated_at"],
            24,
            72,
            ["rows"],
        ),
        (
            "heat_list_view",
            f"tm_heat_list_view/{market}",
            ["generated_at"],
            24,
            72,
            ["rows"],
        ),
        (
            "heat_list_full",
            f"tm_heat_list/{market}",
            ["generated_at"],
            24,
            72,
            ["rows"],
        ),
        (
            "divergence",
            f"tm_divergence/{market}",
            ["generated_at"],
            24,
            72,
            ["rows"],
        ),
        (
            "thematic_screens",
            f"tm_thematic_screens/{market}",
            ["generated_at"],
            24,
            72,
            ["screens"],
        ),
    ]

    items: dict[str, dict[str, Any]] = {}
    for name, path, fields, aging, stale, count_fields in doc_specs:
        items[name] = _freshness_item(
            name=name,
            path=path,
            data=_get_doc(store, path),
            timestamp_fields=fields,
            aging_hours=aging,
            stale_hours=stale,
            count_fields=count_fields,
        )

    session_path = session_doc_id(market, "open_check")
    items["open_session_pipeline"] = _open_session_item(
        market=market,
        data=_get_doc(store, f"tm_market_session_runs/{session_path}"),
    )

    # Once the opening chain is due, yesterday's anomaly and Radar watchlist
    # documents are stale even when their generic daily TTL has not expired.
    if items["open_session_pipeline"]["due"]:
        for key in ("daily_anomalies",):
            timestamp = items[key].get("timestamp")
            if not is_current_market_timestamp(timestamp, market=market):
                items[key]["status"] = "stale"
                items[key]["session_error"] = "not_current_market_session"

    latest_price = _first_ordered_doc(store, "tm_latest_prices", "updated_at", market=market)
    if latest_price is None:
        latest_price = _first_ordered_doc(store, "tm_latest_prices", "updated_at")
    items["latest_prices"] = _freshness_item(
        name="latest_prices",
        path=f"tm_latest_prices latest updated_at (market={market} preferred)",
        data=latest_price,
        timestamp_fields=["updated_at", "captured_at"],
        aging_hours=8,
        stale_hours=30,
    )
    items["latest_prices"]["collection_count"] = _count_collection(store, "tm_latest_prices")

    latest_facts = _first_ordered_doc(store, "tm_stock_facts", "captured_at", market=market)
    if latest_facts is None:
        latest_facts = _first_ordered_doc(store, "tm_stock_facts", "captured_at")
    items["stock_facts"] = _freshness_item(
        name="stock_facts",
        path=f"tm_stock_facts latest captured_at (market={market} preferred)",
        data=latest_facts,
        timestamp_fields=["captured_at", "updated_at"],
        aging_hours=24 * 7,
        stale_hours=24 * 14,
    )
    items["stock_facts"]["collection_count"] = _count_collection(store, "tm_stock_facts")

    latest_watchlist = _first_ordered_doc(store, "tm_watchlist_views", "built_at")
    items["watchlist_views"] = _freshness_item(
        name="watchlist_views",
        path="tm_watchlist_views latest built_at",
        data=latest_watchlist,
        timestamp_fields=["built_at", "updated_at"],
        aging_hours=24,
        stale_hours=72,
        count_fields=["rows"],
    )
    items["watchlist_views"]["collection_count"] = _count_collection(store, "tm_watchlist_views")
    if items["open_session_pipeline"]["due"] and not is_current_market_timestamp(
        items["watchlist_views"].get("timestamp"),
        market=market,
    ):
        items["watchlist_views"]["status"] = "stale"
        items["watchlist_views"]["session_error"] = "not_current_market_session"

    radar_specs = (
        ("radar_evidence", "tm_radar_evidence", "detected_at", 24, 72),
        ("radar_events", "tm_radar_events", "detected_at", 24, 72),
        ("radar_stock_state", "tm_radar_stock_state", "as_of", 24, 72),
        ("radar_user_views", "tm_radar_user_views", "updated_at", 24, 72),
    )
    for name, collection, timestamp_field, aging, stale in radar_specs:
        latest = _first_ordered_doc(store, collection, timestamp_field, market=market)
        if latest is None:
            latest = _first_ordered_doc(store, collection, timestamp_field)
        items[name] = _freshness_item(
            name=name,
            path=f"{collection} latest {timestamp_field}",
            data=latest,
            timestamp_fields=[timestamp_field, "updated_at"],
            aging_hours=aging,
            stale_hours=stale,
        )
        items[name]["collection_count"] = _count_collection(store, collection)

    latest_run = _first_ordered_doc(store, "tm_pipeline_runs", "updated_at", market=market)
    items["pipeline_runs"] = _freshness_item(
        name="pipeline_runs",
        path=f"tm_pipeline_runs latest updated_at (market={market})",
        data=latest_run,
        timestamp_fields=["updated_at", "created_at"],
        aging_hours=12,
        stale_hours=36,
    )
    if latest_run:
        items["pipeline_runs"]["latest_lane"] = latest_run.get("lane")
        items["pipeline_runs"]["latest_run_status"] = latest_run.get("status")
        if latest_run.get("status") == "failed":
            items["pipeline_runs"]["status"] = "stale"

    severity_order = {"unknown": 0, "fresh": 1, "aging": 2, "stale": 3}
    worst = max((item["status"] for item in items.values()), key=lambda s: severity_order.get(str(s), 0))
    stale_items = sorted([name for name, item in items.items() if item["status"] == "stale"])
    aging_items = sorted([name for name, item in items.items() if item["status"] == "aging"])

    return {
        "market": market,
        "generated_at": _now_iso(),
        "runtime_universe": runtime_universe,
        "overall_status": worst,
        "stale_items": stale_items,
        "aging_items": aging_items,
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit frontend Firestore data freshness and write tm_data_health/{market}")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    payload = build_health(store, args.market)
    if args.dry_run:
        print(json.dumps(payload, indent=2, sort_keys=True, default=str))
        return

    store.db.collection("tm_data_health").document(args.market.upper()).set(payload)
    print(
        {
            "market": payload["market"],
            "overall_status": payload["overall_status"],
            "stale_items": payload["stale_items"],
            "aging_items": payload["aging_items"],
        }
    )


if __name__ == "__main__":
    main()
