"""After-hours and pre-market quotes for the stocks we follow.

A stock that reports after the close can be up 18% by 8 PM while every page
still shows the 4 PM close. This job keeps each stock's newest print outside the
regular session next to the close it moved from, so the stock page, the agent's
record, the inbox, the briefing, proposals and Ask can say so, always labelled
"after hours" or "pre-market" with its time. It never feeds a call, a level or
the day's % change: those stay on regular-session prices.

Where the numbers come from: Yahoo Finance's batch quote (``/v7/finance/quote``,
up to 50 symbols a request behind Yahoo's cookie and crumb) gives each stock's
regular close and time, its latest post-market and pre-market price and their
times. When that endpoint refuses us, the per-symbol chart with pre/post bars
(``/v8/finance/chart``, the transport earnings_day.py already uses) covers the
priority names only, within a request budget.

One document per stock::

    tm_extended_quotes/{TICKER}
      ticker, instrument_id
      session: "post" | "pre"          the newest print's session; the top-level fields mirror that block
      price, change_pct, change_abs    against the regular close before it
      regular_close, regular_close_at  that close, and when it printed
      as_of                            when the extended print traded (Yahoo's time)
      day                              the New York day of ``as_of``
      source: "Yahoo Finance"
      post {price, change_pct, change_abs, regular_close, regular_close_at, as_of, day, crossed_at}
      pre  {...the same...}            each session's latest print, kept when the other session takes over
      earnings {date, session: "amc"|"bmo", confirmed, reason} | null
      captured_at, job_version

``crossed_at`` holds, per threshold ("3", "5" percent), the first print of that
session whose move from the close reached it, so a reader can date the event
once instead of re-dating it on every 15-minute snapshot.

Which stocks, in order (the order only matters when the budget runs out):
today's reporters from the earnings calendar first (after-close reporters in
the evening; yesterday's after-close and today's before-open reporters in the
morning), then every tracked stock, then the covered universe.

Safe to rerun: a document is written only when its print changed, by id, and
nothing is deleted. A stock with no print newer than its close is left alone.

Run::

    python3 -m backend.agentdata.extended_hours --dry-run          # print what it would write
    python3 -m backend.agentdata.extended_hours --tickers CBRS,NVDA --dry-run
    python3 -m backend.agentdata.extended_hours                    # write tm_extended_quotes

Standard library only.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable
from zoneinfo import ZoneInfo

from backend.mail import nyse

from .feeds_common import iso_now, load_universe, query
from .store import DocStore

COLLECTION = "tm_extended_quotes"
JOB_VERSION = 1
NY = ZoneInfo("America/New_York")
SOURCE = "Yahoo Finance"

# Yahoo answers browser-shaped clients; a bare "Mozilla/5.0" is what its own
# libraries send and gets fewer 429s than a full Chrome string from a server.
USER_AGENT = "Mozilla/5.0"
_COOKIE_URL = "https://fc.yahoo.com"
_CRUMB_URL = "https://query2.finance.yahoo.com/v1/test/getcrumb"
_QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote"
_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?interval=5m&range=2d&includePrePost=true"
_QUOTE_FIELDS = ",".join(
    [
        "symbol",
        "regularMarketPrice",
        "regularMarketTime",
        "postMarketPrice",
        "postMarketTime",
        "preMarketPrice",
        "preMarketTime",
    ]
)

BATCH_SIZE = 50
# Gap between any two Yahoo requests, and the most a run may send. A full run is
# about 15 quote requests (two to set up the crumb); the chart fallback is one
# request per symbol and stops at its own budget.
MIN_INTERVAL_S = 0.6
MAX_QUOTE_REQUESTS = 40
MAX_CHART_REQUESTS = 120
RUN_BUDGET_S = 6 * 60
# Moves from the close a reader treats as news: 3% after a report, 5% otherwise.
THRESHOLDS = (3, 5)
# A print older than this is not this session's (a halted or delisted name).
MAX_PRINT_AGE = timedelta(hours=20)
# Prices below this are left out: a penny stock's after-hours print is noise.
MIN_PRICE = 1.0


def ny_now(now: datetime | None = None) -> datetime:
    return (now or datetime.now(timezone.utc)).astimezone(NY)


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    out = float(value)
    return out if out == out and out not in (float("inf"), float("-inf")) else None


def _epoch_iso(value: Any) -> str | None:
    seconds = _num(value)
    if seconds is None or seconds <= 0:
        return None
    return datetime.fromtimestamp(seconds, timezone.utc).astimezone(NY).isoformat()


def _parse(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        parsed = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _ny_day(iso: str | None) -> str:
    parsed = _parse(iso)
    return parsed.astimezone(NY).date().isoformat() if parsed else ""


# -- the quote rule -------------------------------------------------------------


def session_of(as_of: str, regular_close_at: str) -> str | None:
    """"post" for a print on the close's own New York day at or after 4 PM (1 PM on a half day), "pre" for one before
    9:30 on a later day, None for anything else (a print inside a regular session is not an extended quote)."""
    at = _parse(as_of)
    close = _parse(regular_close_at)
    if not at or not close or at <= close:
        return None
    at_ny, close_ny = at.astimezone(NY), close.astimezone(NY)
    minutes = at_ny.hour * 60 + at_ny.minute
    if at_ny.date() == close_ny.date():
        return "post" if minutes >= close_ny.hour * 60 + close_ny.minute - 1 else None
    return "pre" if minutes < 9 * 60 + 30 else None


def extended_block(
    *,
    price: float | None,
    as_of: str | None,
    regular_close: float | None,
    regular_close_at: str | None,
    now: datetime,
) -> dict[str, Any] | None:
    """One session's print against the close before it, or None when it is not a real extended quote."""
    if price is None or regular_close is None or not as_of or not regular_close_at:
        return None
    if price < MIN_PRICE or regular_close < MIN_PRICE:
        return None
    session = session_of(as_of, regular_close_at)
    at = _parse(as_of)
    if session is None or at is None or now - at > MAX_PRINT_AGE or at - now > timedelta(minutes=5):
        return None
    change = price - regular_close
    return {
        "session": session,
        "price": round(price, 4),
        "change_abs": round(change, 4),
        "change_pct": round(change / regular_close * 100, 2),
        "regular_close": round(regular_close, 4),
        "regular_close_at": regular_close_at,
        "as_of": as_of,
        "day": _ny_day(as_of),
    }


