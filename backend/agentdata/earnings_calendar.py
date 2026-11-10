"""Earnings calendar gap fill for ``tm_earnings_events``.

The original calendar came from one Alpha Vantage ``EARNINGS_CALENDAR`` pull
(``backend/scripts/sync_earnings_calendar.py``, horizon 3 months) on 2026-05-16
that no scheduled lane ever repeated, so the collection ends on 2026-08-13.

This job reads Nasdaq's public calendar (``api.nasdaq.com/api/calendar/earnings``,
one request per day, no key) for the last 4 and next 8 weeks and writes the
events for symbols we cover, in the schema and id convention the old job used
(``{TICKER}_{YYYY-MM-DD}``), so the existing readers pick them up and a resumed
Alpha Vantage run would merge into the same documents instead of duplicating.

Rules:

* Only events dated 2026-08-14 or later are ever written. Nothing is deleted.
* Writes merge, so actuals another job added to a document survive.
* A date that Nasdaq no longer lists for a symbol is marked superseded by moving
  it out of the ``US`` market value every reader filters on. Only documents this
  job created (``source == "nasdaq_calendar"``) and only future dates.

Run: ``python3 -m backend.agentdata.earnings_calendar``
"""

from __future__ import annotations

import argparse
import calendar
import re
from datetime import date, timedelta
from typing import Any

from .feeds_common import BROWSER_USER_AGENT, Fetcher, iso_now, load_universe, query, symbol_key, utc_now
from .store import DocStore

COLLECTION = "tm_earnings_events"
SOURCE = "nasdaq_calendar"
# The old calendar covers everything up to 2026-08-13. Never touch that range.
FIRST_WRITABLE_DATE = "2026-08-14"
SUPERSEDED_MARKET = "US_SUPERSEDED"
_API = "https://api.nasdaq.com/api/calendar/earnings?date={day}"
_MONTHS = {name.lower(): index for index, name in enumerate(calendar.month_abbr) if name}
_TIME_LABELS = {"time-pre-market": "bmo", "time-after-hours": "amc"}


def parse_money(raw: Any) -> float | None:
    """``$1.38`` -> 1.38, ``($0.12)`` -> -0.12, blank or N/A -> None."""
    text = str(raw or "").strip()
    if not text or text.upper() in {"N/A", "NA", "--", "-"}:
        return None
    negative = text.startswith("(") or text.startswith("-")
    cleaned = re.sub(r"[^0-9.]", "", text)
    if not cleaned or cleaned == ".":
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return -value if negative else value


def parse_percent(raw: Any) -> float | None:
    text = str(raw or "").strip().replace("%", "").replace(",", "")
    if not text or text.upper() in {"N/A", "NA", "--"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def fiscal_month_end(raw: Any) -> str:
    """``Sep/2026`` -> ``2026-09-30``. Empty string when it cannot be read."""
    match = re.fullmatch(r"\s*([A-Za-z]{3})[a-z]*/(\d{4})\s*", str(raw or ""))
    if not match:
        return ""
    month = _MONTHS.get(match.group(1).lower())
    if not month:
        return ""
    year = int(match.group(2))
    return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def parse_calendar_day(payload: Any) -> list[dict[str, Any]] | None:
    """Rows for one day, or None when the response carries no usable table.

    None (bad payload) and [] (a real day with nobody reporting) are different:
    only a real table may be used to retire a stale date.
    """
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, dict) or "rows" not in data:
        return None
    rows = data.get("rows")
    if rows is None:
        return []
    if not isinstance(rows, list):
        return None
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        out.append(
            {
                "symbol": symbol,
                "company": " ".join(str(row.get("name") or "").split()),
                "time": _TIME_LABELS.get(str(row.get("time") or "").strip().lower(), "during"),
                "fiscal_date_ending": fiscal_month_end(row.get("fiscalQuarterEnding")),
                "eps_estimate": parse_money(row.get("epsForecast")),
                # Only present once the company has reported.
                "reported_eps": parse_money(row.get("eps")) if "eps" in row else None,
                "surprise_pct": parse_percent(row.get("surprise")) if "surprise" in row else None,
            }
        )
    return out


def surprise_label(reported: float | None, pct: float | None) -> str:
    """Same thresholds as ``backend.earnings_actuals.summarize_surprise``."""
    if reported is None:
        return "unknown"
    if pct is None:
        return "reported"
    if pct >= 1.0:
        return "beat"
    if pct <= -1.0:
        return "miss"
    return "in-line"


