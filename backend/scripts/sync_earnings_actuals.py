"""Enrich recently-reported earnings events with ACTUAL reported numbers.

The earnings calendar (sync_earnings_calendar) writes only estimates + the
report date to tm_earnings_events. Once a stock reports, Alpha Vantage's
EARNINGS endpoint carries the actual reportedEPS, the estimate that was in
place, and the surprise. This script fetches those actuals for the handful of
*universe* stocks that just reported and merges them back onto the matching
tm_earnings_events doc, so both the post-earnings intel report and the AI news
brief can talk about a real beat/miss instead of repeating the estimate as if
it were the result.

Scope: our calendar universe only (tm_instruments for the market), within
--recent-days of today, capped at --max-events. Alpha Vantage's free tier is
rate-limited, so we rotate the key pool and sleep between calls.

Usage:
    python -m backend.scripts.sync_earnings_actuals --market US --recent-days 3 --dry-run
    python -m backend.scripts.sync_earnings_actuals --market US --recent-days 3 --write
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from typing import Any

from backend.earnings_actuals import (
    fetch_quarterly_actuals,
    fetch_yfinance_quarterly_actuals,
    pick_actual_for_event,
    summarize_surprise,
)
from backend.env import load_backend_env
from backend.news_av import _AV_KEY_POOL
from backend.storage import TraceMoneyStore


def _as_date(value: str) -> "datetime.date | None":
    candidate = str(value or "").split("T", 1)[0].strip()
    if not candidate:
        return None
    try:
        return datetime.strptime(candidate, "%Y-%m-%d").date()
    except ValueError:
        return None


def _universe_tickers(store: TraceMoneyStore, market: str) -> set[str]:
    """Tickers we actually cover - the same calendar universe as the frontend."""
    out: set[str] = set()
    for row in store.list_instruments(market):
        ticker = str(row.get("ticker") or row.get("symbol") or "").upper().strip()
        if ticker:
            out.add(ticker)
    return out


def _list_recent_events(
    store: TraceMoneyStore,
    market: str,
    recent_days: int,
    max_events: int,
    allowed_tickers: set[str],
) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).date()
    out: list[tuple[Any, dict[str, Any]]] = []
    query = (
        store.db.collection("tm_earnings_events")
        .where("market", "==", market.upper())
        .stream()
    )
    for doc in query:
        payload = doc.to_dict() or {}
        ticker = str(payload.get("ticker") or "").upper().strip()
        if ticker not in allowed_tickers:
            continue
        event_date = _as_date(str(payload.get("event_date") or ""))
        if not event_date:
            continue
        delta = (today - event_date).days
        if 0 <= delta <= max(0, recent_days):
            payload["_doc_id"] = doc.id
            out.append((event_date, payload))
    out.sort(key=lambda pair: pair[0], reverse=True)
    return [payload for _date, payload in out[: max(1, max_events)]]


def _enrichment_from_actual(actual: dict[str, Any], *, source: str) -> dict[str, Any]:
    return {
        "reported_eps": actual.get("reported_eps"),
        "estimated_eps": actual.get("estimated_eps"),
        "eps_surprise": actual.get("surprise"),
        "eps_surprise_pct": actual.get("surprise_pct"),
        "surprise_label": summarize_surprise(actual),
        "actuals_reported_date": actual.get("reported_date"),
        "actuals_fiscal_date_ending": actual.get("fiscal_date_ending"),
        "actuals_source": source,
        "actuals_captured_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(
        description="Enrich recent earnings events with actual reported EPS/surprise"
    )
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--recent-days", type=int, default=3)
    parser.add_argument("--max-events", type=int, default=30)
    parser.add_argument(
        "--tolerance-days",
        type=int,
        default=4,
        help="How far the AV reportedDate may sit from the calendar event_date",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=1.5,
        help="Seconds to sleep between Alpha Vantage calls (rate-limit guard)",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    allowed = _universe_tickers(store, args.market)
    events = _list_recent_events(
        store,
        market=args.market,
        recent_days=args.recent_days,
        max_events=args.max_events,
        allowed_tickers=allowed,
    )
    if not events:
        print(json.dumps({"status": "noop", "reason": "no_recent_events"}))
        return

    pool = list(_AV_KEY_POOL)
    results: list[dict[str, Any]] = []
    enriched = 0
    missing = 0
    for idx, event in enumerate(events):
        ticker = str(event.get("ticker") or "").upper().strip()
        event_date = str(event.get("event_date") or "")
        doc_id = event.get("_doc_id") or f"{ticker}_{event_date}"
        # Rotate the key pool so we spread quota across the 5 free-tier keys.
        api_key = pool[idx % len(pool)] if pool else None
        actuals = fetch_quarterly_actuals(ticker, api_key=api_key)
        actual = pick_actual_for_event(
            actuals, event_date, tolerance_days=args.tolerance_days
        )
        source = "alphavantage"
        if actual is None:
            yf_actuals = fetch_yfinance_quarterly_actuals(ticker)
            actual = pick_actual_for_event(
                yf_actuals, event_date, tolerance_days=args.tolerance_days
            )
            source = "yfinance"
        if actual is None:
            missing += 1
            results.append({"ticker": ticker, "event_date": event_date, "status": "no_actual"})
        else:
            enrichment = _enrichment_from_actual(actual, source=source)
            if args.write:
                store.db.collection("tm_earnings_events").document(doc_id).set(
                    enrichment, merge=True
                )
            enriched += 1
            results.append(
                {
                    "ticker": ticker,
                    "event_date": event_date,
                    "status": "enriched",
                    **enrichment,
                }
            )
        if args.sleep > 0 and idx < len(events) - 1:
            time.sleep(args.sleep)

    summary = {
        "status": "ok" if args.write else "dry_run",
        "market": args.market.upper(),
        "events_considered": len(events),
        "enriched": enriched,
        "missing_actuals": missing,
        "items": results,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
