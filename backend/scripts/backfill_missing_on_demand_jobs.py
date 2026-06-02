"""Backfill missing on-demand news jobs for tracked stocks.

Finds tracked instruments that do not yet have usable stock_intelligence in the
active AI universe and also do not already have a queued/running job, then
enqueues them.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from google.cloud.firestore_v1 import FieldFilter

from backend.storage import TraceMoneyStore

JOB_COLLECTION = "tm_on_demand_news_jobs"
USERS_COLLECTION = "users"
INSTRUMENTS_COLLECTION = "tm_tracked_instruments"
CONFIG_COLLECTION = "tm_config"
CONFIG_DOC = "active_universes"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _active_ai_universe(store: TraceMoneyStore, market: str) -> str:
    doc = store.db.collection(CONFIG_COLLECTION).document(CONFIG_DOC).get()
    data = doc.to_dict() if doc.exists else {}
    ai = str((data or {}).get(f"{market}_ai_universe") or "").strip()
    if ai:
        return ai
    broad = str((data or {}).get(f"{market}_universe") or "").strip()
    if broad:
        return broad
    return "in_core_60" if market == "IN" else "us_core_100"


def _tracked_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market}_"
    seen: set[str] = set()
    docs = (
        store.db.collection(USERS_COLLECTION)
        .where(filter=FieldFilter("tracked_stocks", "!=", []))
        .stream()
    )
    for doc in docs:
        data = doc.to_dict() or {}
        tracked = data.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            iid = str(raw or "").strip().upper()
            if iid.startswith(prefix):
                seen.add(iid)
    return sorted(seen)


def _has_usable_intel(store: TraceMoneyStore, market: str, universe: str, instrument_id: str) -> bool:
    snap = (
        store.db.collection("tm_news_runs")
        .document(f"{market}__{universe}")
        .collection("stock_intelligence")
        .document(instrument_id)
        .get()
    )
    if not snap.exists:
        return False
    data = snap.to_dict() or {}
    text = str(data.get("today_brief") or data.get("body") or data.get("headline") or "").strip()
    return bool(text)


def _job_status(store: TraceMoneyStore, instrument_id: str) -> str:
    snap = store.db.collection(JOB_COLLECTION).document(instrument_id).get()
    if not snap.exists:
        return ""
    data = snap.to_dict() or {}
    return str(data.get("status") or "").strip().lower()


def _queue(store: TraceMoneyStore, instrument_id: str) -> None:
    ref = store.db.collection(JOB_COLLECTION).document(instrument_id)
    ref.set(
        {
            "instrument_id": instrument_id,
            "market": "IN" if instrument_id.startswith("IN_") else "US",
            "status": "queued",
            "requested_by": ["backfill_missing_on_demand_jobs"],
            "requested_at": _now(),
            "updated_at": _now(),
        },
        merge=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Queue missing on-demand jobs for tracked stocks.")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe = _active_ai_universe(store, args.market)
    tracked = _tracked_ids(store, args.market)
    if args.limit > 0:
        tracked = tracked[: args.limit]

    print(f"market={args.market} universe={universe} tracked={len(tracked)}")

    eligible: list[tuple[str, str]] = []
    for iid in tracked:
        if _has_usable_intel(store, args.market, universe, iid):
            continue
        status = _job_status(store, iid)
        if status in {"queued", "running", "retry"}:
            continue
        eligible.append((iid, status or "missing"))

    print(f"missing_and_unqueued={len(eligible)}")
    preview = eligible[:20]
    if preview:
        print("sample:")
        for iid, status in preview:
            print(f"  - {iid} (job_status={status})")

    if not args.write:
        print("dry-run only. re-run with --write to enqueue.")
        return

    queued = 0
    for iid, _ in eligible:
        _queue(store, iid)
        queued += 1
    print(f"queued={queued}")


if __name__ == "__main__":
    main()
