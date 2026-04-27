"""Score each instrument on four pillars and persist to tm_stock_intel_pro.

Reads:
- Latest per-instrument Finviz snapshot from tm_stock_metrics_history/.../snapshots
- A ~30-day-old snapshot from the same collection (for delta catalysts)
- Latest sector benchmarks from tm_sector_benchmarks

Writes one doc per instrument under tm_stock_intel_pro/{market}__{universe}/stocks.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.stock_scoring import score_stock
from backend.storage import TraceMoneyStore


def _pick_previous_snapshot(store: TraceMoneyStore, instrument_id: str, today_date: str) -> dict | None:
    """Return the most recent snapshot strictly before today, or None."""
    # Stream a handful of snapshots in descending order; skip today, take the next.
    query = (
        store.db.collection("tm_stock_metrics_history").document(instrument_id)
        .collection("snapshots")
        .order_by("snapshot_date", direction="DESCENDING")
        .limit(35)
        .stream()
    )
    for doc in query:
        data = doc.to_dict()
        if data.get("snapshot_date") != today_date:
            return data
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Score stocks on four pillars")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    args = parser.parse_args()

    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    store = TraceMoneyStore()
    benchmarks_doc = store.get_sector_benchmarks(args.market) or {}
    if not benchmarks_doc:
        print(f"[warn] no sector benchmarks found — valuation pillar will lack sector comps")

    today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    instruments = list_instruments(args.market, universe_id)
    saved = 0
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        today_snap = store.get_stock_metrics_snapshot(instrument_id, today_date) \
            or store.get_latest_stock_metrics_snapshot(instrument_id)
        if not today_snap:
            print(f"  [skip] {instrument['ticker']}: no snapshot yet")
            continue
        previous_snap = _pick_previous_snapshot(store, instrument_id, today_snap["snapshot_date"])
        scored = score_stock(instrument, today_snap, previous_snap, benchmarks_doc)
        store.save_stock_intel_pro(args.market, universe_id, instrument_id, scored)
        saved += 1

    print(f"Scored {saved}/{len(instruments)} stocks for {args.market} / {universe_id}")


if __name__ == "__main__":
    main()
