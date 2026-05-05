"""Refresh prioritized price cohorts and materialize views incrementally.

This runner is intentionally narrow: it refreshes prices with the existing
yfinance path, merges each cohort into the market snapshot, materializes the
cohort's instrument views, and writes progress status after every cohort.
Slow facts/news/AI stages are left to the normal daily pipeline.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments, list_universes_for_market
from backend.scripts.materialize_views import materialize_views
from backend.scripts.sync_price_snapshots import sync_price_snapshots
from backend.storage import TraceMoneyStore


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chunked(values: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    if size <= 0:
        return [values]
    return [values[index:index + size] for index in range(0, len(values), size)]


def _rank_instruments(store: TraceMoneyStore, market: str, universe_id: str, limit: int) -> list[dict[str, Any]]:
    instruments = list_instruments(market, universe_id)
    by_ticker = {str(row.get("ticker", "")).upper(): row for row in instruments}
    by_id = {str(row.get("instrument_id", "")).upper(): row for row in instruments}
    universe_map = list_universes_for_market(market)
    promoted = store.get_promoted_tickers(market)

    promoted_ids: list[str] = []
    for row in promoted:
        raw = str(row.get("instrument_id") or row.get("ticker") or "").upper().strip()
        if not raw:
            continue
        instrument = by_id.get(raw) or by_ticker.get(raw)
        if instrument:
            promoted_ids.append(instrument["instrument_id"])

    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()
    for instrument_id in promoted_ids:
        if instrument_id in seen:
            continue
        instrument = by_id.get(instrument_id)
        if instrument:
            ordered.append(instrument)
            seen.add(instrument_id)

    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        if instrument_id in seen:
            continue
        ordered.append(instrument)
        seen.add(instrument_id)

    selected = ordered[: max(1, limit)]

    # Always include macro/index cue instruments so "Market cues" tiles stay fresh
    # even when stock cohorts are limited to top-N.
    macro_ids = [iid.upper() for iid in universe_map.get("us_macro_cues", [])]
    selected_ids = {row["instrument_id"] for row in selected}
    for macro_id in macro_ids:
        if macro_id in selected_ids:
            continue
        instrument = by_id.get(macro_id)
        if instrument:
            selected.append(instrument)
            selected_ids.add(macro_id)

    return selected


def run_priority_price_pipeline(
    *,
    market: str,
    universe_id: str,
    limit: int = 100,
    cohort_size: int = 30,
    max_workers: int = 6,
    session_phase: str = "manual",
    allow_missing_context: bool = True,
    skip_sector_scrape: bool = True,
    dry_run: bool = False,
) -> dict[str, Any]:
    store = TraceMoneyStore()
    ranked = _rank_instruments(store, market, universe_id, limit)
    cohorts = _chunked(ranked, cohort_size)
    run_id = f"{market.upper()}_{universe_id}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    started_at = _utc_now()
    summary: dict[str, Any] = {
        "run_id": run_id,
        "market": market.upper(),
        "universe_id": universe_id,
        "refresh_mode": "priority_cohort",
        "session_phase": session_phase,
        "limit": limit,
        "cohort_size": cohort_size,
        "cohort_count": len(cohorts),
        "started_at": started_at,
        "status": "running",
        "cohorts": [],
    }
    if not dry_run:
        store.save_price_refresh_status(market, summary)

    for index, cohort in enumerate(cohorts, start=1):
        cohort_started = time.time()
        ids = [instrument["instrument_id"] for instrument in cohort]
        tickers = [instrument["ticker"] for instrument in cohort]
        cohort_status: dict[str, Any] = {
            "index": index,
            "start_rank": ((index - 1) * cohort_size) + 1,
            "end_rank": ((index - 1) * cohort_size) + len(cohort),
            "instrument_count": len(cohort),
            "instrument_ids": ids,
            "tickers": tickers,
            "status": "running",
            "started_at": _utc_now(),
        }
        summary["cohorts"].append(cohort_status)
        if not dry_run:
            store.save_price_refresh_status(market, summary)

        try:
            price_result = {"dry_run": True, "saved_count": 0}
            materialize_result = {"dry_run": True, "saved_instrument_views": 0}
            if not dry_run:
                price_result = sync_price_snapshots(
                    market=market,
                    universe_id=universe_id,
                    session_phase=session_phase,
                    max_workers=max_workers,
                    instrument_ids=ids,
                    activate=index == 1,
                    merge_market_snapshot=True,
                    store=store,
                )
                materialize_result = materialize_views(
                    market=market,
                    universe_id=universe_id,
                    instrument_ids=ids,
                    activate=index == 1,
                    allow_missing_context=allow_missing_context,
                    skip_sector_scrape=skip_sector_scrape,
                    skip_dashboard=True,
                    store=store,
                )
            cohort_status.update({
                "status": "complete",
                "completed_at": _utc_now(),
                "elapsed_s": round(time.time() - cohort_started, 3),
                "price": price_result,
                "materialize": materialize_result,
            })
            summary["latest_completed_cohort"] = index
        except Exception as exc:
            cohort_status.update({
                "status": "failed",
                "failed_at": _utc_now(),
                "elapsed_s": round(time.time() - cohort_started, 3),
                "error": f"{type(exc).__name__}: {exc}",
            })
            summary["status"] = "failed"
            summary["failed_at"] = _utc_now()
            if not dry_run:
                store.save_price_refresh_status(market, summary)
            raise

        if not dry_run:
            store.save_price_refresh_status(market, summary)

    summary["status"] = "complete"
    summary["completed_at"] = _utc_now()
    if not dry_run:
        dashboard_result = materialize_views(
            market=market,
            universe_id=universe_id,
            instrument_ids=None,
            activate=False,
            allow_missing_context=allow_missing_context,
            skip_sector_scrape=skip_sector_scrape,
            skip_dashboard=False,
            store=store,
        )
        summary["dashboard_refresh"] = dashboard_result
    if not dry_run:
        store.save_price_refresh_status(market, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run priority cohort price/materialization pipeline")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id; defaults to active price universe")
    parser.add_argument("--limit", type=int, default=100, help="Total priority instruments to process")
    parser.add_argument("--cohort-size", type=int, default=30, help="Instruments per cohort")
    parser.add_argument("--max-workers", type=int, default=6, help="Parallel yfinance workers")
    parser.add_argument(
        "--session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default="manual",
    )
    parser.add_argument("--require-context", action="store_true", help="Fail if intelligence/context docs are missing")
    parser.add_argument("--include-sector-scrape", action="store_true", help="Scrape live sector tiles during each cohort")
    parser.add_argument("--dry-run", action="store_true", help="Plan cohorts without writing/fetching")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.US_universe (US) or pass --universe."
        )

    summary = run_priority_price_pipeline(
        market=args.market,
        universe_id=universe_id,
        limit=args.limit,
        cohort_size=args.cohort_size,
        max_workers=args.max_workers,
        session_phase=args.session_phase,
        allow_missing_context=not args.require_context,
        skip_sector_scrape=not args.include_sector_scrape,
        dry_run=args.dry_run,
    )
    if args.print_json:
        print(json.dumps(summary, indent=2))
    else:
        print(
            f"Priority price pipeline {summary['status']}: "
            f"{summary['cohort_count']} cohorts / limit {summary['limit']} / {args.market} {universe_id}"
        )


if __name__ == "__main__":
    main()
