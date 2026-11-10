"""Economic releases, IPOs and ex-dividend dates for ``tm_agent_calendar``.

The app's ``/calendar`` page merges these with the earnings events in
``tm_earnings_events``. Three kinds, each from a public, keyless source:

* ``economic``: the release schedules the agencies publish themselves. BLS
  (jobs report, CPI, PPI, JOLTS, employment cost index, import prices,
  productivity), BEA (GDP, personal income and outlays, trade balance) and the
  Federal Reserve's FOMC meeting calendar. Only the schedule is stored (what
  comes out and when); no forecast and no result, because the agencies do not
  publish a consensus and we do not invent one.
* ``ipo``: Nasdaq's public IPO calendar: deals expected to price and deals
  that priced, with the price range, share count and exchange it lists.
* ``dividend``: Nasdaq's public dividend calendar: ex-dividend dates for the
  symbols we cover, with the declared amount and pay date.

Document ids are stable (release + date, deal id, ticker + ex-date), so reruns
update in place. Nothing is deleted: a release the agency moves keeps its old
row marked ``superseded`` so readers can drop it.

Run: ``python3 -m backend.agentdata.calendar_events``
"""

from __future__ import annotations

import argparse
import html
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from .feeds_common import (
    BROWSER_USER_AGENT,
    SEC_USER_AGENT,
    Fetcher,
    WriteLedger,
    iso_now,
    load_universe,
    query,
    symbol_key,
    utc_now,
    write_changed,
)
from .store import DocStore

COLLECTION = "tm_agent_calendar"
META_PATH = "tm_agent_calendar_meta/US"
_ET = ZoneInfo("America/New_York")

_BLS_ICS = "https://www.bls.gov/schedule/news_release/bls.ics"
_BEA_ICS = "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics"
_FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
_NASDAQ_IPO = "https://api.nasdaq.com/api/ipo/calendar?date={month}"
_NASDAQ_DIVIDENDS = "https://api.nasdaq.com/api/calendar/dividends?date={day}"

# (pattern on the agency's own title, short label, importance, slug)
_BLS_RELEASES: tuple[tuple[str, str, str, str], ...] = (
    (r"^Employment Situation$", "Jobs report", "high", "jobs"),
    (r"^Consumer Price Index$", "CPI inflation", "high", "cpi"),
    (r"^Producer Price Index$", "PPI inflation", "high", "ppi"),
    (r"^Job Openings and Labor Turnover Survey$", "Job openings (JOLTS)", "normal", "jolts"),
    (r"^Employment Cost Index$", "Employment cost index", "normal", "eci"),
    (r"^U\.S\. Import and Export Price Indexes$", "Import and export prices", "normal", "import-prices"),
    (r"^Productivity and Costs$", "Productivity and costs", "normal", "productivity"),
)
_BEA_RELEASES: tuple[tuple[str, str, str, str], ...] = (
    (r"^(?:Gross Domestic Product|GDP) \((?:Advance|Second|Third) Estimate\)", "GDP", "high", "gdp"),
    (r"^Personal Income and Outlays", "Personal income and spending (PCE)", "high", "pce"),
    (r"^U\.S\. International Trade in Goods and Services,", "Trade balance", "normal", "trade"),
)
_MONTHS = {
    name: index
    for index, name in enumerate(
        ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"),
        start=1,
    )
}


# -- ics ----------------------------------------------------------------------


def unfold_ics(body: str) -> list[str]:
    """RFC 5545 line unfolding: a line starting with a space continues the previous one."""
    lines: list[str] = []
    for raw in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _ics_text(value: str) -> str:
    text = value.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ").replace("\\N", " ").replace("\\\\", "\\")
    return " ".join(text.split())


def _ics_start(params: str, value: str) -> tuple[str, str | None] | None:
    """``(YYYY-MM-DD, HH:MM | None)`` in US Eastern time, or None when unreadable."""
    match = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?", value.strip())
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    try:
        if match.group(4) is None:
            return date(year, month, day).isoformat(), None
        hour, minute = int(match.group(4)), int(match.group(5))
        if match.group(7):  # UTC instant
            local = datetime(year, month, day, hour, minute, tzinfo=timezone.utc).astimezone(_ET)
        else:
            # A floating or TZID time. Both agencies publish Eastern time.
            local = datetime(year, month, day, hour, minute)
    except ValueError:
        return None
    del params  # the only TZID these feeds use is US Eastern
    return local.date().isoformat(), f"{local.hour:02d}:{local.minute:02d}"


