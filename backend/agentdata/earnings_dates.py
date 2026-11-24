"""The next report date for every covered stock, confirmed or estimated, in ``tm_earnings_events``.

Nasdaq's calendar (``earnings_calendar.py``) only lists about seven weeks
ahead, so after a reporting season most companies have no next date at all
until a month before they report. This job fills the gap in two ways:

1. **Yahoo, when the company has confirmed.** Yahoo's batch quote
   (``/v7/finance/quote``, 50 symbols a request, the same cookie and crumb as
   ``extended_hours.py``) carries the next earnings time and
   ``isEarningsDateEstimate``. A date counts as confirmed only when Yahoo says
   it is not an estimate and its three earnings times (``earningsTimestamp``,
   ``...Start``, ``...End``) fall on the same New York day; anything looser is
   ignored. Written like a Nasdaq row (``market: "US"``,
   ``date_status: "confirmed"``, ``source: "yahoo_quote"``).
2. **Our estimate, from the company's own history.** For a stock with no
   confirmed date still ahead, the next date is read off its past results
   8-Ks (``tm_earnings_history``, release days only, plus any reported
   calendar row the SEC history lacks): the report that followed last year's
   version of the latest one, moved forward 52 weeks so it keeps its weekday
   (a late fourth quarter stays late), or, with less than a year of steady
   history, the last report plus the usual gap, on the usual weekday. The time
   (before the open or after the close) is the one the company used most in
   its last four reports. Fewer than two past reports, a last report more than
   200 days ago, an irregular schedule, or an estimate that is already due:
   nothing is written. Backtest on the stored histories (Nov 24, 2026, each
   stock's last four reports estimated from the ones before): 53% on the day,
   75% within 3 days, 96% within a week.

Estimated rows live in the same collection under their own market value::

    {ticker, company, event_date, time, market: "US_ESTIMATED", date_status: "estimated",
     source: "stocksbrew_estimate", estimate_basis: {method, from_report, gap_days, reports}, ...}

so every reader that filters on ``market == "US"`` (the stock page, the emails,
the briefing, the pre-earnings reads) never sees one, and the readers that do
show them (the earnings pages and /calendar, lib/calendar.ts) ask for them by
name and say "expected".

Supersede rules (nothing is ever deleted; a retired row moves to
``US_SUPERSEDED``, the same marker the Nasdaq job uses):

* A confirmed date still ahead (Nasdaq or Yahoo) always wins: every estimate
  for that stock is retired.
* A stock keeps at most one live estimate: when a new run estimates a
  different day (the company reported, or the history moved), the old one is
  retired. An estimate whose day has passed is retired too.
* When Nasdaq lists a stock on a day Yahoo confirmed, Nasdaq takes the row
  over (``earnings_calendar.build_event``) and Nasdaq's own rules apply to it.
  A Yahoo row is retired here when Yahoo answered for the stock and no longer
  confirms that day, or when Nasdaq lists the stock on another day.
* A Yahoo failure keeps every Yahoo row as it is; it never retires one.

Runs in the ``after_close`` group right after the earnings history it reads.

Run: ``python3 -m backend.agentdata.earnings_dates [--dry-run] [--no-yahoo] [--symbols NVDA,KO]``
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from .earnings_calendar import (
    COLLECTION,
    DATE_STATUS_CONFIRMED,
    DATE_STATUS_ESTIMATED,
    ESTIMATE_SOURCE,
    ESTIMATED_MARKET,
    FIRST_WRITABLE_DATE,
    SUPERSEDED_MARKET,
    YAHOO_SOURCE,
)
from .feeds_common import iso_now, load_universe, query, symbol_key, utc_now
from .store import DocStore

HISTORY = "tm_earnings_history"
_NEW_YORK = ZoneInfo("America/New_York")

# A gap between two release days outside this range is a missed or extra filing, not a quarter.
MIN_GAP_DAYS = 45
MAX_GAP_DAYS = 140
# A year-ago report counts as the same quarter when, moved 52 weeks on, it lands this close to the usual gap.
YEAR_AGO_SLACK_DAYS = 21
# Without a year-ago report, the gaps between reports must agree to this many days.
MAX_GAP_SPREAD_DAYS = 14
# No report for this long: the history stopped (an acquisition, a delisting, a foreign filer).
MAX_DAYS_SINCE_LAST = 200
# Gaps and times are read from this many of the latest reports.
RECENT_REPORTS = 8
RECENT_SESSIONS = 4

YAHOO_BATCH = 50
YAHOO_MIN_INTERVAL_S = 1.0
YAHOO_MAX_REQUESTS = 30
_YAHOO_FIELDS = "symbol,earningsTimestamp,earningsTimestampStart,earningsTimestampEnd,isEarningsDateEstimate"


# -- NYSE days ---------------------------------------------------------------------
# The same holiday rules as lib/market-session.ts (unscheduled closures aside).


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    last = (date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _easter(year: int) -> date:
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    return date(year, month, (h + l - 7 * m + 114) % 31 + 1)


def _observed(day: date) -> date:
    return day - timedelta(days=1) if day.weekday() == 5 else day + timedelta(days=1) if day.weekday() == 6 else day


def nyse_holidays(year: int) -> set[date]:
    days = {
        _nth_weekday(year, 1, 0, 3),  # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),  # Presidents' Day
        _easter(year) - timedelta(days=2),  # Good Friday
        _last_weekday(year, 5, 0),  # Memorial Day
        _observed(date(year, 7, 4)),
        _nth_weekday(year, 9, 0, 1),  # Labor Day
        _nth_weekday(year, 11, 3, 4),  # Thanksgiving
        _observed(date(year, 12, 25)),
    }
    if year >= 2022:
        days.add(_observed(date(year, 6, 19)))
    # A Saturday New Year's Day is not observed (the exchange stays open on Dec 31).
    if date(year, 1, 1).weekday() != 5:
        days.add(_observed(date(year, 1, 1)))
    return days


def is_trading_day(day: date) -> bool:
    return day.weekday() < 5 and day not in nyse_holidays(day.year)


def trading_day_on_or_after(day: date) -> date:
    for _ in range(10):
        if is_trading_day(day):
            return day
        day += timedelta(days=1)
    return day


# -- the estimate ------------------------------------------------------------------


def release_days(history: dict[str, Any] | None) -> list[tuple[date, str]]:
    """(day, session) of each results release in a ``tm_earnings_history`` doc, oldest first, one per day."""
    by_day: dict[date, str] = {}
    for report in (history or {}).get("reports") or []:
        if not isinstance(report, dict) or report.get("release") is False:
            continue
        try:
            day = date.fromisoformat(str(report.get("date") or "")[:10])
        except ValueError:
            continue
        # Newest acceptance wins within a day, as the history is stored newest first.
        by_day.setdefault(day, str(report.get("session") or ""))
    return sorted(by_day.items())


# A calendar day this close to an SEC release day is the same report (the calendar can be a day or two off).
SAME_REPORT_DAYS = 3


def with_reported_days(releases: list[tuple[date, str]], events: Iterable[tuple[str, dict[str, Any]]], today: date) -> list[tuple[date, str]]:
    """The SEC release days plus every past calendar row with a reported result that the SEC history lacks.

    Some 8-Ks never reach the history (a changed filer number, a release filed under another item), while the
    calendar caught the report; without it the history looks stale or overdue and the stock gets no estimate.
    """
    days = dict(releases)
    for _path, data in events:
        if data.get("market") != "US" or data.get("reported_eps") is None:
            continue
        try:
            day = date.fromisoformat(str(data.get("event_date") or "")[:10])
        except ValueError:
            continue
        if day >= today or any(abs((day - known).days) <= SAME_REPORT_DAYS for known in days):
            continue
        time = str(data.get("time") or "")
        days[day] = time if time in {"bmo", "amc"} else "during"
    return sorted(days.items())


def usual_session(sessions: Iterable[str]) -> str:
    """"bmo" or "amc" when most of the given reports used it, else "during" (shown as time not known)."""
    recent = [session for session in sessions if session]
    if not recent:
        return "during"
    session, count = Counter(recent).most_common(1)[0]
    return session if session in {"bmo", "amc"} and count * 2 > len(recent) else "during"


def estimate_next(reports: list[tuple[date, str]], today: date) -> dict[str, Any] | None:
    """The next report day from past release days (oldest first), or None when the history cannot carry one."""
    if len(reports) < 2:
        return None
    days = [day for day, _ in reports]
    last = days[-1]
    if (today - last).days > MAX_DAYS_SINCE_LAST:
        return None
    recent = days[-RECENT_REPORTS:]
    gaps = [(b - a).days for a, b in zip(recent, recent[1:]) if MIN_GAP_DAYS <= (b - a).days <= MAX_GAP_DAYS]
    if not gaps:
        return None
    gap = round(median(gaps))
    year = timedelta(weeks=52)
    # The same quarter a year earlier: find last year's version of the last report, then take the report that
    # followed it, moved 52 weeks on so it keeps its weekday. This keeps a late fourth-quarter report late.
    anchor = None
    earlier = [day for day in days[:-1] if abs((day + year - last).days) <= YEAR_AGO_SLACK_DAYS]
    if earlier:
        matched = min(earlier, key=lambda day: abs((day + year - last).days))
        following = [day for day in days if day > matched]
        if following and MIN_GAP_DAYS <= (following[0] + year - last).days <= MAX_GAP_DAYS:
            anchor = following[0]
    if anchor is not None:
        candidate = anchor + year
        method = "year_ago"
    elif (last - days[0]).days >= (year - timedelta(days=YEAR_AGO_SLACK_DAYS)).days:
        # A year or more of history and still no match: the schedule is irregular (a changed fiscal year, a
        # missing filing), and the usual gap missed by three weeks or more on such histories in the backtest.
        return None
    elif len(gaps) < 2 or max(gaps) - min(gaps) > MAX_GAP_SPREAD_DAYS:
        # Under a year of history: only a steady rhythm says where the next report falls.
        return None
    else:
        target = last + timedelta(days=gap)
        weekday = Counter(day.weekday() for day in days[-RECENT_SESSIONS:]).most_common(1)[0][0]
        shift = (weekday - target.weekday()) % 7
        candidate = target + timedelta(days=shift if shift <= 3 else shift - 7)
        method = "usual_gap"
    candidate = trading_day_on_or_after(candidate)
    if candidate <= today or (candidate - last).days < MIN_GAP_DAYS:
        return None
    return {
        "date": candidate.isoformat(),
        "time": usual_session(session for _, session in reports[-RECENT_SESSIONS:]),
        "basis": {
            "method": method,
            "from_report": (anchor or last).isoformat(),
            "last_report": last.isoformat(),
            "gap_days": gap,
            "reports": len(reports),
        },
    }


# -- Yahoo -------------------------------------------------------------------------


def _ny_day_and_session(epoch: Any) -> tuple[date, str] | None:
    if not isinstance(epoch, (int, float)) or isinstance(epoch, bool) or epoch <= 0:
        return None
    local = datetime.fromtimestamp(epoch, timezone.utc).astimezone(_NEW_YORK)
    minutes = local.hour * 60 + local.minute
    # Midnight is a placeholder for "no time given", not a report before the open.
    session = "during" if minutes == 0 else "bmo" if minutes < 9 * 60 + 30 else "amc" if minutes >= 16 * 60 else "during"
    return local.date(), session


def yahoo_confirmed(row: dict[str, Any] | None, today: date) -> dict[str, str] | None:
    """{date, time} when Yahoo carries a confirmed report day after today, else None."""
    if not isinstance(row, dict) or row.get("isEarningsDateEstimate") is not False:
        return None
    parsed = [_ny_day_and_session(row.get(key)) for key in ("earningsTimestamp", "earningsTimestampStart", "earningsTimestampEnd")]
    if any(item is None for item in parsed):
        return None
    days = {item[0] for item in parsed if item}
    if len(days) != 1:
        return None
    day, session = parsed[0]  # type: ignore[misc]
    if day <= today or not is_trading_day(day):
        return None
    return {"date": day.isoformat(), "time": session}


def yahoo_symbol(ticker: str) -> str:
    """BRK.B is BRK-B on Yahoo."""
    return ticker.replace(".", "-").replace("/", "-")


def fetch_yahoo(tickers: list[str], *, yahoo: Any | None = None) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Yahoo quote rows by our ticker for the tickers Yahoo answered, and what the fetch cost."""
    from .extended_hours import Yahoo, _QUOTE_URL  # the shared cookie, crumb and pacing

    client = yahoo or Yahoo(min_interval=YAHOO_MIN_INTERVAL_S)
    by_symbol = {yahoo_symbol(ticker): ticker for ticker in tickers if 1 <= len(ticker) <= 6 and ticker[0].isalpha()}
    symbols = sorted(by_symbol)
    out: dict[str, dict[str, Any]] = {}
    batches = failed = 0
    for start in range(0, len(symbols), YAHOO_BATCH):
        if client.requests >= YAHOO_MAX_REQUESTS or client.refused:
            failed += 1
            continue
        chunk = symbols[start : start + YAHOO_BATCH]
        if not client.ensure_crumb():
            failed += 1
            continue
        params = urllib.parse.urlencode({"symbols": ",".join(chunk), "fields": _YAHOO_FIELDS, "crumb": client.crumb})
        body = client._get(f"{_QUOTE_URL}?{params}")  # noqa: SLF001 - same package, same client
        batches += 1
        if body is None:
            failed += 1
            continue
        try:
            rows = ((json.loads(body) or {}).get("quoteResponse") or {}).get("result") or []
        except json.JSONDecodeError:
            failed += 1
            continue
        for row in rows:
            if isinstance(row, dict) and str(row.get("symbol") or "").upper() in by_symbol:
                out[by_symbol[str(row["symbol"]).upper()]] = row
    return out, {"batches": batches, "batches_failed": failed, "requests": client.requests, "failures": list(client.failures)[:5]}


