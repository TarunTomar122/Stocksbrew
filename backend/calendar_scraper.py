"""Economic + earnings calendar.

Economic releases are scraped from Trading Economics' public calendar HTML.
Each row is a `<tr data-url ... data-country data-category data-event>` so the
parser is resilient to unrelated DOM churn as long as those data attrs stay.

Earnings are not scraped here — they're already captured per-instrument during
`sync_stock_metrics` under `earnings_date`. The dashboard reads those and
merges with macro events into one timeline.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.request import Request, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

_COUNTRY_TO_MARKET: dict[str, str] = {
    "united states": "US",
    "india": "IN",
    "euro area": "GLOBAL",
    "china": "GLOBAL",
    "japan": "GLOBAL",
    "united kingdom": "GLOBAL",
}


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "text/html"})
    with urlopen(request, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")


@dataclass
class EconomicEvent:
    country: str
    market: str
    category: str
    event: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM (local to the source) or empty
    importance: int  # 1..3 — we guess from CSS class counts


# Row splitting: TE rows nest an inner <table>…</table>, so a lazy `.*?</tr>`
# regex cheats and matches the inner close tag. We split on the row start
# sentinel and take everything up to the next row (or end-of-stream) instead.
_ROW_SPLIT_RE = re.compile(r'<tr\s+(?=[^>]*data-url=)([^>]+)>', re.DOTALL)
_ATTR_RE = re.compile(r'data-(\w+)=["\']([^"\']*)["\']')
_DATE_CLASS_RE = re.compile(r"class='[^']*\s(\d{4}-\d{2}-\d{2})[^']*'")
_TIME_RE = re.compile(r'class="event-\d+[^"]*">\s*([0-9:APM ]+?)\s*</span>')
_EVENT_NAME_RE = re.compile(r'data-event=[\'"]([^\'"]+)[\'"]')
_COUNTRY_RE = re.compile(r'data-country=[\'"]([^\'"]+)[\'"]')
_CATEGORY_RE = re.compile(r'data-category=[\'"]([^\'"]+)[\'"]')

# TE's public HTML doesn't expose a clean importance class, so we derive tier
# from the event name. Tier 3 = market-moving (CPI, Fed, NFP). Tier 2 =
# meaningful (PMI, Retail Sales, GDP). Tier 1 = everything else (bill auctions,
# minor surveys) — filtered out by default.
_TIER_3 = (
    "cpi", "inflation rate", "core inflation", "fed interest rate",
    "fomc", "interest rate decision", "non farm payrolls", "non-farm payrolls",
    "unemployment rate", "gdp growth", "ppi",
)
_TIER_2 = (
    "retail sales", "pmi", "industrial production", "durable goods",
    "consumer confidence", "housing starts", "trade balance",
    "initial jobless claims", "business confidence", "factory orders",
    "wpi", "repo rate",
)


def _event_tier(event: str, category: str) -> int:
    key = f"{event} {category}".lower()
    if any(kw in key for kw in _TIER_3):
        return 3
    if any(kw in key for kw in _TIER_2):
        return 2
    return 1


def parse_economic_calendar(html: str) -> list[EconomicEvent]:
    events: list[EconomicEvent] = []
    matches = list(_ROW_SPLIT_RE.finditer(html))
    for i, match in enumerate(matches):
        header = match.group(1)
        body_start = match.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(html)
        body = html[body_start:body_end]
        country = (_COUNTRY_RE.search(header) or [None, ""])[1].lower()
        category = (_CATEGORY_RE.search(header) or [None, ""])[1]
        event = (_EVENT_NAME_RE.search(header) or [None, ""])[1]
        if not event:
            continue
        date_match = _DATE_CLASS_RE.search(body)
        if not date_match:
            continue
        date = date_match.group(1)
        time_match = _TIME_RE.search(body)
        time = time_match.group(1).strip() if time_match else ""
        importance = _event_tier(event, category)
        events.append(
            EconomicEvent(
                country=country,
                market=_COUNTRY_TO_MARKET.get(country, "GLOBAL"),
                category=category,
                event=event.title(),
                date=date,
                time=time,
                importance=importance,
            )
        )
    return events


def fetch_economic_calendar() -> list[EconomicEvent]:
    html = _fetch("https://tradingeconomics.com/calendar")
    return parse_economic_calendar(html)


def window_events(
    events: list[EconomicEvent],
    days_ahead: int = 7,
    markets: set[str] | None = None,
    min_importance: int = 2,
) -> list[EconomicEvent]:
    """Drop stale rows, low-signal countries, and low-importance noise."""
    today = datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=days_ahead)
    out: list[EconomicEvent] = []
    for ev in events:
        try:
            d = datetime.strptime(ev.date, "%Y-%m-%d").date()
        except ValueError:
            continue
        if d < today or d > horizon:
            continue
        if ev.importance < min_importance:
            continue
        if markets and ev.market not in markets and "GLOBAL" not in markets:
            continue
        out.append(ev)
    # TE sometimes emits the same release twice (headline + revised line). Drop
    # exact duplicates so the strip doesn't show "Retail Sales Mom" back-to-back.
    seen: set[tuple[str, str, str, str]] = set()
    deduped: list[EconomicEvent] = []
    for ev in out:
        key = (ev.country, ev.event, ev.date, ev.time)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ev)
    deduped.sort(key=lambda e: (e.date, e.time, -e.importance))
    return deduped
