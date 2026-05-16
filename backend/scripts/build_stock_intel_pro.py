"""Score each instrument on four pillars and persist to tm_stock_intel_pro.

Reads:
- Latest per-instrument Finviz snapshot from tm_stock_metrics_history/.../snapshots
- A ~30-day-old snapshot from the same collection (for delta catalysts)
- Latest sector benchmarks from tm_sector_benchmarks

Writes one doc per instrument under tm_stock_intel_pro/{market}__{universe}/stocks.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone

from backend.instrument_universe import list_instruments
from backend.stock_scoring import score_stock
from backend.storage import TraceMoneyStore


def _parse_instrument_ids(value: str | None) -> set[str] | None:
    if not value:
        return None
    ids = {item.strip().upper() for item in value.split(",") if item.strip()}
    return ids or None


def main() -> None:
    parser = argparse.ArgumentParser(description="Score stocks on four pillars")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids for subset scoring")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )
    benchmarks_doc = store.get_sector_benchmarks(args.market) or {}
    if not benchmarks_doc:
        print(f"[warn] no sector benchmarks found - valuation pillar will lack sector comps")

    today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    instruments = list_instruments(args.market, universe_id)
    allowed_ids = _parse_instrument_ids(args.instrument_ids)
    if allowed_ids is not None:
        instruments = [
            instrument for instrument in instruments
            if str(instrument.get("instrument_id", "")).upper() in allowed_ids
        ]
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]
    today_snaps = store.get_stock_metrics_snapshots_batch(instrument_ids, today_date)
    if len(today_snaps) < len(instrument_ids):
        latest_snaps = store.get_stock_metrics_snapshots_batch(instrument_ids)
        for instrument_id, snapshot in latest_snaps.items():
            today_snaps.setdefault(instrument_id, snapshot)
    saved = 0
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        today_snap = today_snaps.get(instrument_id)
        if not today_snap:
            print(f"  [skip] {instrument['ticker']}: no snapshot yet")
            continue
        scored = score_stock(instrument, today_snap, None, benchmarks_doc)
        store.save_stock_intel_pro(args.market, universe_id, instrument_id, scored)
        saved += 1

    store.save_stage_watermark(
        market=args.market,
        stage_key="build_stock_intel_pro",
        universe_id=universe_id,
        expected_count=len(instruments),
        success_count=saved,
        error_count=max(0, len(instruments) - saved),
        metadata={
            "as_of_date": today_date,
            "today_snapshot_count": len(today_snaps),
            "benchmarks_present": bool(benchmarks_doc),
        },
    )

    print(f"Scored {saved}/{len(instruments)} stocks for {args.market} / {universe_id}")


if __name__ == "__main__":
    main()