# -- the plan ------------------------------------------------------------------------


def _is_live_confirmed(data: dict[str, Any], today_iso: str) -> bool:
    return data.get("market") == "US" and str(data.get("event_date") or "") >= today_iso and data.get("reported_eps") is None


def _retire(reason: str, now_iso: str) -> dict[str, Any]:
    return {"market": SUPERSEDED_MARKET, "superseded_at": now_iso, "superseded_reason": reason}


def plan(
    *,
    universe: dict[str, str],
    histories: dict[str, dict[str, Any]],
    events: list[tuple[str, dict[str, Any]]],
    yahoo_rows: dict[str, dict[str, Any]] | None,
    today: date,
    now_iso: str,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    """The writes for one run and the counts behind them. Pure: no store, no network.

    ``universe`` is ticker -> company name, ``histories`` ticker -> its history doc,
    ``events`` every stored event from a little before today on (any market),
    ``yahoo_rows`` ticker -> Yahoo quote row for the tickers Yahoo answered (None: Yahoo not asked).
    """
    today_iso = today.isoformat()
    by_ticker: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for path, data in events:
        by_ticker.setdefault(str(data.get("ticker") or "").upper(), []).append((path, data))

    writes: list[tuple[str, dict[str, Any]]] = []
    stats: Counter = Counter()
    for ticker, company in sorted(universe.items()):
        rows = by_ticker.get(ticker, [])
        nasdaq = [(path, data) for path, data in rows if _is_live_confirmed(data, today_iso) and data.get("source") != YAHOO_SOURCE]
        yahoo_docs = [(path, data) for path, data in rows if _is_live_confirmed(data, today_iso) and data.get("source") == YAHOO_SOURCE]
        estimates = [(path, data) for path, data in rows if data.get("market") == ESTIMATED_MARKET]
        releases = with_reported_days(release_days(histories.get(ticker)), rows, today)
        answered = yahoo_rows is not None and ticker in yahoo_rows
        from_yahoo = yahoo_confirmed(yahoo_rows.get(ticker), today) if answered and yahoo_rows else None
        if from_yahoo and releases and (date.fromisoformat(from_yahoo["date"]) - releases[-1][0]).days < MIN_GAP_DAYS:
            # Too soon after the last release to be the next one: a stale or wrong row.
            from_yahoo = None
            stats["yahoo_ignored_too_soon"] += 1

        # Yahoo rows: Nasdaq wins over them; Yahoo's own answer moves or retires them.
        kept_yahoo: list[str] = []
        for path, data in yahoo_docs:
            day = str(data.get("event_date"))
            if nasdaq and day not in {str(other.get("event_date")) for _, other in nasdaq}:
                writes.append((path, _retire("nasdaq_calendar lists another date", now_iso)))
                stats["yahoo_retired"] += 1
            elif answered and (from_yahoo is None or from_yahoo["date"] != day):
                writes.append((path, _retire("no longer confirmed for this date by yahoo_quote", now_iso)))
                stats["yahoo_retired"] += 1
            else:
                kept_yahoo.append(day)

        confirmed = bool(nasdaq or kept_yahoo)
        if not confirmed and from_yahoo:
            path = f"{COLLECTION}/{ticker}_{from_yahoo['date']}"
            existing = next((data for p, data in rows if p == path), None)
            if existing is None or existing.get("source") in {ESTIMATE_SOURCE, YAHOO_SOURCE}:
                writes.append(
                    (
                        path,
                        {
                            "ticker": ticker,
                            "company": company or ticker,
                            "event_date": from_yahoo["date"],
                            "fiscal_date_ending": "",
                            "eps_estimate": None,
                            "time": from_yahoo["time"],
                            "market": "US",
                            "date_status": DATE_STATUS_CONFIRMED,
                            "source": YAHOO_SOURCE,
                            "estimate_basis": None,
                            "superseded_at": None,
                            "superseded_reason": None,
                            "captured_at": now_iso,
                        },
                    )
                )
                stats["yahoo_written"] += 1
                kept_yahoo.append(from_yahoo["date"])
            else:
                # A day Nasdaq listed and then dropped: not brought back on Yahoo's word alone.
                stats["yahoo_skipped_retired_day"] += 1
        confirmed = bool(nasdaq or kept_yahoo)

        estimate = None if confirmed else estimate_next(releases, today)
        keep_id = None
        if estimate:
            path = f"{COLLECTION}/{ticker}_{estimate['date']}"
            existing = next((data for p, data in rows if p == path), None)
            if existing is not None and existing.get("source") not in {ESTIMATE_SOURCE, YAHOO_SOURCE}:
                # The day belongs to a row Nasdaq (or an older job) wrote and retired: leave it alone.
                stats["estimate_skipped_taken_day"] += 1
                estimate = None
            else:
                keep_id = path
                # A Yahoo row on this day retired above is taken over by the estimate instead.
                writes[:] = [(p, data) for p, data in writes if p != path]
                doc = {
                    "ticker": ticker,
                    "company": company or ticker,
                    "event_date": estimate["date"],
                    "fiscal_date_ending": "",
                    "eps_estimate": None,
                    "time": estimate["time"],
                    "market": ESTIMATED_MARKET,
                    "date_status": DATE_STATUS_ESTIMATED,
                    "source": ESTIMATE_SOURCE,
                    "estimate_basis": estimate["basis"],
                    "superseded_at": None,
                    "superseded_reason": None,
                }
                if existing is None or any(existing.get(key) != value for key, value in doc.items()):
                    writes.append((path, {**doc, "captured_at": now_iso}))
                    stats["estimates_written"] += 1
                else:
                    stats["estimates_unchanged"] += 1

        for path, data in estimates:
            if path == keep_id or any(path == f"{COLLECTION}/{ticker}_{day}" for day in kept_yahoo):
                continue  # kept, or just taken over by a confirmed Yahoo date
            reason = (
                "a confirmed date is listed"
                if confirmed
                else "the estimated day has passed"
                if str(data.get("event_date") or "") <= today_iso
                else "re-estimated to another day"
                if keep_id
                else "no longer estimable from the history"
            )
            writes.append((path, _retire(reason, now_iso)))
            stats["estimates_retired"] += 1

        if confirmed:
            stats["with_confirmed"] += 1
            stats["confirmed_nasdaq" if nasdaq else "confirmed_yahoo"] += 1
        elif estimate:
            stats["with_estimate"] += 1
            stats[f"estimate_{estimate['basis']['method']}"] += 1
        else:
            stats["with_neither"] += 1
            stats["neither_no_history" if ticker not in histories else "neither_too_few_reports" if len(releases) < 2 else "neither_not_estimable"] += 1
    stats["covered"] = len(universe)
    return writes, dict(stats)


# -- the run -------------------------------------------------------------------------


def run(*, dry_run: bool = False, use_yahoo: bool = True, symbols: list[str] | None = None, show: list[str] | None = None) -> dict[str, Any]:
    store = DocStore.from_env()
    universe = {item.ticker: item.name for item in load_universe(store)}
    if symbols:
        wanted = {symbol_key(symbol) for symbol in symbols}
        universe = {ticker: name for ticker, name in universe.items() if symbol_key(ticker) in wanted}
    today = utc_now().astimezone(_NEW_YORK).date()
    now_iso = iso_now()

    paths = [f"{HISTORY}/{ticker}" for ticker in universe]
    stored = store.get_many(paths) if paths else {}
    histories = {path.split("/", 1)[1]: doc for path, doc in stored.items()}
    # Every row since the Nasdaq job began: its reported days fill gaps in the SEC history, and estimates whose
    # day has passed are retired from the same read.
    since = max((today - timedelta(days=400)).isoformat(), FIRST_WRITABLE_DATE)
    events = [(path, data) for path, data in query(store, COLLECTION, filters=[("event_date", ">=", since)], limit=10000) if str(data.get("ticker") or "").upper() in universe]

    yahoo_rows: dict[str, dict[str, Any]] | None = None
    yahoo_stats: dict[str, Any] = {"asked": False}
    if use_yahoo:
        # Only stocks without a confirmed date ahead need asking, plus those holding a Yahoo row to recheck.
        live = {str(data.get("ticker")).upper() for _, data in events if _is_live_confirmed(data, today.isoformat()) and data.get("source") != YAHOO_SOURCE}
        ask = sorted(ticker for ticker in universe if ticker not in live)
        yahoo_rows, yahoo_stats = fetch_yahoo(ask)
        yahoo_stats = {"asked": len(ask), "answered": len(yahoo_rows), **yahoo_stats}

    writes, stats = plan(universe=universe, histories=histories, events=events, yahoo_rows=yahoo_rows, today=today, now_iso=now_iso)
    for path, data in writes:
        day = path.rsplit("_", 1)[-1]
        if day < FIRST_WRITABLE_DATE or str(data.get("event_date") or day) < FIRST_WRITABLE_DATE:
            raise RuntimeError(f"refusing to write an event before {FIRST_WRITABLE_DATE}: {path}")
    if not dry_run and writes:
        store.set_many(writes, merge=True)
    if show:
        wanted = {symbol_key(symbol) for symbol in show}
        for path, data in writes:
            if symbol_key(path.split("/", 1)[1].rsplit("_", 1)[0]) in wanted:
                print(f"  {path}: {json.dumps({key: data.get(key) for key in ('market', 'source', 'time', 'estimate_basis', 'superseded_reason') if key in data})}")
    return {**stats, "yahoo": yahoo_stats, "writes": len(writes), "written": 0 if dry_run else len(writes), "today": today.isoformat()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--dry-run", action="store_true", help="read and plan, write nothing")
    parser.add_argument("--no-yahoo", action="store_true", help="skip Yahoo; estimates only")
    parser.add_argument("--symbols", default="", help="comma-separated tickers (default: every covered stock)")
    parser.add_argument("--show", default="", help="comma-separated tickers whose planned writes are printed")
    args = parser.parse_args()
    symbols = [symbol.strip() for symbol in args.symbols.split(",") if symbol.strip()] or None
    show = [symbol.strip() for symbol in args.show.split(",") if symbol.strip()] or None
    stats = run(dry_run=args.dry_run, use_yahoo=not args.no_yahoo, symbols=symbols, show=show)
    print(f"[earnings_dates] {stats}", flush=True)


if __name__ == "__main__":
    main()