def parse_ics(body: str) -> list[dict[str, Any]]:
    """``[{title, date, time_et}]`` for every VEVENT with a readable start."""
    events: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in unfold_ics(body):
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current and current.get("title") and current.get("date"):
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        head, value = line.split(":", 1)
        name, _, params = head.partition(";")
        if name == "SUMMARY":
            current["title"] = _ics_text(value)
        elif name == "DTSTART":
            start = _ics_start(params, value)
            if start:
                current["date"], current["time_et"] = start
    return events


_PERIOD = re.compile(
    r"((?:\d(?:st|nd|rd|th) Quarter(?: and Year)?|January|February|March|April|May|June|July|August|"
    r"September|October|November|December) \d{4})"
)
_ESTIMATE = re.compile(r"\((Advance|Second|Third) Estimate\)")


def release_period(title: str) -> str:
    """``GDP (Second Estimate) and Corporate Profits, 3rd Quarter 2026`` -> ``3rd Quarter 2026, second estimate``."""
    period = _PERIOD.search(title)
    estimate = _ESTIMATE.search(title)
    parts = [period.group(1) if period else "", f"{estimate.group(1).lower()} estimate" if estimate else ""]
    return ", ".join(part for part in parts if part)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def economic_docs(
    events: list[dict[str, Any]],
    rules: tuple[tuple[str, str, str, str], ...],
    *,
    source: str,
    source_name: str,
    source_url: str,
    now_iso: str,
) -> list[dict[str, Any]]:
    """Keep the releases that move markets and give them a short, plain label."""
    out: dict[str, dict[str, Any]] = {}
    for event in events:
        title = str(event.get("title") or "")
        for pattern, label, importance, slug in rules:
            if not re.search(pattern, title):
                continue
            doc_id = f"eco_{source}_{slug}_{event['date']}"
            period = release_period(title)
            out[doc_id] = {
                "id": doc_id,
                "kind": "economic",
                "market": "US",
                "date": event["date"],
                "time_et": event.get("time_et"),
                "title": label,
                "official_title": title,
                "period": period,
                "importance": importance,
                "series": slug,
                "source": source,
                "source_name": source_name,
                "source_url": source_url,
                "superseded": False,
                "captured_at": now_iso,
            }
            break
    return list(out.values())


# -- fomc ---------------------------------------------------------------------


def parse_fomc(body: str) -> list[dict[str, Any]]:
    """Scheduled FOMC meetings as ``{date (decision day), start_date, projections}``.

    The decision and statement come out on the last day of the meeting at 2:00 PM ET.
    Notation votes and unscheduled meetings are skipped.
    """
    out: list[dict[str, Any]] = []
    for panel in re.split(r'<div class="panel panel-default">', body)[1:]:
        year_match = re.search(r">(\d{4}) FOMC Meetings<", panel)
        if not year_match:
            continue
        year = int(year_match.group(1))
        pairs = re.findall(
            r'fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<',
            panel,
            flags=re.S,
        )
        for month_raw, days_raw in pairs:
            days_text = html.unescape(days_raw).strip()
            if "notation" in days_text.lower() or "unscheduled" in days_text.lower():
                continue
            months = [_MONTHS.get(part.strip().lower()[:9]) or _month_from_abbr(part) for part in month_raw.split("/")]
            numbers = [int(n) for n in re.findall(r"\d{1,2}", days_text)]
            if not numbers or not months or months[0] is None:
                continue
            start_month = months[0]
            end_month = months[-1] or start_month
            try:
                start = date(year, start_month, numbers[0])
                end = date(year, end_month, numbers[-1])
            except ValueError:
                continue
            out.append({"date": end.isoformat(), "start_date": start.isoformat(), "projections": "*" in days_text})
    return out


def _month_from_abbr(raw: str) -> int | None:
    key = raw.strip().lower()[:3]
    for name, index in _MONTHS.items():
        if name.startswith(key) and key:
            return index
    return None


