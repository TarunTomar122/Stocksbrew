"""Pull the next week of macro economic events from Trading Economics.

We overwrite `tm_economic_calendar/latest` on each run — the calendar is a
forward-looking window, so versioning per-day doesn't add value.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from backend.calendar_scraper import fetch_economic_calendar, window_events
from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore


def _parse_earnings_date(raw: str) -> str | None:
    """Normalise varied earnings_date formats to YYYY-MM-DD.

    Finviz emits things like 'Apr 24 AMC' or 'Apr 24/a'. Screener sometimes
    leaves it blank. We try a handful of shapes and drop anything we can't
    parse — a missing date just means we don't show it, no harm done.
    """
    if not raw:
        return None
    text = raw.strip().split("/")[0].strip()
    # Strip before/after market suffix.
    for suffix in (" AMC", " BMO", " amc", " bmo"):
        if text.endswith(suffix):
            text = text[: -len(suffix)].strip()
    today = datetime.now(timezone.utc).date()
    for fmt in ("%Y-%m-%d", "%b %d %Y", "%b %d"):
        try:
            parsed = datetime.strptime(text, fmt).date()
        except ValueError:
            continue
        # Rehydrate year when the format didn't include one. If the parsed
        # month/day has already happened this year, roll to next year.
        if fmt == "%b %d":
            year = today.year
            parsed = parsed.replace(year=year)
            if parsed < today:
                parsed = parsed.replace(year=year + 1)
        return parsed.isoformat()
    return None


def _collect_upcoming_earnings(days_ahead: int) -> list[dict[str, object]]:
    store = TraceMoneyStore()
    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=days_ahead)
    out: list[dict[str, object]] = []
    for market in ("US", "IN"):
        for instrument in list_instruments(market):
            snap = store.get_latest_stock_metrics_snapshot(instrument["instrument_id"])
            if not snap:
                continue
            raw = snap.get("earnings_date") or ""
            date = _parse_earnings_date(str(raw))
            if not date:
                continue
            d = datetime.strptime(date, "%Y-%m-%d").date()
            if d < today or d > horizon:
                continue
            out.append({
                "instrument_id": instrument["instrument_id"],
                "ticker": instrument.get("ticker"),
                "name": instrument.get("name") or instrument.get("ticker"),
                "market": market,
                "sector_label": snap.get("sector_label"),
                "date": date,
                "raw": raw,
            })
    out.sort(key=lambda r: (r["date"], r["ticker"] or ""))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync economic calendar")
    parser.add_argument("--days-ahead", type=int, default=7)
    parser.add_argument(
        "--min-importance",
        type=int,
        default=2,
        help="1=all, 2=meaningful (default), 3=market-moving only",
    )
    parser.add_argument(
        "--markets",
        default="US,IN,GLOBAL",
        help="Comma-separated markets to keep (e.g. 'US,IN,GLOBAL').",
    )
    args = parser.parse_args()

    markets = {m.strip().upper() for m in args.markets.split(",") if m.strip()}
    raw = fetch_economic_calendar()
    windowed = window_events(
        raw,
        days_ahead=args.days_ahead,
        markets=markets,
        min_importance=args.min_importance,
    )

    earnings = _collect_upcoming_earnings(args.days_ahead)

    payload = {
        "source": "tradingeconomics.com/calendar",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "days_ahead": args.days_ahead,
        "min_importance": args.min_importance,
        "markets": sorted(markets),
        "events": [asdict(ev) for ev in windowed],
        "earnings": earnings,
    }

    store = TraceMoneyStore()
    store.save_economic_calendar(payload)
    print(f"Saved {len(windowed)} events (of {len(raw)} parsed) + {len(earnings)} earnings.")
    for ev in windowed[:8]:
        print(f"  event   {ev.date} {ev.time:<10} T{ev.importance} [{ev.market}] {ev.event}")
    for er in earnings[:8]:
        print(f"  earning {er['date']} [{er['market']}] {er['ticker']}")


if __name__ == "__main__":
    main()
