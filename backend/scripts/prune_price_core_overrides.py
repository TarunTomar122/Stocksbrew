"""Prune stale instruments from price_core_overrides.

Retention:
- Keep any instrument currently tracked by at least one user.
- Keep any instrument viewed recently in tm_stock_views (N days window).
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
    if not current:
        print({"market": market, "current": 0, "removed": 0, "kept": 0, "reason": "no_overrides"})
        return

    keep_tracked = _tracked_ids(store, market)
    keep_recent = _recent_view_ids(store, market, args.recent_days)
    protected = keep_tracked | keep_recent

    max_keep = max(args.floor, min(args.target_cap, len(current)))
    # Preserve recency order: list tail is newest.
    ordered = list(current)
    kept: list[str] = []
    removed: list[str] = []

    # First pass: retain protected + newest tail floor.
    tail_floor = set(ordered[-args.floor :]) if len(ordered) > args.floor else set(ordered)
    for iid in ordered:
        if iid in protected or iid in tail_floor:
            kept.append(iid)
        else:
            removed.append(iid)

    # If still above cap, drop oldest non-protected entries from kept.
    if len(kept) > max_keep:
        final: list[str] = []
        for iid in kept:
            if len(final) >= max_keep and iid not in protected:
                removed.append(iid)
                continue
            final.append(iid)
        kept = final[-max_keep:]

    if args.dry_run:
        print(
            {
                "market": market,
                "current": len(current),
                "kept": len(kept),
                "removed": len(current) - len(kept),
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
            "removed": len(current) - len(kept),
            "protected_tracked": len(keep_tracked),
            "protected_recent_views": len(keep_recent),
        }
    )


if __name__ == "__main__":
    main()