def fomc_docs(meetings: list[dict[str, Any]], *, now_iso: str) -> list[dict[str, Any]]:
    docs = []
    for meeting in meetings:
        doc_id = f"eco_fed_fomc_{meeting['date']}"
        docs.append(
            {
                "id": doc_id,
                "kind": "economic",
                "market": "US",
                "date": meeting["date"],
                "time_et": "14:00",
                "title": "Fed rate decision (FOMC)",
                "official_title": "Federal Open Market Committee meeting",
                "period": "with economic projections" if meeting["projections"] else "",
                "importance": "high",
                "series": "fomc",
                "meeting_start": meeting["start_date"],
                "source": "federal_reserve",
                "source_name": "Federal Reserve",
                "source_url": _FOMC_URL,
                "superseded": False,
                "captured_at": now_iso,
            }
        )
    return docs


# -- nasdaq -------------------------------------------------------------------


def _us_date(raw: Any) -> str:
    """``11/12/2026`` -> ``2026-11-12``. Empty string when unreadable."""
    match = re.fullmatch(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*", str(raw or ""))
    if not match:
        return ""
    try:
        return date(int(match.group(3)), int(match.group(1)), int(match.group(2))).isoformat()
    except ValueError:
        return ""


def _number(raw: Any) -> float | None:
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return float(raw)
    cleaned = re.sub(r"[^0-9.]", "", str(raw or ""))
    if not cleaned or cleaned == ".":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def price_range(raw: Any) -> tuple[float | None, float | None]:
    """``11.00-13.00`` -> (11.0, 13.0); ``10.00`` -> (10.0, 10.0); blank -> (None, None)."""
    parts = [p for p in re.split(r"\s*-\s*", str(raw or "").strip()) if p]
    numbers = [n for n in (_number(part) for part in parts) if n is not None]
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def parse_ipo_calendar(payload: Any) -> list[dict[str, Any]]:
    """Priced and expected deals from one month of Nasdaq's IPO calendar."""
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return []
    out: list[dict[str, Any]] = []

    def rows_of(node: Any) -> list[dict[str, Any]]:
        rows = node.get("rows") if isinstance(node, dict) else None
        return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []

    upcoming = data.get("upcoming")
    for status, node, date_key in (
        ("priced", data.get("priced"), "pricedDate"),
        ("expected", upcoming.get("upcomingTable") if isinstance(upcoming, dict) else None, "expectedPriceDate"),
    ):
        for row in rows_of(node):
            day = _us_date(row.get(date_key))
            deal_id = str(row.get("dealID") or "").strip()
            company = " ".join(str(row.get("companyName") or "").split())
            if not day or not deal_id or not company:
                continue
            low, high = price_range(row.get("proposedSharePrice"))
            out.append(
                {
                    "deal_id": deal_id,
                    "status": status,
                    "date": day,
                    "ticker": str(row.get("proposedTickerSymbol") or "").strip().upper(),
                    "company": company,
                    "exchange": " ".join(str(row.get("proposedExchange") or "").split()),
                    "price_low": low,
                    "price_high": high,
                    "shares": _number(row.get("sharesOffered")),
                    "offer_amount": _number(row.get("dollarValueOfSharesOffered")),
                }
            )
    return out


def ipo_docs(deals: list[dict[str, Any]], *, now_iso: str) -> list[dict[str, Any]]:
    docs: dict[str, dict[str, Any]] = {}
    for deal in deals:
        doc_id = f"ipo_{_slug(deal['deal_id'])}"
        existing = docs.get(doc_id)
        # The same deal can sit in two months' responses; a priced row beats an expected one.
        if existing and existing["status"] == "priced" and deal["status"] != "priced":
            continue
        docs[doc_id] = {
            "id": doc_id,
            "kind": "ipo",
            "market": "US",
            "date": deal["date"],
            "time_et": None,
            "title": deal["company"],
            "ticker": deal["ticker"] or None,
            "company": deal["company"],
            "status": deal["status"],
            "exchange": deal["exchange"],
            "price_low": deal["price_low"],
            "price_high": deal["price_high"],
            "shares": deal["shares"],
            "offer_amount": deal["offer_amount"],
            "source": "nasdaq_ipo",
            "source_name": "Nasdaq IPO calendar",
            "source_url": "https://www.nasdaq.com/market-activity/ipos",
            "superseded": False,
            "captured_at": now_iso,
        }
    return list(docs.values())


def parse_dividend_day(payload: Any) -> list[dict[str, Any]] | None:
    """Ex-dividend rows for one day, or None when the response has no table."""
    data = payload.get("data") if isinstance(payload, dict) else None
    calendar = data.get("calendar") if isinstance(data, dict) else None
    if not isinstance(calendar, dict) or "rows" not in calendar:
        return None
    rows = calendar.get("rows")
    if rows is None:
        return []
    if not isinstance(rows, list):
        return None
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        ex_date = _us_date(row.get("dividend_Ex_Date"))
        amount = _number(row.get("dividend_Rate"))
        if not symbol or not ex_date or amount is None or amount <= 0:
            continue
        out.append(
            {
                "symbol": symbol,
                "company": " ".join(str(row.get("companyName") or "").split()),
                "ex_date": ex_date,
                "payment_date": _us_date(row.get("payment_Date")),
                "record_date": _us_date(row.get("record_Date")),
                "announced": _us_date(row.get("announcement_Date")),
                "amount": amount,
                "annual_amount": _number(row.get("indicated_Annual_Dividend")),
            }
        )
    return out


def dividend_doc(row: dict[str, Any], *, ticker: str, name: str, now_iso: str) -> dict[str, Any]:
    doc_id = f"div_{symbol_key(ticker)}_{row['ex_date']}"
    return {
        "id": doc_id,
        "kind": "dividend",
        "market": "US",
        "date": row["ex_date"],
        "time_et": None,
        "title": name or row["company"] or ticker,
        "ticker": ticker,
        "company": name or row["company"] or ticker,
        "amount": row["amount"],
        "annual_amount": row["annual_amount"],
        "payment_date": row["payment_date"] or None,
        "record_date": row["record_date"] or None,
        "announced": row["announced"] or None,
        "source": "nasdaq_dividends",
        "source_name": "Nasdaq dividend calendar",
        "source_url": "https://www.nasdaq.com/market-activity/dividends",
        "superseded": False,
        "captured_at": now_iso,
    }


# -- run ----------------------------------------------------------------------


def _months_between(start: date, end: date) -> list[str]:
    out: list[str] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        out.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return out


def run(
    *,
    weeks_back: int = 6,
    weeks_ahead: int = 10,
    dividend_weeks_back: int = 2,
    dividend_weeks_ahead: int = 6,
    skip_dividends: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    store = DocStore.from_env()
    now_iso = iso_now()
    today = utc_now().astimezone(_ET).date()
    start = today - timedelta(weeks=weeks_back)
    end = today + timedelta(weeks=weeks_ahead)
    in_window = lambda doc: start.isoformat() <= doc["date"] <= end.isoformat()  # noqa: E731

    official = Fetcher("calendar_official", user_agent=SEC_USER_AGENT, min_interval=0.5, ttl=6 * 3600, timeout=30)
    browser = Fetcher("calendar_fed", user_agent=BROWSER_USER_AGENT, min_interval=0.5, ttl=6 * 3600, timeout=30)
    nasdaq = Fetcher(
        "nasdaq_calendar",
        user_agent=BROWSER_USER_AGENT,
        min_interval=0.6,
        ttl=3 * 3600,
        headers={
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )

    docs: list[dict[str, Any]] = []
    failed: list[str] = []
    counts = {"economic": 0, "ipo": 0, "dividend": 0}
    # Kinds whose source answered in full this run: only those may retire a stale row.
    complete: set[str] = set()

    economic: list[dict[str, Any]] = []
    economic_ok = True
    bls = official.get(_BLS_ICS)
    if bls:
        economic += economic_docs(
            parse_ics(bls),
            _BLS_RELEASES,
            source="bls",
            source_name="Bureau of Labor Statistics",
            source_url="https://www.bls.gov/schedule/news_release/",
            now_iso=now_iso,
        )
    else:
        failed.append("bls")
        economic_ok = False
    bea = browser.get(_BEA_ICS)
    if bea:
        economic += economic_docs(
            parse_ics(bea),
            _BEA_RELEASES,
            source="bea",
            source_name="Bureau of Economic Analysis",
            source_url="https://www.bea.gov/news/schedule",
            now_iso=now_iso,
        )
    else:
        failed.append("bea")
        economic_ok = False
    fomc = browser.get(_FOMC_URL)
    meetings = parse_fomc(fomc) if fomc else []
    if meetings:
        economic += fomc_docs(meetings, now_iso=now_iso)
    else:
        failed.append("fomc")
        economic_ok = False
    economic = [doc for doc in economic if in_window(doc)]
    counts["economic"] = len(economic)
    docs += economic
    if economic_ok:
        complete.add("economic")

    deals: list[dict[str, Any]] = []
    ipo_ok = True
    for month in _months_between(start, end):
        payload = nasdaq.get_json(_NASDAQ_IPO.format(month=month))
        if payload is None:
            failed.append(f"ipo {month}")
            ipo_ok = False
            continue
        deals += parse_ipo_calendar(payload)
    ipos = [doc for doc in ipo_docs(deals, now_iso=now_iso) if in_window(doc)]
    counts["ipo"] = len(ipos)
    docs += ipos
    if ipo_ok:
        complete.add("ipo")

    dividend_days = 0
    if not skip_dividends:
        universe = {symbol_key(item.ticker): item for item in load_universe(store)}
        day = today - timedelta(weeks=dividend_weeks_back)
        last = today + timedelta(weeks=dividend_weeks_ahead)
        dividends: dict[str, dict[str, Any]] = {}
        while day <= last:
            iso = day.isoformat()
            weekday = day.weekday()
            day += timedelta(days=1)
            if weekday >= 5:
                continue
            rows = parse_dividend_day(nasdaq.get_json(_NASDAQ_DIVIDENDS.format(day=iso)))
            if rows is None:
                failed.append(f"dividends {iso}")
                continue
            dividend_days += 1
            for row in rows:
                instrument = universe.get(symbol_key(row["symbol"]))
                if not instrument:
                    continue
                doc = dividend_doc(row, ticker=instrument.ticker, name=instrument.name, now_iso=now_iso)
                dividends[doc["id"]] = doc
        counts["dividend"] = len(dividends)
        docs += list(dividends.values())
        # Dividends are read over a shorter window than the rest, so they never retire rows.

    # A row we wrote earlier that its (fully read) source no longer lists was moved or pulled.
    current_ids = {doc["id"] for doc in docs}
    superseded: list[tuple[str, dict[str, Any]]] = []
    if complete:
        for path, data in query(
            store,
            COLLECTION,
            filters=[("date", ">=", today.isoformat()), ("date", "<=", end.isoformat())],
            limit=10000,
        ):
            doc_id = path.split("/", 1)[1]
            if data.get("kind") in complete and doc_id not in current_ids and not data.get("superseded"):
                superseded.append((path, {"superseded": True, "superseded_at": now_iso}))

    writes = [(f"{COLLECTION}/{doc['id']}", doc) for doc in docs]
    written = 0
    if not dry_run and writes:
        written = write_changed(store, WriteLedger("calendar_events"), writes, merge=True)
        if superseded:
            store.set_many(superseded, merge=True)
        store.set(
            META_PATH,
            {
                "market": "US",
                "updated_at": now_iso,
                "window": f"{start.isoformat()}..{end.isoformat()}",
                "counts": counts,
                "failed": failed,
                "sources": {
                    "economic": "BLS, BEA and Federal Reserve release schedules",
                    "ipo": "Nasdaq IPO calendar",
                    "dividend": "Nasdaq dividend calendar, covered symbols only",
                },
            },
            merge=True,
        )
    return {
        **counts,
        "window": f"{start.isoformat()}..{end.isoformat()}",
        "dividend_days_read": dividend_days,
        "superseded": len(superseded),
        "written": written,
        "failed": failed,
        "request_failures": (official.failures + browser.failures + nasdaq.failures)[:10],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--weeks-back", type=int, default=6)
    parser.add_argument("--weeks-ahead", type=int, default=10)
    parser.add_argument("--skip-dividends", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    stats = run(
        weeks_back=args.weeks_back,
        weeks_ahead=args.weeks_ahead,
        skip_dividends=args.skip_dividends,
        dry_run=args.dry_run,
    )
    print(f"[calendar_events] {stats}", flush=True)


if __name__ == "__main__":
    main()