def build_event(
    row: dict[str, Any],
    *,
    ticker: str,
    day: str,
    now_iso: str,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The document to merge into ``tm_earnings_events/{ticker}_{day}``."""
    existing = existing or {}
    time_label = row["time"]
    # Nasdaq drops the before/after-market flag once a day has passed; keep ours.
    if time_label == "during" and existing.get("time") in {"bmo", "amc"}:
        time_label = existing["time"]
    event: dict[str, Any] = {
        "ticker": ticker,
        "company": row["company"] or existing.get("company") or ticker,
        "event_date": day,
        "fiscal_date_ending": row["fiscal_date_ending"] or existing.get("fiscal_date_ending") or "",
        "eps_estimate": row["eps_estimate"] if row["eps_estimate"] is not None else existing.get("eps_estimate"),
        "time": time_label,
        "market": "US",
        "captured_at": now_iso,
        "source": existing.get("source") or SOURCE,
    }
    reported = row.get("reported_eps")
    # Fill results only where no other job has: Alpha Vantage / yfinance actuals win.
    if reported is not None and existing.get("reported_eps") is None:
        estimate = row["eps_estimate"]
        pct = row.get("surprise_pct")
        if pct is None and estimate:
            pct = round((reported - estimate) / abs(estimate) * 100.0, 4)
        event.update(
            {
                "reported_eps": reported,
                "estimated_eps": estimate,
                "eps_surprise": round(reported - estimate, 4) if estimate is not None else None,
                "eps_surprise_pct": pct,
                "surprise_label": surprise_label(reported, pct),
                "actuals_reported_date": day,
                "actuals_fiscal_date_ending": row["fiscal_date_ending"],
                "actuals_source": SOURCE,
                "actuals_captured_at": now_iso,
            }
        )
    return event


def _changed(event: dict[str, Any], existing: dict[str, Any] | None) -> bool:
    if not existing:
        return True
    return any(existing.get(key) != value for key, value in event.items() if key not in {"captured_at"})


def run(*, weeks_back: int = 4, weeks_ahead: int = 8, dry_run: bool = False) -> dict[str, Any]:
    store = DocStore.from_env()
    universe = {symbol_key(item.ticker): item.ticker for item in load_universe(store)}
    fetcher = Fetcher(
        "nasdaq_earnings",
        user_agent=BROWSER_USER_AGENT,
        min_interval=0.6,
        ttl=3 * 3600,
        headers={
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )
    today = utc_now().date()
    start = today - timedelta(weeks=weeks_back)
    end = today + timedelta(weeks=weeks_ahead)
    now_iso = iso_now()

    existing = {
        path.split("/", 1)[1]: data
        for path, data in query(
            store,
            COLLECTION,
            filters=[("event_date", ">=", max(start.isoformat(), FIRST_WRITABLE_DATE)), ("event_date", "<=", end.isoformat())],
            limit=10000,
        )
    }

    writes: list[tuple[str, dict[str, Any]]] = []
    listed_by_day: dict[str, set[str]] = {}
    stats = {"days": 0, "days_failed": 0, "rows": 0, "covered": 0, "added": 0, "updated": 0, "unchanged": 0, "with_results": 0}
    day: date = start
    while day <= end:
        iso = day.isoformat()
        day += timedelta(days=1)
        if iso < FIRST_WRITABLE_DATE:
            continue
        rows = parse_calendar_day(fetcher.get_json(_API.format(day=iso)))
        if rows is None:
            stats["days_failed"] += 1
            continue
        stats["days"] += 1
        stats["rows"] += len(rows)
        listed: set[str] = set()
        for row in rows:
            ticker = universe.get(symbol_key(row["symbol"]))
            if not ticker or ticker in listed:
                continue
            listed.add(ticker)
            doc_id = f"{ticker}_{iso}"
            before = existing.get(doc_id)
            event = build_event(row, ticker=ticker, day=iso, now_iso=now_iso, existing=before)
            stats["covered"] += 1
            if event.get("reported_eps") is not None or (before or {}).get("reported_eps") is not None:
                stats["with_results"] += 1
            if before and before.get("market") == SUPERSEDED_MARKET:
                # The date came back: clear the marker along with restoring the market.
                event.update({"superseded_at": None, "superseded_reason": None})
            if not _changed(event, before):
                stats["unchanged"] += 1
                continue
            stats["updated" if before else "added"] += 1
            writes.append((f"{COLLECTION}/{doc_id}", event))
        listed_by_day[iso] = listed

    # Retire dates Nasdaq moved: ours, still in the future, and gone from a day we just read.
    superseded = 0
    today_iso = today.isoformat()
    for doc_id, data in existing.items():
        event_date = str(data.get("event_date") or "")
        if data.get("source") != SOURCE or data.get("market") != "US" or event_date < today_iso:
            continue
        listed = listed_by_day.get(event_date)
        if listed is None or str(data.get("ticker") or "") in listed:
            continue
        superseded += 1
        writes.append(
            (
                f"{COLLECTION}/{doc_id}",
                {
                    "market": SUPERSEDED_MARKET,
                    "superseded_at": now_iso,
                    "superseded_reason": "no longer listed for this date by nasdaq_calendar",
                },
            )
        )

    for path, data in writes:
        date_part = path.rsplit("_", 1)[-1]
        if date_part < FIRST_WRITABLE_DATE or (data.get("event_date") or date_part) < FIRST_WRITABLE_DATE:
            raise RuntimeError(f"refusing to write an event before {FIRST_WRITABLE_DATE}: {path}")
    if not dry_run and writes:
        store.set_many(writes, merge=True)

    stats.update(
        {
            "superseded": superseded,
            "written": 0 if dry_run else len(writes),
            "window": f"{max(start.isoformat(), FIRST_WRITABLE_DATE)}..{end.isoformat()}",
            "requests": fetcher.requests,
            "failures": fetcher.failures[:10],
        }
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--weeks-back", type=int, default=4)
    parser.add_argument("--weeks-ahead", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    stats = run(weeks_back=args.weeks_back, weeks_ahead=args.weeks_ahead, dry_run=args.dry_run)
    print(f"[earnings_calendar] {stats}", flush=True)


if __name__ == "__main__":
    main()