def blocks_from_quote(row: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    """The post- and pre-market blocks a v7 quote row carries, each against the regular close it moved from."""
    close = _num(row.get("regularMarketPrice"))
    close_at = _epoch_iso(row.get("regularMarketTime"))
    out = []
    for price_key, time_key in (("postMarketPrice", "postMarketTime"), ("preMarketPrice", "preMarketTime")):
        block = extended_block(
            price=_num(row.get(price_key)),
            as_of=_epoch_iso(row.get(time_key)),
            regular_close=close,
            regular_close_at=close_at,
            now=now,
        )
        if block:
            out.append(block)
    return out


def blocks_from_chart(payload: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    """The newest extended print in a v8 chart with pre/post bars, against the regular close before it."""
    result = ((payload or {}).get("chart") or {}).get("result") or []
    if not result or not isinstance(result[0], dict):
        return []
    data = result[0]
    meta = data.get("meta") or {}
    stamps = data.get("timestamp") or []
    quote = (((data.get("indicators") or {}).get("quote") or [{}])[0]) or {}
    closes = quote.get("close") or []
    bars = [(int(ts), float(px)) for ts, px in zip(stamps, closes) if _num(ts) is not None and _num(px) is not None]
    if not bars:
        return []
    close = _num(meta.get("regularMarketPrice"))
    close_at = _epoch_iso(meta.get("regularMarketTime"))
    close_ts = _num(meta.get("regularMarketTime")) or 0
    after = [(ts, px) for ts, px in bars if ts > close_ts]
    if not after:
        return []
    ts, px = after[-1]
    block = extended_block(price=px, as_of=_epoch_iso(ts), regular_close=close, regular_close_at=close_at, now=now)
    return [block] if block else []


def with_crossings(block: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    """Carry the first time this session's move reached each threshold; a new session starts over."""
    same = bool(previous) and previous.get("day") == block["day"] and previous.get("session") == block["session"]
    crossed = dict((previous or {}).get("crossed_at") or {}) if same else {}
    for threshold in THRESHOLDS:
        key = str(threshold)
        if key not in crossed and abs(block["change_pct"]) >= threshold:
            crossed[key] = block["as_of"]
    return {**block, "crossed_at": crossed}


# -- earnings context --------------------------------------------------------------


def earnings_reason(report: dict[str, Any] | None) -> str | None:
    """A few words from the earnings day report: the outlook, then EPS against the estimate, then revenue growth."""
    if not report:
        return None
    parts: list[str] = []
    guidance = str(((report.get("guidance") or {}).get("change")) or "")
    if guidance == "raised":
        parts.append("raised its outlook")
    elif guidance == "lowered":
        parts.append("cut its outlook")
    verdict = str(((report.get("eps") or {}).get("verdict")) or "")
    if verdict == "beat":
        parts.append("beat on earnings")
    elif verdict == "miss":
        parts.append("missed on earnings")
    revenue = report.get("revenue") or {}
    revenue_verdict = str(revenue.get("verdict") or "")
    yoy = _num(revenue.get("yoy_pct"))
    if revenue_verdict == "beat":
        parts.append("revenue beat")
    elif revenue_verdict == "miss":
        parts.append("revenue missed")
    elif yoy is not None and abs(yoy) >= 1 and len(parts) < 2:
        parts.append(f"revenue {'up' if yoy > 0 else 'down'} {abs(yoy):.0f}% on a year ago")
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}" if len(parts) > 2 else f"{parts[0]} and {parts[1]}"


def reporters(store: DocStore, days: Iterable[str]) -> dict[str, dict[str, Any]]:
    """Calendar rows for these New York days, by ticker: {date, session}."""
    out: dict[str, dict[str, Any]] = {}
    for day in days:
        for _path, data in query(store, "tm_earnings_events", filters=[("event_date", "==", day)], limit=5000):
            ticker = str(data.get("ticker") or "").strip().upper()
            when = str(data.get("time") or "").lower()
            if not ticker or not _plain_ticker(ticker):
                continue
            session = "amc" if when in ("amc", "after_close", "time-after-hours") else "bmo" if when in ("bmo", "before_open", "time-pre-market") else ""
            out.setdefault(ticker, {"date": day, "session": session})
    return out


def report_fits(block: dict[str, Any], earnings: dict[str, Any]) -> bool:
    """Whether a report explains this print: after the close the print moved from, or before this pre-market's open."""
    session, when = str(earnings.get("session") or ""), str(earnings.get("date") or "")
    if session == "amc":
        return bool(when) and when == _ny_day(block.get("regular_close_at"))
    return session == "bmo" and block.get("session") == "pre" and when == block.get("day")


def earnings_for(block: dict[str, Any], event: dict[str, Any] | None, report: dict[str, Any] | None) -> dict[str, Any] | None:
    """The report this print reacts to: an after-close report on the close's day, or (before the open) one after the
    last close or before this open. The calendar's time is used unless the 8-K's acceptance time says otherwise."""
    if not event and not report:
        return None
    session = str((report or {}).get("session") or (event or {}).get("session") or "")
    # The 8-K's acceptance time is the report's real day: a release the calendar put after Monday's close but filed
    # before Tuesday's open is Tuesday's before-open report.
    filed_day = _ny_day(str(((report or {}).get("filing") or {}).get("filed_at") or ""))
    when = filed_day or str((report or {}).get("event_date") or (event or {}).get("date") or "")
    if not report_fits(block, {"session": session, "date": when}):
        return None
    confirmed = bool(report and (report.get("filing") or {}).get("accession"))
    return {"date": when, "session": session, "confirmed": confirmed, "reason": earnings_reason(report)}


# -- yahoo -----------------------------------------------------------------------


class Yahoo:
    """Yahoo's quote and chart endpoints with one cookie jar, one crumb and one rate limit."""

    def __init__(self, *, min_interval: float = MIN_INTERVAL_S, opener: Any | None = None) -> None:
        self._jar = http.cookiejar.CookieJar()
        self._open = opener or urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self._jar)).open
        self._min_interval = min_interval
        self._next_at = 0.0
        self.crumb: str | None = None
        self.requests = 0
        self.failures: list[str] = []
        self.refused = False
        self.last_status = 0

    def _get(self, url: str, *, timeout: float = 20) -> str | None:
        wait = self._next_at - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._next_at = time.monotonic() + self._min_interval
        self.requests += 1
        self.last_status = 0
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"})
        try:
            with self._open(request, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            # fc.yahoo.com answers 404 but still sets the cookie.
            if url == _COOKIE_URL:
                return ""
            self.last_status = error.code
            self.failures.append(f"{url.split('?')[0]} (http {error.code})")
            if error.code in (401, 403, 429):
                self.refused = True
            return None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as error:
            self.failures.append(f"{url.split('?')[0]} ({type(error).__name__})")
            return None

    def ensure_crumb(self) -> bool:
        if self.crumb:
            return True
        self._get(_COOKIE_URL)
        crumb = (self._get(_CRUMB_URL) or "").strip()
        # A crumb is a short token; an HTML error page or "Too Many Requests" is not one.
        if crumb and len(crumb) <= 40 and " " not in crumb and "<" not in crumb:
            self.crumb = crumb
            return True
        return False

    def quotes(self, symbols: list[str]) -> dict[str, dict[str, Any]] | None:
        """v7 quote rows by symbol, or None when Yahoo refused the batch."""
        if not self.ensure_crumb():
            return None
        body = self._get(self._quote_url(symbols))
        if body is None and self.last_status == 401:
            # A stale crumb: fetch a new cookie and crumb once and retry, before giving up on the batch quote.
            self.crumb = None
            self.refused = False
            if not self.ensure_crumb():
                self.refused = True
                return None
            body = self._get(self._quote_url(symbols))
        if body is None:
            return None
        try:
            rows = ((json.loads(body) or {}).get("quoteResponse") or {}).get("result") or []
        except json.JSONDecodeError:
            self.failures.append("quote (bad json)")
            return None
        return {str(row.get("symbol") or "").upper(): row for row in rows if isinstance(row, dict)}

    def _quote_url(self, symbols: list[str]) -> str:
        params = urllib.parse.urlencode({"symbols": ",".join(symbols), "fields": _QUOTE_FIELDS, "crumb": self.crumb})
        return f"{_QUOTE_URL}?{params}"

    def chart(self, symbol: str) -> dict[str, Any] | None:
        body = self._get(_CHART_URL.format(symbol=urllib.parse.quote(symbol)))
        if not body:
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None


def yahoo_symbol(ticker: str) -> str:
    """BRK.B is BRK-B on Yahoo."""
    return ticker.replace(".", "-").replace("/", "-")


def _plain_ticker(ticker: str) -> bool:
    return 1 <= len(ticker) <= 6 and all(ch.isalnum() or ch in ".-" for ch in ticker) and ticker[0].isalpha()


# -- the run ----------------------------------------------------------------------


def tracked_tickers(store: DocStore) -> list[str]:
    """US stocks someone tracks (``tm_tracked_instruments`` with a positive count), most-tracked first."""
    rows = []
    for _path, data in query(store, "tm_tracked_instruments", filters=[("market", "==", "US")], limit=10000):
        count = _num(data.get("tracked_count")) or 0
        iid = str(data.get("instrument_id") or "").upper()
        ticker = str(data.get("ticker") or (iid[3:] if iid.startswith("US_") else "")).strip().upper()
        if count > 0 and ticker and _plain_ticker(ticker):
            rows.append((count, ticker))
    return [ticker for _count, ticker in sorted(rows, key=lambda row: (-row[0], row[1]))]


def reporter_days(now_ny: datetime) -> list[str]:
    """The calendar days whose reporters move now: in the evening today's; before the open the last session's
    (its after-close reporters) and today's (its before-open reporters)."""
    today = now_ny.date()
    minutes = now_ny.hour * 60 + now_ny.minute
    if nyse.trading_day(today) and minutes >= 16 * 60 - 30:
        return [today.isoformat()]
    last = nyse.previous_session(today) if nyse.trading_day(today) else nyse.session_on_or_before(today)
    days = [last.isoformat()]
    if nyse.trading_day(today):
        days.append(today.isoformat())
    return days


def ordered_universe(reporting: Iterable[str], tracked: Iterable[str], covered: Iterable[str], limit: int | None = None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for ticker in [*reporting, *tracked, *covered]:
        if ticker and ticker not in seen:
            seen.add(ticker)
            out.append(ticker)
    return out[:limit] if limit else out


def build_doc(
    ticker: str,
    blocks: list[dict[str, Any]],
    previous: dict[str, Any] | None,
    *,
    event: dict[str, Any] | None,
    report: dict[str, Any] | None,
    captured_at: str,
) -> dict[str, Any] | None:
    """The stock's document from this run's prints and the stored one, or None when there is nothing to store."""
    previous = previous or {}
    sessions: dict[str, dict[str, Any]] = {}
    for name in ("post", "pre"):
        kept = previous.get(name)
        if isinstance(kept, dict) and kept.get("as_of"):
            sessions[name] = kept
    for block in blocks:
        kept = sessions.get(block["session"])
        # Never step back to an older print (a cached or lagging reply).
        if kept and (_parse(kept.get("as_of")) or datetime.min.replace(tzinfo=timezone.utc)) > (_parse(block["as_of"]) or datetime.min.replace(tzinfo=timezone.utc)):
            continue
        sessions[block["session"]] = with_crossings(block, kept)
    if not sessions:
        return None
    newest = max(sessions.values(), key=lambda block: _parse(block.get("as_of")) or datetime.min.replace(tzinfo=timezone.utc))
    earnings = earnings_for(newest, event, report)
    if earnings is None and newest["session"] == "pre" and "post" in sessions:
        # Before the open, last evening's report still explains the move.
        earnings = earnings_for(sessions["post"], event, report)
    if earnings is None:
        kept = previous.get("earnings")
        # A stored report stays only while it still explains the newest print: an after-close report on that print's
        # close, or a before-open report for this morning's pre-market print. A before-open report never explains
        # the same evening's after-hours move.
        if isinstance(kept, dict) and report_fits(newest, kept):
            earnings = kept
    doc = {
        "ticker": ticker,
        "instrument_id": f"US_{ticker}",
        "session": newest["session"],
        "price": newest["price"],
        "change_pct": newest["change_pct"],
        "change_abs": newest["change_abs"],
        "regular_close": newest["regular_close"],
        "regular_close_at": newest["regular_close_at"],
        "as_of": newest["as_of"],
        "day": newest["day"],
        "source": SOURCE,
        **{name: block for name, block in sessions.items()},
        "earnings": earnings,
        "captured_at": captured_at,
        "job_version": JOB_VERSION,
    }
    return doc


def _same(a: dict[str, Any] | None, b: dict[str, Any]) -> bool:
    if not a:
        return False
    keys = ("session", "price", "as_of", "post", "pre", "earnings")
    return all(a.get(key) == b.get(key) for key in keys)


def run(
    store: DocStore | None,
    *,
    now: datetime | None = None,
    tickers: list[str] | None = None,
    dry_run: bool = False,
    yahoo: Yahoo | None = None,
    budget_s: float = RUN_BUDGET_S,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    started = time.monotonic()
    now_utc = now or datetime.now(timezone.utc)
    now_ny = ny_now(now_utc)
    yahoo = yahoo or Yahoo()

    days = reporter_days(now_ny)
    calendar = reporters(store, days) if store else {}
    if tickers:
        universe = [ticker.strip().upper() for ticker in tickers if ticker.strip()]
        reporting = [ticker for ticker in universe if ticker in calendar]
        priority = set(universe)
    else:
        covered = [item.ticker for item in load_universe(store)] if store else []
        tracked = tracked_tickers(store) if store else []
        known = set(covered) | set(tracked)
        # A reporter we neither cover nor track still gets a quote: its move is what people search for that night.
        reporting = sorted(calendar, key=lambda ticker: (ticker not in known, ticker))[:200]
        universe = ordered_universe(reporting, tracked, covered)
        priority = set(reporting) | set(tracked)

    # Quotes: v7 in batches, reporters first.
    rows: dict[str, list[dict[str, Any]]] = {}
    fetched: set[str] = set()
    quote_requests = 0
    for start in range(0, len(universe), BATCH_SIZE):
        if time.monotonic() - started > budget_s or quote_requests >= MAX_QUOTE_REQUESTS:
            log(f"[extended] budget reached after {len(fetched)} of {len(universe)} symbols")
            break
        chunk = universe[start : start + BATCH_SIZE]
        quote_requests += 1
        got = yahoo.quotes([yahoo_symbol(ticker) for ticker in chunk])
        if got is None:
            break
        for ticker in chunk:
            fetched.add(ticker)
            row = got.get(yahoo_symbol(ticker).upper())
            if row:
                rows[ticker] = blocks_from_quote(row, now_utc)

    # The batch quote refused us: the chart, one symbol a request, for the names that matter most.
    if len(fetched) < len(universe) and (yahoo.refused or not yahoo.crumb):
        yahoo.refused = False
        missing = [ticker for ticker in universe if ticker not in fetched and ticker in priority]
        log(f"[extended] batch quote unavailable; chart fallback for {min(len(missing), MAX_CHART_REQUESTS)} priority symbols")
        for count, ticker in enumerate(missing):
            if count >= MAX_CHART_REQUESTS or time.monotonic() - started > budget_s:
                break
            payload = yahoo.chart(yahoo_symbol(ticker))
            if payload:
                fetched.add(ticker)
                rows[ticker] = blocks_from_chart(payload, now_utc)
            if yahoo.refused and count >= 2:
                log("[extended] Yahoo is refusing chart requests too; stopping")
                break

    with_prints = {ticker: blocks for ticker, blocks in rows.items() if blocks}
    paths = [f"{COLLECTION}/{ticker}" for ticker in with_prints]
    previous = store.get_many(paths) if store and paths else {}
    report_paths = [f"tm_earnings_day/{ticker}__{calendar[ticker]['date']}" for ticker in with_prints if ticker in calendar]
    reports = store.get_many(report_paths) if store and report_paths else {}

    captured_at = iso_now()
    docs: list[tuple[str, dict[str, Any]]] = []
    for ticker, blocks in with_prints.items():
        path = f"{COLLECTION}/{ticker}"
        event = calendar.get(ticker)
        report = reports.get(f"tm_earnings_day/{ticker}__{event['date']}") if event else None
        doc = build_doc(ticker, blocks, previous.get(path), event=event, report=report, captured_at=captured_at)
        if doc and not _same(previous.get(path), doc):
            docs.append((path, doc))

    big = sorted(
        (doc for _path, doc in docs if abs(doc["change_pct"]) >= THRESHOLDS[0]),
        key=lambda doc: -abs(doc["change_pct"]),
    )
    for doc in big[:12]:
        reason = (doc.get("earnings") or {}).get("reason")
        log(
            f"[extended] {doc['ticker']:6s} {doc['session']:4s} {doc['change_pct']:+6.2f}% ${doc['price']:.2f} at {doc['as_of']}"
            + (f" (reported {doc['earnings']['session']}{': ' + reason if reason else ''})" if doc.get("earnings") else "")
        )

    written = 0
    if docs and store and not dry_run:
        written = store.set_many(docs)
    summary = {
        "universe": len(universe),
        "reporters": len(reporting),
        "fetched": len(fetched),
        "with_prints": len(with_prints),
        "changed": len(docs),
        "written": written,
        "requests": yahoo.requests,
        "failures": yahoo.failures[:5],
        "seconds": round(time.monotonic() - started, 1),
        "dry_run": dry_run,
    }
    log(f"[extended] {json.dumps(summary)}")
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Store after-hours and pre-market quotes in tm_extended_quotes.")
    parser.add_argument("--tickers", default="", help="comma-separated tickers instead of the whole universe")
    parser.add_argument("--dry-run", action="store_true", help="fetch and print, write nothing")
    parser.add_argument("--budget-seconds", type=float, default=RUN_BUDGET_S)
    parser.add_argument("--force", action="store_true", help="run on a day the NYSE is closed too")
    args = parser.parse_args(argv)
    tickers = [ticker for ticker in args.tickers.split(",") if ticker.strip()] or None
    today = ny_now().date()
    if not (args.force or tickers or nyse.trading_day(today)):
        # The timer runs on weekdays; a holiday has no session to quote around.
        print(f"[extended] {today.isoformat()} is not a trading day; nothing to do")
        return 0
    store = DocStore.from_env()
    summary = run(store, tickers=tickers, dry_run=args.dry_run, budget_s=args.budget_seconds)
    # Nothing fetched at all is a failed run (Yahoo down or refusing): the timer should show red.
    return 0 if summary["fetched"] > 0 or summary["universe"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
