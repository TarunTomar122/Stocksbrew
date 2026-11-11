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

The calendar leaves the time out of most rows (it says "during"). When it does,
the company's own results 8-K (item 2.02) accepted on the report day settles it:
before 9:30 ET is before the open, 4:00 PM ET or later is after the close. That
is the rule the earnings season planner uses, so both show the same move. The
8-K comes from ``tm_earnings_history`` (earnings_history.py), else from
``tm_agent_filings`` (sec_filings.py). An 8-K accepted during the session leaves
the time unknown. A time the calendar does give is never overridden.

Each reaction records where its time came from: ``calendar_session`` is the
calendar's own value, ``session`` the one the window was measured on,
``session_source`` "calendar" or "sec_8k", and with an 8-K its acceptance time
(``filing_accepted_at``) and link (``filing_url``), both null otherwise. Item
2.02 8-Ks the history marks as not a release are not used. When either 8-K read
fails, rows without a calendar time are left as stored rather than rewritten
as two-session moves.

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
from .earnings_history import COLLECTION as HISTORY, acceptance_session
from .feeds_common import WriteLedger, iso_now, load_universe, query, utc_now, write_changed
from .store import DocStore

COLLECTION = "tm_agent_earnings_reactions"
EVENTS = "tm_earnings_events"
FILINGS = "tm_agent_filings"
SESSIONS = {"bmo", "amc"}


def results_filings_by_day(history: dict[str, Any] | None, filings: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """Each New York day's earliest results 8-K: {day: {session, accepted_at, url}}.

    ``history`` is a ``tm_earnings_history`` document, ``filings`` are
    ``tm_agent_filings`` rows with item 2.02. Amendments restate an old release
    and are skipped. The earliest acceptance on a day is when the market had the
    results, the same choice the planner makes.
    """
    candidates: list[tuple[str, str]] = []  # (accepted_at, url)
    # Item 2.02 8-Ks the history found not to be a release (a delivery update, a conference deck).
    not_releases: set[str] = set()
    for report in (history or {}).get("reports") or []:
        if not isinstance(report, dict):
            continue
        if report.get("release") is False:
            not_releases.add(str(report.get("accession") or ""))
        elif report.get("accepted_at"):
            candidates.append((str(report["accepted_at"]), str(report.get("url") or "")))
    for filing in filings:
        amended = filing.get("is_amendment") is True or str(filing.get("form") or "").upper().endswith("/A")
        if amended or "2.02" not in (filing.get("item_codes") or []) or not filing.get("filed_at"):
            continue
        if str(filing.get("accession") or "") in not_releases:
            continue
        candidates.append((str(filing["filed_at"]), str(filing.get("url") or "")))
    out: dict[str, dict[str, str]] = {}
    for accepted_at, url in sorted(candidates):
        when = acceptance_session(accepted_at)
        if when is None:
            continue
        day, session = when
        if day not in out:
            out[day] = {"session": session, "accepted_at": accepted_at, "url": url}
    return out


def resolve_session(calendar_session: str, filing: dict[str, str] | None) -> tuple[str, str]:
    """(session to measure on, where it came from). The calendar wins when it gives a time."""
    if calendar_session in SESSIONS:
        return calendar_session, "calendar"
    if filing and filing.get("session") in SESSIONS:
        return filing["session"], "sec_8k"
    return "unknown", "calendar"


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

    # The company's results 8-Ks, for rows the calendar gives no time. Both reads are optional:
    # without them a row keeps its two-session window, as before.
    histories: dict[str, dict[str, Any]] = {}
    lookups_ok = True
    try:
        for offset in range(0, len(tickers), 200):
            chunk = tickers[offset : offset + 200]
            found = store.get_many([f"{HISTORY}/{ticker}" for ticker in chunk])
            for ticker in chunk:
                if found.get(f"{HISTORY}/{ticker}"):
                    histories[ticker] = found[f"{HISTORY}/{ticker}"]
    except RuntimeError as error:
        lookups_ok = False
        print(f"[earnings_reactions] earnings history not read: {error}", flush=True)
    recent_filings: dict[str, list[dict[str, Any]]] = {}
    try:
        filing_start = (today - timedelta(weeks=weeks_back) - timedelta(days=3)).isoformat()
        for _path, data in query(
            store,
            FILINGS,
            filters=[("item_codes", "array-contains", "2.02"), ("filing_date", ">=", filing_start)],
            limit=10000,
        ):
            if data.get("ticker"):
                recent_filings.setdefault(str(data["ticker"]).upper(), []).append(data)
    except RuntimeError as error:
        lookups_ok = False
        print(f"[earnings_reactions] 8-K filings not read: {error}", flush=True)
    by_day = {ticker: results_filings_by_day(histories.get(ticker), recent_filings.get(ticker, [])) for ticker in tickers}

    writes: list[tuple[str, dict[str, Any]]] = []
    stats = {
        "events": len(events),
        "tickers": len(tickers),
        "with_prices": len(series),
        "with_8k_history": len(histories),
        "measured": 0,
        "waiting": 0,
        "time_from_8k": 0,
        "two_sessions": 0,
        "kept_for_8k_lookup": 0,
    }
    for event in events:
        ticker = str(event["ticker"]).upper()
        document = series.get(ticker)
        if not document:
            continue
        calendar_session = str(event.get("time") or "").strip().lower()
        calendar_session = calendar_session if calendar_session in SESSIONS else "unknown"
        event_date = str(event.get("event_date") or "")[:10]
        if calendar_session not in SESSIONS and not lookups_ok:
            # Without the 8-K lookup this row would fall back to two sessions and overwrite a
            # stored one-day move; leave it until a run that can read the filings.
            stats["kept_for_8k_lookup"] += 1
            continue
        filing = by_day.get(ticker, {}).get(event_date)
        session, session_source = resolve_session(calendar_session, filing)
        dates, closes = completed_sessions(document.get("dates") or [], document.get("closes") or [], session_day)
        measured = reaction(dates, closes, event_date, session)
        if measured is None:
            stats["waiting"] += 1
            continue
        stats["measured"] += 1
        stats["time_from_8k"] += session_source == "sec_8k"
        stats["two_sessions"] += measured["basis"] == "2d"
        doc: dict[str, Any] = {
            "ticker": ticker,
            "event_date": event_date,
            "market": "US",
            "session": session,
            "calendar_session": calendar_session,
            "session_source": session_source,
            **measured,
            "price_source": "Yahoo Finance adjusted closes (tm_price_history_daily)",
            "computed_at": now_iso,
        }
        # Written either way: the doc is merged, so a stale 8-K time must be cleared, not left behind.
        from_filing = session_source == "sec_8k" and filing is not None
        doc["filing_accepted_at"] = filing["accepted_at"] if from_filing else None
        doc["filing_url"] = filing["url"] if from_filing else None
        writes.append((f"{COLLECTION}/{ticker}_{event_date}", doc))

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
