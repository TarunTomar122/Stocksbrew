"""Refresh prioritized price cohorts and materialize views incrementally.

This runner is intentionally narrow: it refreshes prices with the existing
yfinance path, merges each cohort into the market snapshot, materializes the
cohort's instrument views, and writes progress status after every cohort.
Slow facts/news/AI stages are left to the normal daily pipeline.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
import subprocess
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments, list_universes_for_market
from backend.scripts.materialize_views import materialize_views
from backend.scripts.sync_price_snapshots import sync_price_snapshots
from backend.storage import TraceMoneyStore


VISIT_WEIGHT_SUBSCRIBED = 4.0
VISIT_WEIGHT_LOGGED_UNSUB = 2.0
VISIT_WEIGHT_ANON = 1.0
TRACKED_WEIGHT_SUBSCRIBED = 40.0
TRACKED_WEIGHT_LOGGED_UNSUB = 20.0
PROMOTED_BONUS = 2000.0


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chunked(values: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    if size <= 0:
        return [values]
    return [values[index:index + size] for index in range(0, len(values), size)]


def _build_movers_rows(
    snapshot_rows: list[dict[str, Any]],
    *,
    allowed_ids: set[str],
    limit: int = 10,
) -> dict[str, list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    for row in snapshot_rows:
        if not isinstance(row, dict):
            continue
        instrument_id = str(row.get("instrumentId") or row.get("instrument_id") or "").upper()
        if not instrument_id or instrument_id not in allowed_ids:
            continue
        # Keep movers stock-only; skip macro/index tiles.
        if "_MAC_" in instrument_id or "_IDX_" in instrument_id:
            continue
        symbol = str(row.get("symbol") or row.get("ticker") or "").strip()
        if not symbol:
            continue
        price = row.get("price") or {}
        current = price.get("current")
        day_change_pct = price.get("changePct", price.get("day_change_pct"))
        if not isinstance(current, (int, float)) or not isinstance(day_change_pct, (int, float)):
            continue
        rows.append({
            "instrument_id": instrument_id,
            "ticker": symbol,
            "name": str(row.get("name") or symbol),
            "price": float(current),
            "day_change_pct": float(day_change_pct),
            "ai_sentiment_score": 0,
            "news_count": 0,
            "source_count": 0,
            "volume": (
                float(price["volume"])
                if isinstance(price.get("volume"), (int, float))
                else None
            ),
        })

    ranked = sorted(rows, key=lambda item: (item["day_change_pct"], item["ticker"]), reverse=True)
    gainers = [item for item in ranked if item["day_change_pct"] > 0][:limit]
    losers = [
        item for item in sorted(rows, key=lambda item: (item["day_change_pct"], item["ticker"]))
        if item["day_change_pct"] < 0
    ][:limit]
    return {"gainers": gainers, "losers": losers}


def _is_macro_or_index_id(instrument_id: str) -> bool:
    upper = str(instrument_id or "").upper()
    return "_MAC_" in upper or "_IDX_" in upper


def _load_tracked_scores(
    store: TraceMoneyStore,
    market: str,
    allowed_ids: set[str],
) -> dict[str, float]:
    scores: dict[str, float] = defaultdict(float)
    market_prefix = f"{market.upper()}_"
    users = store.list_subscribed_users()
    for user in users:
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        is_subscribed = bool(user.get("is_subscribed"))
        weight = (
            TRACKED_WEIGHT_SUBSCRIBED if is_subscribed
            else TRACKED_WEIGHT_LOGGED_UNSUB
        )
        for raw in tracked:
            instrument_id = str(raw or "").strip().upper()
            if (
                not instrument_id
                or not instrument_id.startswith(market_prefix)
                or instrument_id not in allowed_ids
            ):
                continue
            scores[instrument_id] += weight
    return dict(scores)


def _load_recent_visit_scores(
    store: TraceMoneyStore,
    market: str,
    allowed_ids: set[str],
    *,
    lookback_days: int = 7,
) -> dict[str, float]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, lookback_days))
    docs = (
        store.db.collection("tm_stock_views")
        .where("created_at", ">=", cutoff.isoformat())
        .stream()
    )
    raw_rows: list[dict[str, Any]] = []
    user_ids: set[str] = set()
    for doc in docs:
        row = doc.to_dict() or {}
        row_market = str(row.get("market") or "").strip().upper()
        if row_market != market.upper():
            continue
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if not instrument_id or instrument_id not in allowed_ids:
            continue
        uid = str(row.get("uid") or "").strip()
        if uid:
            user_ids.add(uid)
        raw_rows.append(row)

    user_subscribed: dict[str, bool] = {}
    if user_ids:
        user_refs = [store.db.collection("users").document(uid) for uid in user_ids]
        for start in range(0, len(user_refs), 500):
            for doc in store.db.get_all(user_refs[start:start + 500]):
                if doc.exists:
                    payload = doc.to_dict() or {}
                    user_subscribed[doc.id] = bool(payload.get("is_subscribed"))

    scores: dict[str, float] = defaultdict(float)
    for row in raw_rows:
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            continue
        view_count = row.get("view_count")
        views = float(view_count) if isinstance(view_count, (int, float)) else 1.0
        uid = str(row.get("uid") or "").strip()
        if uid:
            weight = (
                VISIT_WEIGHT_SUBSCRIBED if user_subscribed.get(uid, False)
                else VISIT_WEIGHT_LOGGED_UNSUB
            )
        else:
            weight = VISIT_WEIGHT_ANON
        scores[instrument_id] += (views * weight)
    return dict(scores)


def _rank_instruments(store: TraceMoneyStore, market: str, universe_id: str, limit: int) -> list[dict[str, Any]]:
    instruments = list_instruments(market, universe_id)
    market_instruments = list_instruments(market, None)
    by_ticker = {str(row.get("ticker", "")).upper(): row for row in instruments}
    by_id = {str(row.get("instrument_id", "")).upper(): row for row in instruments}
    market_by_id = {str(row.get("instrument_id", "")).upper(): row for row in market_instruments}
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

    allowed_ids = {
        str(instrument.get("instrument_id") or "").strip().upper()
        for instrument in instruments
        if str(instrument.get("instrument_id") or "").strip()
    }
    tracked_scores = _load_tracked_scores(store, market, allowed_ids)
    visit_scores = _load_recent_visit_scores(store, market, allowed_ids)

    base_rank: dict[str, int] = {
        str(instrument.get("instrument_id") or "").upper(): index
        for index, instrument in enumerate(instruments)
    }
    promoted_set = {instrument_id.upper() for instrument_id in promoted_ids}

    scored: list[tuple[float, dict[str, Any]]] = []
    for instrument in instruments:
        instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            continue
        score = 0.0
        score += tracked_scores.get(instrument_id, 0.0)
        score += visit_scores.get(instrument_id, 0.0)
        if instrument_id in promoted_set:
            score += PROMOTED_BONUS
        score += max(0.0, float(len(instruments) - base_rank.get(instrument_id, 0)))
        scored.append((score, instrument))

    scored.sort(
        key=lambda item: (
            item[0],
            str(item[1].get("ticker") or ""),
        ),
        reverse=True,
    )
    ordered = [instrument for _score, instrument in scored]

    selected = ordered[: max(1, limit)]

    # Always include macro/index cue instruments so "Market cues" tiles stay fresh
    # even when stock cohorts are limited to top-N.
    macro_ids = [iid.upper() for iid in universe_map.get("us_macro_cues", [])]
    selected_ids = {row["instrument_id"] for row in selected}
    for macro_id in macro_ids:
        if macro_id in selected_ids:
            continue
        instrument = by_id.get(macro_id) or market_by_id.get(macro_id)
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
    priority_stock_ids = [
        str(instrument.get("instrument_id") or "").upper()
        for instrument in ranked
        if (
            str(instrument.get("instrument_id") or "").strip()
            and not _is_macro_or_index_id(str(instrument.get("instrument_id") or ""))
        )
    ][: max(1, limit)]
    ranked_ids = {
        str(instrument.get("instrument_id") or "").upper()
        for instrument in ranked
        if str(instrument.get("instrument_id") or "").strip()
    }
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
        snapshot_rows = store.get_market_price_snapshot(market)
        movers = _build_movers_rows(snapshot_rows, allowed_ids=ranked_ids, limit=10)
        store.save_market_movers(market, {
            "market": market.upper(),
            "generated_at": _utc_now(),
            "universe_id": universe_id,
            "scope": "priority_100",
            "row_count": len(snapshot_rows),
            "priority_instrument_ids": priority_stock_ids,
            "gainers": movers["gainers"],
            "losers": movers["losers"],
        })
        summary["market_movers"] = {
            "scope": "priority_100",
            "gainers": len(movers["gainers"]),
            "losers": len(movers["losers"]),
        }
    if not dry_run:
        store.save_price_refresh_status(market, summary)
    return summary


def run_priority_followup_builders(
    *,
    market: str,
    universe_id: str,
    limit: int = 100,
    skip_materialize: bool = False,
) -> dict[str, Any]:
    store = TraceMoneyStore()
    ranked = _rank_instruments(store, market, universe_id, limit)
    ids = [instrument["instrument_id"] for instrument in ranked]
    ids_csv = ",".join(ids)
    py = "python3"

    subprocess.run([
        py, "-m", "backend.scripts.build_stock_intel_pro",
        "--market", market,
        "--universe", universe_id,
        "--instrument-ids", ids_csv,
    ], check=True)
    subprocess.run([
        py, "-m", "backend.scripts.build_stock_technicals",
        "--market", market,
        "--universe", universe_id,
        "--instrument-ids", ids_csv,
    ], check=True)
    subprocess.run([
        py, "-m", "backend.scripts.build_market_breadth",
        "--market", market,
        "--universe", universe_id,
    ], check=True)
    subprocess.run([
        py, "-m", "backend.scripts.build_thematic_screens",
        "--market", market,
        "--universe", universe_id,
    ], check=True)
    materialize_result = None
    if not skip_materialize:
        materialize_result = materialize_views(
            market=market,
            universe_id=universe_id,
            instrument_ids=ids,
            activate=False,
            allow_missing_context=True,
            skip_sector_scrape=True,
            skip_dashboard=False,
            store=store,
        )
    return {
        "market": market,
        "universe_id": universe_id,
        "limit": limit,
        "selected_count": len(ids),
        "materialize": materialize_result,
    }


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
    parser.add_argument("--run-followup-builders", action="store_true", help="Run subset builders on same ranked priority IDs")
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
    if args.run_followup_builders and not args.dry_run:
        summary["followup"] = run_priority_followup_builders(
            market=args.market,
            universe_id=universe_id,
            limit=args.limit,
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
