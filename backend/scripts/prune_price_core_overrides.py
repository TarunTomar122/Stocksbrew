"""Prune stale instruments from price_core_overrides.

Retention:
- Add and keep any instrument currently tracked by at least one user.
- Add and keep any instrument viewed recently in tm_stock_views (N days window).
- Keep newest tail floor (never prune below floor count).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cutoff_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=max(1, days))).isoformat()


def _tracked_ids(store: TraceMoneyStore, market: str) -> set[str]:
    out: set[str] = set()
    prefix = f"{market.upper()}_"
    for doc in store.db.collection("tm_tracked_instruments").where("tracked_count", ">", 0).stream():
        iid = str(doc.id or "").strip().upper()
        if iid.startswith(prefix):
            out.add(iid)
    return out


def _recent_view_ids(store: TraceMoneyStore, market: str, days: int) -> set[str]:
    out: set[str] = set()
    prefix = f"{market.upper()}_"
    cutoff = _cutoff_iso(days)
    rows = (
        store.db.collection("tm_stock_views")
        .where("created_at", ">=", cutoff)
        .select(["instrument_id", "market"])
        .stream()
    )
    for row in rows:
        payload = row.to_dict() or {}
        row_market = str(payload.get("market") or "").strip().upper()
        if row_market and row_market != market.upper():
            continue
        iid = str(payload.get("instrument_id") or "").strip().upper()
        if iid.startswith(prefix):
            out.add(iid)
    return out


def retained_override_ids(
    current: list[str],
    *,
    tracked: set[str],
    recent: set[str],
    target_cap: int,
    floor: int,
) -> list[str]:
    """Build the price cohort, seeding every protected ID before pruning.

    The previous implementation could only retain protected IDs already in the
    override list. Newly tracked stocks were therefore scanned by downstream
    jobs without receiving the matching post-close price refresh.
    """
    ordered: list[str] = []
    seen: set[str] = set()
    for raw in current:
        instrument_id = str(raw or "").strip().upper()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            ordered.append(instrument_id)

    protected = {
        str(raw or "").strip().upper()
        for raw in tracked | recent
        if str(raw or "").strip()
    }
    for instrument_id in sorted(protected):
        if instrument_id not in seen:
            seen.add(instrument_id)
            ordered.append(instrument_id)

    if not ordered:
        return []

    desired = max(max(0, floor), min(max(0, target_cap), len(ordered)))
    kept = set(protected)
    for instrument_id in reversed(ordered):
        if len(kept) >= desired:
            break
        kept.add(instrument_id)
    return [instrument_id for instrument_id in ordered if instrument_id in kept]


def main() -> None:
    parser = argparse.ArgumentParser(description="Prune stale price_core_overrides")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--recent-days", type=int, default=21)
    parser.add_argument("--target-cap", type=int, default=500)
    parser.add_argument("--floor", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    store = TraceMoneyStore()
    current = store.get_price_core_overrides(market)
    original_current_set = {
        str(item or "").strip().upper()
        for item in current
        if str(item or "").strip()
    }
    valid_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_instruments(market)
        if str(row.get("instrument_id") or "").strip()
    }
    current = [
        instrument_id
        for instrument_id in current
        if str(instrument_id or "").strip().upper() in valid_ids
    ]
    keep_tracked = _tracked_ids(store, market)
    keep_recent = _recent_view_ids(store, market, args.recent_days)
    keep_tracked &= valid_ids
    keep_recent &= valid_ids
    kept = retained_override_ids(
        current,
        tracked=keep_tracked,
        recent=keep_recent,
        target_cap=args.target_cap,
        floor=args.floor,
    )
    kept_set = set(kept)
    removed_count = len(original_current_set - kept_set)
    added_count = len(kept_set - original_current_set)

    if args.dry_run:
        print(
            {
                "market": market,
                "current": len(current),
                "kept": len(kept),
                "removed": removed_count,
                "added": added_count,
                "protected_tracked": len(keep_tracked),
                "protected_recent_views": len(keep_recent),
            }
        )
        return

    store.db.collection("tm_config").document("price_core_overrides").set(
        {market: kept, "updated_at": _now_iso()},
        merge=True,
    )
    print(
        {
            "market": market,
            "current": len(current),
            "kept": len(kept),
            "removed": removed_count,
            "added": added_count,
            "protected_tracked": len(keep_tracked),
            "protected_recent_views": len(keep_recent),
        }
    )


if __name__ == "__main__":
    main()
