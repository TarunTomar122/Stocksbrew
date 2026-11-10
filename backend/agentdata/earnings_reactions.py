"""How each stock moved on its earnings report, for ``tm_agent_earnings_reactions``.

The calendar shows a result next to every past report: the surprise comes from
``tm_earnings_events`` and the stock's reaction comes from here. It is computed
from the adjusted daily closes in ``tm_price_history_daily`` so the page never
has to load multi-year price series to draw one number.

The window depends on when the company reported:

* before the open: prior close to that day's close (one session)
* after the close: that day's close to the next close (one session)
* time not known: prior close to the next close (two sessions, which covers
  either case, and is labelled as two sessions wherever it is shown)

A reaction is only written once the closing price that ends the window exists.
Ids are ``{TICKER}_{YYYY-MM-DD}``, the same as the event, so reruns update in
place. Nothing is deleted.

Run: ``python3 -m backend.agentdata.earnings_reactions``
"""

from __future__ import annotations

import argparse
from bisect import bisect_left
from datetime import timedelta
from typing import Any
from zoneinfo import ZoneInfo

from . import prices
from .feeds_common import WriteLedger, iso_now, load_universe, query, utc_now, write_changed
from .store import DocStore

COLLECTION = "tm_agent_earnings_reactions"
EVENTS = "tm_earnings_events"
SESSIONS = {"bmo", "amc"}


def reaction(dates: list[str], closes: list[float], event_date: str, session: str) -> dict[str, Any] | None:
    """The close-to-close move around one report, or None when it cannot be measured yet."""
    if not dates or len(dates) != len(closes):
        return None
    index = bisect_left(dates, event_date)
    if index >= len(dates):
        return None  # the report day has not closed yet
    # A report dated on a non-trading day lands on the next session.
    if session == "bmo":
        start, end, basis = index - 1, index, "1d"
    elif session == "amc":
        start, end, basis = (index, index + 1, "1d") if dates[index] == event_date else (index - 1, index, "1d")
    else:
        start, end, basis = index - 1, index + 1, "2d"
        if dates[index] != event_date:
            end = index  # the gap already spans the unknown report time
            basis = "1d"
    if start < 0 or end >= len(dates):
        return None
    before, after = closes[start], closes[end]
    if not isinstance(before, (int, float)) or not isinstance(after, (int, float)) or before <= 0 or after <= 0:
        return None
    return {
        "pct": round((after - before) / before * 100.0, 2),
        "basis": basis,
        "from_date": dates[start],
        "from_close": round(float(before), 4),
        "to_date": dates[end],
        "to_close": round(float(after), 4),
    }


def completed_sessions(dates: list[str], closes: list[float], session_day: str) -> tuple[list[str], list[float]]:
    """Drop bars dated ``session_day`` or later: only finished sessions count as closes."""
    keep = bisect_left(dates, session_day)
    return dates[:keep], closes[:keep]


def run(*, weeks_back: int = 30, dry_run: bool = False) -> dict[str, Any]:
    store = DocStore.from_env()
    now_iso = iso_now()
    today = utc_now().date()
    # New York's day. The price series carries the session in progress as its last
    # bar, which is not a close, so nothing dated today or later is used.
    session_day = utc_now().astimezone(ZoneInfo("America/New_York")).date().isoformat()
    start = (today - timedelta(weeks=weeks_back)).isoformat()

    events = [
        data
        for _path, data in query(
            store,
            EVENTS,
            filters=[("event_date", ">=", start), ("event_date", "<=", today.isoformat())],
            limit=10000,
        )
        if data.get("market") == "US" and data.get("ticker")
    ]
    # Older calendar rows span the whole market; only covered symbols have a price series.
    covered = {item.ticker.upper() for item in load_universe(store)}
    tickers = sorted({str(event["ticker"]).upper() for event in events} & covered)
    series: dict[str, dict[str, Any]] = {}
    for offset in range(0, len(tickers), 20):
        chunk = tickers[offset : offset + 20]
        found = store.get_many([f"{prices.COLLECTION}/{prices.doc_id(ticker)}" for ticker in chunk])
        for ticker in chunk:
            document = found.get(f"{prices.COLLECTION}/{prices.doc_id(ticker)}")
            if document and document.get("dates"):
                series[ticker] = document

    writes: list[tuple[str, dict[str, Any]]] = []
    stats = {"events": len(events), "tickers": len(tickers), "with_prices": len(series), "measured": 0, "waiting": 0}
    for event in events:
        ticker = str(event["ticker"]).upper()
        document = series.get(ticker)
        if not document:
            continue
        session = str(event.get("time") or "").lower()
        session = session if session in SESSIONS else "unknown"
        event_date = str(event.get("event_date") or "")[:10]
        dates, closes = completed_sessions(document.get("dates") or [], document.get("closes") or [], session_day)
        measured = reaction(dates, closes, event_date, session)
        if measured is None:
            stats["waiting"] += 1
            continue
        stats["measured"] += 1
        writes.append(
            (
                f"{COLLECTION}/{ticker}_{event_date}",
                {
                    "ticker": ticker,
                    "event_date": event_date,
                    "market": "US",
                    "session": session,
                    **measured,
                    "price_source": "Yahoo Finance adjusted closes (tm_price_history_daily)",
                    "computed_at": now_iso,
                },
            )
        )

    written = 0
    if not dry_run and writes:
        written = write_changed(store, WriteLedger("earnings_reactions", volatile=("computed_at",)), writes, merge=True)
    stats["written"] = written
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--weeks-back", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(f"[earnings_reactions] {run(weeks_back=args.weeks_back, dry_run=args.dry_run)}", flush=True)


if __name__ == "__main__":
    main()
