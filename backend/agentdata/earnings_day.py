"""Earnings day reports: what a company reported, minutes after it files.

For each covered stock with an earnings date today (``tm_earnings_events``),
this job polls SEC EDGAR for the 8-K that carries the earnings release (Item
2.02, usually exhibit 99.1), reads the numbers out of it by rules
(``earnings_day_extract.py``), puts them next to what analysts expected and
how the stock reacted, and stores one report per stock per earnings date::

    tm_earnings_day/{TICKER}__{YYYY-MM-DD}
      ticker, company, event_date, market, period {label, quarter, year},
      status: "complete" | "partial"        complete = release read and a verdict on EPS or revenue
      session: "bmo" | "amc" | "during"     from the 8-K's acceptance time (New York)
      filing {form, accession, filed_at, url (the exhibit), index_url, exhibit}
      eps {estimate, actual, surprise, surprise_pct, verdict, estimate_source, actual_source, source_url,
           gaap {value, prior, quote}, adjusted {value, prior, quote}}
      revenue {value, prior, yoy_pct, estimate: null, quote, method}
      guidance {change, items [{metric, label, period, low, high, prev_low, prev_high, direction, quote}], headline_quote}
      quotes [{text, speaker, why}]          verbatim from the release
      reaction {status, pct, basis, from_close, from_date, price, price_at, final, typical_abs_pct, typical_n}
      read {title, headline, lead, insights [{id, tone, text, so_what}], watch [...]}
      sources [{label, url}], llm {used, model, rejected}, inputs_hash, generated_at, job_version

Where each number comes from:

* EPS against expectations: the estimate and the actual from Nasdaq's earnings
  calendar (one provider, one basis). Company-reported GAAP and adjusted EPS are
  shown beside it, never compared with an estimate made on another basis.
* Revenue, guidance, quotes: the release on EDGAR. No revenue estimate is stored
  anywhere yet, so revenue is compared with the same quarter a year earlier.
* Reaction: Yahoo Finance prices; the usual move is the median absolute move on
  the last eight earnings releases this company filed on EDGAR.

A language model only words things: a two-sentence lead and why each picked
quote matters. Every number it writes must already be in the facts; one that is
not throws the model's text away and the rule-written text is kept.

Safe to rerun: a report is rebuilt only when its inputs change (``inputs_hash``),
a settled report (release read, actual posted, reaction final) costs no request,
and writes replace one document by id. Nothing is deleted.

Run::

    python3 -m backend.agentdata.earnings_day --dry-run                      # today, print, write nothing
    python3 -m backend.agentdata.earnings_day --days 3 --tickers TTWO,QLYS --dry-run
    python3 -m backend.agentdata.earnings_day --local-dir backend/.cache/earnings_day_dev   # write JSON files only

Off unless ``EARNINGS_DAY_ENABLED=1`` (or ``--force``), so pulling this code
onto the server changes nothing until it is switched on.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from bisect import bisect_left
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Protocol
from zoneinfo import ZoneInfo

from . import earnings_day_extract as extract
from .earnings_calendar import parse_calendar_day
from .feeds_common import BROWSER_USER_AGENT, SEC_USER_AGENT, Fetcher, iso_now, load_universe, query, symbol_key, utc_now
from .store import DocStore

COLLECTION = "tm_earnings_day"
EVENTS = "tm_earnings_events"
JOB_VERSION = 1
NY = ZoneInfo("America/New_York")
_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
_NASDAQ_DAY = "https://api.nasdaq.com/api/calendar/earnings?date={day}"
_YAHOO_INTRADAY = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=5m&range=5d&includePrePost=true"
TYPICAL_REPORTS = 8
# Beat and miss use the same thresholds as the calendar (earnings_calendar.surprise_label).
BEAT_PCT = 1.0


# -- dates and sessions --------------------------------------------------------


def ny_now(now: datetime | None = None) -> datetime:
    return (now or utc_now()).astimezone(NY)


def session_of(accepted_iso: str) -> tuple[str, str]:
    """(session, New York day) of an EDGAR acceptance time: before 9:30 is bmo, 16:00 or later is amc."""
    stamp = datetime.fromisoformat(accepted_iso.replace("Z", "+00:00")).astimezone(NY)
    minutes = stamp.hour * 60 + stamp.minute
    session = "bmo" if minutes < 9 * 60 + 30 else "amc" if minutes >= 16 * 60 else "during"
    return session, stamp.date().isoformat()


# -- EDGAR -------------------------------------------------------------------


def earnings_filings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Every 8-K with Item 2.02 in a submissions payload, newest first."""
    recent = ((payload or {}).get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    out = []

    def col(name: str, index: int) -> str:
        values = recent.get(name) or []
        return str(values[index]) if index < len(values) and values[index] is not None else ""

    for index, form in enumerate(forms):
        if str(form).strip().upper() not in {"8-K", "8-K/A"}:
            continue
        items = col("items", index)
        if "2.02" not in items:
            continue
        accession = col("accessionNumber", index)
        filing_date = col("filingDate", index)
        if not accession or not filing_date:
            continue
        accepted = col("acceptanceDateTime", index)
        try:
            accepted_iso = datetime.fromisoformat(accepted.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat() if accepted else f"{filing_date}T12:00:00+00:00"
        except ValueError:
            accepted_iso = f"{filing_date}T12:00:00+00:00"
        out.append(
            {
                "form": str(form).strip().upper(),
                "accession": accession,
                "filing_date": filing_date,
                "accepted": accepted_iso,
                "primary": col("primaryDocument", index),
                "items": [code for code in re.findall(r"\d\.\d{2}", items)],
            }
        )
    out.sort(key=lambda row: row["accepted"], reverse=True)
    return out


def pick_release(filings: list[dict[str, Any]], event_date: str) -> dict[str, Any] | None:
    """The earnings 8-K for a calendar date: filed from the day before to four days after, original before amendment."""
    day = date.fromisoformat(event_date)
    lo, hi = (day - timedelta(days=1)).isoformat(), (day + timedelta(days=4)).isoformat()
    window = [row for row in filings if lo <= row["filing_date"] <= hi]
    if not window:
        return None
    window.sort(key=lambda row: (row["form"] != "8-K", abs((date.fromisoformat(row["filing_date"]) - day).days), row["accepted"]))
    return window[0]


def filing_urls(cik: int, row: dict[str, Any]) -> dict[str, str]:
    compact = row["accession"].replace("-", "")
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{compact}"
    return {"index_url": f"{base}/{row['accession']}-index.htm", "primary_url": f"{base}/{row['primary']}" if row.get("primary") else ""}


_INDEX_ROW = re.compile(
    r'<tr[^>]*>.*?href="(?P<href>/Archives/edgar/data/[^"]+)"[^>]*>[^<]*</a>\s*</td>\s*<td[^>]*>(?P<type>[^<]*)</td>',
    re.IGNORECASE | re.DOTALL,
)


def parse_index(html: str) -> list[dict[str, str]]:
    """(url, type) of each document in an EDGAR filing index page."""
    out = []
    for match in _INDEX_ROW.finditer(html or ""):
        doc_type = " ".join(match.group("type").split()).upper()
        out.append({"url": f"https://www.sec.gov{match.group('href')}", "type": doc_type})
    return out


def release_document(documents: list[dict[str, str]]) -> dict[str, str] | None:
    """The press release: exhibit 99.1 first, then any 99 exhibit."""
    for wanted in ("EX-99.1", "EX-99.01", "EX-99"):
        for document in documents:
            if document["type"] == wanted and document["url"].lower().endswith((".htm", ".html", ".txt")):
                return document
    for document in documents:
        if document["type"].startswith("EX-99") and document["url"].lower().endswith((".htm", ".html", ".txt")):
            return document
    return None


# -- prices ------------------------------------------------------------------


def parse_intraday(payload: Any) -> list[tuple[datetime, float]]:
    """(New York time, price) bars from Yahoo's chart API, pre and post market included."""
    try:
        result = payload["chart"]["result"][0]
        stamps = result.get("timestamp") or []
        closes = ((result.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    except (KeyError, IndexError, TypeError):
        return []
    out = []
    for stamp, price in zip(stamps, closes):
        if isinstance(price, (int, float)) and price > 0:
            out.append((datetime.fromtimestamp(int(stamp), tz=timezone.utc).astimezone(NY), float(price)))
    return out


def _prev_index(dates: list[str], day: str) -> int:
    """Index of the last session strictly before ``day`` (-1 when none)."""
    return bisect_left(dates, day) - 1


def window_move(dates: list[str], closes: list[float], session: str, day: str) -> dict[str, Any] | None:
    """The close-to-close move a report caused, once the closing price that ends it exists.

    Before the open or during the session: the close before the report day to
    the report day's close. After the close: the report day's close to the next
    session's close.
    """
    if session == "amc":
        at = bisect_left(dates, day)
        if at >= len(dates) or dates[at] != day or at + 1 >= len(dates):
            return None
        start, end = at, at + 1
        basis = "next_session"
    else:
        at = bisect_left(dates, day)
        if at >= len(dates) or dates[at] != day or at == 0:
            return None
        start, end = at - 1, at
        basis = "report_day"
    before, after = closes[start], closes[end]
    if not before or before <= 0 or not after:
        return None
    return {"pct": round((after / before - 1) * 100, 2), "basis": basis, "from_date": dates[start], "from_close": round(before, 4), "to_date": dates[end], "price": round(after, 4), "final": True}


def live_move(
    dates: list[str],
    closes: list[float],
    bars: list[tuple[datetime, float]],
    session: str,
    day: str,
    accepted_ny: datetime,
) -> dict[str, Any] | None:
    """A move still in progress: after hours, before the next open, or so far in the session."""
    if session == "amc":
        at = bisect_left(dates, day)
        if at >= len(dates) or dates[at] != day:
            return None
        base_date, base = dates[at], closes[at]
    else:
        prev = _prev_index(dates, day)
        if prev < 0:
            return None
        base_date, base = dates[prev], closes[prev]
    after = [(when, price) for when, price in bars if when >= accepted_ny]
    if not after or not base:
        return None
    when, price = after[-1]
    minutes = when.hour * 60 + when.minute
    when_day = when.date().isoformat()
    if when_day == day and session == "amc":
        basis = "after_hours"
    elif minutes < 9 * 60 + 30:
        basis = "premarket"
    elif minutes >= 16 * 60:
        basis = "after_hours"
    else:
        basis = "so_far_today"
    return {"pct": round((price / base - 1) * 100, 2), "basis": basis, "from_date": base_date, "from_close": round(base, 4), "price": round(price, 4), "price_at": when.isoformat(), "final": False}


def past_moves(dates: list[str], closes: list[float], filings: list[dict[str, Any]], *, exclude: str, limit: int = TYPICAL_REPORTS) -> list[dict[str, Any]]:
    """How the stock moved on the company's earlier earnings releases, newest first."""
    out = []
    seen_days: set[str] = set()
    for row in filings:
        if row["accession"] == exclude or row["form"] != "8-K":
            continue
        session, day = session_of(row["accepted"])
        if day in seen_days:
            continue
        seen_days.add(day)
        moved = window_move(dates, closes, session, day)
        if moved:
            out.append({"day": day, "session": session, "pct": moved["pct"]})
        if len(out) >= limit:
            break
    return out


# -- expectations ------------------------------------------------------------


def eps_verdict(estimate: float | None, actual: float | None) -> dict[str, Any]:
    """Beat, miss or in line, with the surprise in dollars and (when the estimate is big enough to mean it) percent."""
    if estimate is None or actual is None:
        return {"verdict": "pending" if estimate is not None else "no_estimate", "surprise": None, "surprise_pct": None}
    surprise = round(actual - estimate, 4)
    pct = round(surprise / abs(estimate) * 100, 1) if abs(estimate) >= 0.10 else None
    if pct is not None:
        verdict = "beat" if pct >= BEAT_PCT else "miss" if pct <= -BEAT_PCT else "in_line"
    else:
        verdict = "beat" if surprise >= 0.01 else "miss" if surprise <= -0.01 else "in_line"
    return {"verdict": verdict, "surprise": surprise, "surprise_pct": pct}


def yoy_pct(value: float | None, prior: float | None) -> float | None:
    if value is None or prior is None or prior <= 0:
        return None
    return round((value / prior - 1) * 100, 1)


# Yahoo's quarter estimate counts as this quarter's only when its year-ago revenue is the release's own, within this.
REVENUE_ESTIMATE_MATCH = 0.02


def revenue_estimate(revenue: dict[str, Any] | None, fetched: dict[str, Any] | None, kept: dict[str, Any] | None, *, now_iso: str) -> dict[str, Any] | None:
    """The analysts' revenue estimate for the quarter just reported, or None.

    Yahoo's current-quarter estimate (``0q``) rolls to the next quarter some hours after a report, so it is taken
    only when its year-ago revenue is the release's own prior-year figure: then both are the same quarter. Once taken
    it is kept (``kept``, from the stored report), because a later read may already be the next quarter's.
    """
    if not revenue or not revenue.get("value"):
        return None
    if kept and isinstance(kept.get("value"), (int, float)) and kept["value"] > 0:
        return kept
    prior = revenue.get("prior")
    if not fetched or not isinstance(prior, (int, float)) or prior <= 0:
        return None
    avg, year_ago = fetched.get("avg"), fetched.get("year_ago")
    if not all(isinstance(value, (int, float)) and value == value and value > 0 for value in (avg, year_ago)):
        return None
    if abs(year_ago / prior - 1) > REVENUE_ESTIMATE_MATCH:
        return None
    analysts = fetched.get("analysts")
    return {
        "value": round(float(avg)),
        "analysts": int(analysts) if isinstance(analysts, (int, float)) and analysts == analysts and analysts > 0 else None,
        "year_ago": round(float(year_ago)),
        "source": "Yahoo Finance",
        "captured_at": now_iso,
    }


def revenue_verdict(value: float | None, estimate: dict[str, Any] | None) -> dict[str, Any]:
    """Beat, miss or in line on revenue, with the same thresholds as EPS, judged on the unrounded surprise."""
    expected = (estimate or {}).get("value")
    if not isinstance(value, (int, float)) or not isinstance(expected, (int, float)) or expected <= 0:
        return {"verdict": None, "surprise_pct": None}
    pct = (value / expected - 1) * 100
    verdict = "beat" if pct >= BEAT_PCT else "miss" if pct <= -BEAT_PCT else "in_line"
    return {"verdict": verdict, "surprise_pct": round(pct, 2)}


_PROVIDERS = {"nasdaq_calendar": "Nasdaq earnings calendar", "yfinance": "Yahoo Finance", "alphavantage": "Alpha Vantage"}


def expectations(event: dict[str, Any], nasdaq_rows: list[dict[str, Any]] | None) -> tuple[float | None, float | None, str]:
    """(estimate, actual, provider): both sides from one provider, so they share a basis.

    Nasdaq's live calendar first (it posts the actual within hours), then a pair
    another job already stored on the event (same provider for both), then the
    estimate alone, captured before the report.
    """
    ticker = str(event.get("ticker") or "")
    nasdaq = next((row for row in nasdaq_rows or [] if symbol_key(row["symbol"]) == symbol_key(ticker)), None)
    if nasdaq and nasdaq.get("reported_eps") is not None and nasdaq.get("eps_estimate") is not None:
        return nasdaq["eps_estimate"], nasdaq["reported_eps"], _PROVIDERS["nasdaq_calendar"]
    source = str(event.get("actuals_source") or "")
    if event.get("reported_eps") is not None and source in _PROVIDERS:
        paired = event.get("estimated_eps") if source != "nasdaq_calendar" else event.get("eps_estimate")
        if paired is None and source == "nasdaq_calendar":
            paired = event.get("estimated_eps")
        if paired is not None:
            return float(paired), float(event["reported_eps"]), _PROVIDERS[source]
    estimate = event.get("eps_estimate")
    if estimate is None and nasdaq:
        estimate = nasdaq.get("eps_estimate")
    return (float(estimate) if estimate is not None else None), None, _PROVIDERS["nasdaq_calendar"]


# -- the read ----------------------------------------------------------------


def _pct(value: float, digits: int = 1) -> str:
    text = f"{abs(value):.{digits}f}".rstrip("0").rstrip(".") if digits else f"{abs(value):.0f}"
    return f"{text}%"


def _range(item: dict[str, Any]) -> str:
    fmt = extract.fmt_eps if item.get("unit") == "usd_per_share" else extract.fmt_money
    low, high = item.get("low"), item.get("high")
    if low is None or high is None:
        return ""
    if abs(low - high) < 1e-9:
        return fmt(low)
    if item.get("unit") != "usd_per_share":
        # "$736.9 million to $738.9 million" reads better as "$736.9 to $738.9 million".
        a, b = fmt(low), fmt(high)
        unit_a, unit_b = a.split(" ")[-1], b.split(" ")[-1]
        if unit_a == unit_b and unit_a in {"million", "billion"}:
            return f"{a.rsplit(' ', 1)[0]} to {b}"
        return f"{a} to {b}"
    return f"{fmt(low)} to {fmt(high)}"


_CHANGE_WORDS = {
    "raised": "raised",
    "lowered": "cut",
    "narrowed": "narrowed",
    "reaffirmed": "reaffirmed",
    "issued": "gave",
    "new": "gave",
}


def metric_words(label: str) -> str:
    """"Adjusted EBITDA" -> "adjusted EBITDA", "Net bookings" -> "net bookings": lower case, acronyms kept."""
    return " ".join(word if word.isupper() and len(word) > 1 else word.lower() for word in label.split())


def guidance_lead_item(guidance: dict[str, Any]) -> dict[str, Any] | None:
    """The outlook item worth a sentence: the one that moved most, revenue before EPS, full year before quarter."""
    items = guidance.get("items") or []
    if not items:
        return None
    rank = {"lowered": 0, "raised": 1, "narrowed": 2, "reaffirmed": 3, "new": 4, "issued": 4}
    metric_rank = {"revenue": 0, "net_bookings": 1, "adjusted_eps": 2, "eps": 3, "adjusted_ebitda": 4}
    return sorted(
        items,
        key=lambda item: (
            rank.get(item.get("direction"), 5),
            metric_rank.get(item.get("metric"), 9),
            0 if re.search(r"full year|fiscal", str(item.get("period")), re.I) else 1,
        ),
    )[0]


def guidance_sentence(guidance: dict[str, Any], name: str) -> str | None:
    item = guidance_lead_item(guidance)
    change = guidance.get("change") or "none"
    if item is None:
        if change in {"raised", "lowered", "reaffirmed", "narrowed"} and guidance.get("headline_quote"):
            return f"{name} {_CHANGE_WORDS.get(change, change)} its outlook: “{guidance['headline_quote']}”"
        return None
    period = item.get("period") or "the period ahead"
    period_words = period.replace("Full year", "full-year").replace("Fiscal", "fiscal")
    rng = _range(item)
    label = metric_words(item["label"])
    direction = item.get("direction") or "issued"
    previous = ""
    if item.get("prev_low") is not None and item.get("prev_high") is not None:
        previous = f", from {_range({'low': item['prev_low'], 'high': item['prev_high'], 'unit': item.get('unit')})}"
    if direction in {"raised", "lowered", "narrowed", "reaffirmed"}:
        verb = {"raised": "raised", "lowered": "cut", "narrowed": "narrowed", "reaffirmed": "reaffirmed"}[direction]
        if direction == "reaffirmed":
            return f"{name} reaffirmed its {period_words} {label} outlook of {rng}."
        return f"{name} {verb} its {period_words} {label} outlook to {rng}{previous}."
    return f"{name} expects {period_words} {label} of {rng}."


def reaction_sentence(reaction: dict[str, Any] | None, *, ticker: str) -> str | None:
    if not reaction or reaction.get("pct") is None:
        return None
    pct = reaction["pct"]
    verb = "rose" if pct > 0 else "fell" if pct < 0 else "was flat"
    amount = f" {_pct(pct)}" if pct else ""
    when = {
        "next_session": "in the next session",
        "report_day": "on the day of the report",
        "after_hours": "after hours",
        "premarket": "before the open",
        "so_far_today": "so far today",
    }.get(reaction.get("basis"), "")
    text = f"The stock {verb}{amount} {when}".rstrip() + "."
    typical = reaction.get("typical_abs_pct")
    if typical:
        size = abs(pct)
        if size >= typical * 1.5:
            compare = f"bigger than its usual {_pct(typical)} move on earnings"
        elif size <= typical * 0.5:
            compare = f"smaller than its usual {_pct(typical)} move on earnings"
        else:
            compare = f"about its usual {_pct(typical)} move on earnings"
        text = text[:-1] + f", {compare}."
    return text


def build_read(report: dict[str, Any], *, name: str, next_report: str | None = None) -> dict[str, Any]:
    """Headline, insights and what to watch, all from rules over the stored figures."""
    ticker = report["ticker"]
    eps = report.get("eps") or {}
    revenue = report.get("revenue") or {}
    guidance = report.get("guidance") or {}
    reaction = report.get("reaction") or {}
    period = (report.get("period") or {}).get("label") or ""
    insights: list[dict[str, Any]] = []

    verdict = eps.get("verdict")
    estimate, actual = eps.get("estimate"), eps.get("actual")
    own = []
    for kind, word in (("gaap", "GAAP"), ("adjusted", "adjusted")):
        value = (eps.get(kind) or {}).get("value")
        if value is None:
            continue
        own.append(f"a {word} loss of {extract.fmt_eps(abs(value))} a share" if value < 0 else f"{word} EPS of {extract.fmt_eps(value)}")
    own_text = " and ".join(own)
    if verdict in {"beat", "miss", "in_line"}:
        size = f"{_pct(eps['surprise_pct'])} " if eps.get("surprise_pct") is not None else ""
        word = {"beat": f"a {size}beat", "miss": f"a {size}miss", "in_line": "in line"}[verdict].replace("  ", " ")
        text = f"Earned {extract.fmt_eps(actual)} a share against the {extract.fmt_eps(estimate)} analysts expected, {word}."
        so_what = f"The release itself shows {own_text}; analysts count EPS on their own adjusted basis." if own_text and all(
            abs((eps.get(kind) or {}).get("value", actual) - actual) > 0.005 for kind in ("gaap", "adjusted") if (eps.get(kind) or {}).get("value") is not None
        ) else None
        insights.append({"id": f"eps-{ticker}", "tone": "up" if verdict == "beat" else "down" if verdict == "miss" else "flat", "text": text, "so_what": so_what})
    elif verdict == "pending":
        text = f"Analysts expected {extract.fmt_eps(estimate)} a share. Their comparable figure is not posted yet."
        insights.append({"id": f"eps-{ticker}", "tone": "flat", "text": text, "so_what": f"The release shows {own_text}." if own_text else None})
    elif own_text:
        insights.append({"id": f"eps-{ticker}", "tone": "flat", "text": f"Reported {own_text}. We have no analyst estimate for this quarter.", "so_what": None})

    if revenue.get("value") is not None:
        change = revenue.get("yoy_pct")
        if change is not None and revenue.get("prior"):
            direction = "up" if change > 0 else "down" if change < 0 else "flat"
            text = f"Revenue was {extract.fmt_money(revenue['value'])}, {direction} {_pct(change)} from {extract.fmt_money(revenue['prior'])} a year earlier." if change else f"Revenue was {extract.fmt_money(revenue['value'])}, level with a year earlier."
            tone = "up" if change > 0 else "down" if change < 0 else "flat"
        else:
            text = f"Revenue was {extract.fmt_money(revenue['value'])}."
            tone = "flat"
        insights.append({"id": f"revenue-{ticker}", "tone": tone, "text": text, "so_what": "We do not have an analyst revenue estimate for this quarter."})

    short = name
    guide = guidance_sentence(guidance, short)
    if guide:
        change = guidance.get("change")
        tone = "up" if change == "raised" else "down" if change in {"lowered", "mixed"} else "flat"
        insights.append({"id": f"guidance-{ticker}", "tone": tone, "text": guide, "so_what": None})
    elif report.get("filing"):
        insights.append({"id": f"guidance-{ticker}", "tone": "flat", "text": "The release gives no outlook we could read.", "so_what": None})

    moved = reaction_sentence(reaction, ticker=ticker)
    if moved:
        tone = "up" if reaction["pct"] > 0 else "down" if reaction["pct"] < 0 else "flat"
        insights.append({"id": f"reaction-{ticker}", "tone": tone, "text": moved, "so_what": None})

    # Title parts, most decisive first.
    parts = []
    if verdict == "beat":
        parts.append("Beat on EPS")
    elif verdict == "miss":
        parts.append("Missed on EPS")
    elif verdict == "in_line":
        parts.append("EPS In Line")
    change = revenue.get("yoy_pct")
    if change is not None:
        parts.append(f"Revenue {'Up' if change >= 0 else 'Down'} {_pct(change, 0)}")
    guidance_title = {"raised": "Guidance Raised", "lowered": "Guidance Cut", "mixed": "Guidance Mixed", "reaffirmed": "Guidance Reaffirmed", "narrowed": "Guidance Narrowed"}.get(guidance.get("change") or "")
    if guidance_title:
        parts.append(guidance_title)
    title = f"{name} {period} Earnings: {', '.join(parts)}" if parts else f"{name} {period} Earnings Results"
    title = " ".join(title.split())

    headline_bits = []
    if verdict in {"beat", "miss"}:
        headline_bits.append(f"{'beat' if verdict == 'beat' else 'missed'} on EPS")
    elif verdict == "in_line":
        headline_bits.append("matched EPS estimates")
    if guidance.get("change") in {"raised", "lowered", "mixed"}:
        headline_bits.append({"raised": "raised its outlook", "lowered": "cut its outlook", "mixed": "moved its outlook both ways"}[guidance["change"]])
    elif change is not None:
        headline_bits.append(f"grew revenue {_pct(change, 0)}" if change > 0 else f"saw revenue fall {_pct(change, 0)}")
    if reaction.get("pct") is not None and abs(reaction["pct"]) >= 0.1:
        headline_bits.append(f"the stock {'rose' if reaction['pct'] > 0 else 'fell'} {_pct(reaction['pct'])}")
    if headline_bits:
        joined = headline_bits[0] if len(headline_bits) == 1 else ", ".join(headline_bits[:-1]) + " and " + headline_bits[-1]
        headline = f"{name} {joined}."
    else:
        headline = f"{name} reported {period} results.".replace("  ", " ")

    watch = []
    quarter_item = next(
        (item for item in guidance.get("items") or [] if item.get("metric") in {"revenue", "net_bookings"} and re.match(r"Q[1-4]", str(item.get("period")))),
        None,
    )
    target = quarter_item or guidance_lead_item(guidance)
    if target and target.get("period"):
        period_words = str(target["period"]).replace("Full year", "full-year").replace("Fiscal", "fiscal")
        watch.append(f"Whether {name} hits its {period_words} {metric_words(target['label'])} range of {_range(target)}.")
    if verdict == "pending":
        watch.append("The analysts' comparable EPS figure; this report updates when it is posted.")
    if reaction and reaction.get("final") is False:
        watch.append("Where the stock closes in the next full session; the move above is not final.")
    if next_report:
        watch.append(f"The next report, on the calendar for {next_report}.")

    return {"title": title, "headline": headline, "lead": " ".join(item["text"] for item in insights[:2]), "insights": insights, "watch": watch[:4]}


# -- the model's part --------------------------------------------------------

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _norm_number(token: str) -> str:
    text = token.replace(",", "")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def allowed_numbers(report: dict[str, Any], quotes: list[dict[str, Any]]) -> set[str]:
    """Every number the facts contain, in the forms a sentence might write it."""
    found: set[str] = set()

    def add_value(value: Any) -> None:
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return
        amount = abs(float(value))
        for digits in (0, 1, 2):
            found.add(_norm_number(f"{amount:.{digits}f}"))
        if amount >= 1e6:
            for digits in (0, 1, 2):
                found.add(_norm_number(f"{amount / 1e6:.{digits}f}"))
        if amount >= 1e9:
            for digits in (0, 1, 2):
                found.add(_norm_number(f"{amount / 1e9:.{digits}f}"))

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in {"quote", "text_quote", "prior_quote", "headline_quote", "url", "index_url"}:
                    if isinstance(value, str):
                        found.update(_norm_number(token) for token in _NUMBER.findall(value))
                    continue
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, str):
            found.update(_norm_number(token) for token in _NUMBER.findall(node))
        else:
            add_value(node)

    walk({key: report.get(key) for key in ("eps", "revenue", "guidance", "reaction", "period", "event_date")})
    for quote in quotes:
        found.update(_norm_number(token) for token in _NUMBER.findall(quote.get("text") or ""))
    return found


def numbers_ok(text: str, allowed: set[str]) -> bool:
    return all(_norm_number(token) in allowed for token in _NUMBER.findall(text or ""))


LLM_SYSTEM = (
    "You write for stocksbrew, for people who follow stocks but do not work at a trading desk. "
    "Plain words, short sentences, no hype, no advice. Use only the facts given. Never write a number "
    "that is not in the facts. If something is missing, leave it out."
)


def llm_prompt(report: dict[str, Any], name: str, candidates: list[dict[str, Any]]) -> str:
    facts = {
        "company": name,
        "ticker": report["ticker"],
        "period": (report.get("period") or {}).get("label"),
        "eps": {key: (report.get("eps") or {}).get(key) for key in ("estimate", "actual", "verdict", "surprise_pct")},
        "company_reported_eps": {
            kind: ((report.get("eps") or {}).get(kind) or {}).get("value") for kind in ("gaap", "adjusted")
        },
        "revenue": {key: (report.get("revenue") or {}).get(key) for key in ("value", "prior", "yoy_pct")},
        "guidance": [
            {key: item.get(key) for key in ("label", "period", "low", "high", "prev_low", "prev_high", "direction")}
            for item in (report.get("guidance") or {}).get("items") or []
        ][:6],
        "guidance_change": (report.get("guidance") or {}).get("change"),
    }
    lines = [f"{index}. {item['speaker']}: {item['text']}" for index, item in enumerate(candidates)]
    return (
        "Facts (JSON):\n"
        + json.dumps(facts, ensure_ascii=False)
        + "\n\nWhat management said in the release (numbered):\n"
        + "\n".join(lines)
        + "\n\nReturn JSON: {\"lead\": two plain sentences on what this report means for someone who owns the stock, "
        "\"quotes\": [{\"i\": number of a quote above, \"why\": one plain sentence on why it matters}] (pick the 2 or 3 "
        "that matter most to an owner; skip praise and boilerplate), \"watch\": up to two short things to watch next, "
        "taken from what management said}. Write money as $188.0 million or $1.62, percentages as 11%."
    )


def apply_llm(report: dict[str, Any], name: str, candidates: list[dict[str, Any]], complete: Callable[[str, str], str] | None) -> dict[str, Any]:
    """Ask the model to word the lead and pick quotes; keep its text only if every number checks out."""
    fallback_quotes = [{"text": q["text"], "speaker": q["speaker"], "why": None} for q in extract.pick_quotes(candidates)]
    if complete is None or not candidates and not report.get("eps"):
        return {"quotes": fallback_quotes, "lead": None, "watch": [], "llm": {"used": False, "reason": "off"}}
    try:
        raw = complete(LLM_SYSTEM, llm_prompt(report, name, candidates))
        payload = json.loads(raw[raw.find("{") : raw.rfind("}") + 1])
    except Exception as error:  # noqa: BLE001 - a model failure must never fail the report
        return {"quotes": fallback_quotes, "lead": None, "watch": [], "llm": {"used": False, "reason": f"error: {type(error).__name__}"}}
    allowed = allowed_numbers(report, candidates)
    lead = str(payload.get("lead") or "").strip()
    picks = []
    for pick in payload.get("quotes") or []:
        try:
            index = int(pick.get("i"))
        except (TypeError, ValueError, AttributeError):
            continue
        if 0 <= index < len(candidates) and all(p["text"] != candidates[index]["text"] for p in picks):
            why = str(pick.get("why") or "").strip() or None
            picks.append({"text": candidates[index]["text"], "speaker": candidates[index]["speaker"], "why": why})
    watch = [str(item).strip() for item in (payload.get("watch") or []) if str(item).strip()][:2]
    texts = [lead, *[p["why"] or "" for p in picks], *watch]
    if not lead or not all(numbers_ok(text, allowed) for text in texts):
        bad = [token for text in texts for token in _NUMBER.findall(text) if _norm_number(token) not in allowed]
        return {"quotes": fallback_quotes, "lead": None, "watch": [], "llm": {"used": False, "reason": f"rejected: numbers not in the facts {bad[:5]}"}}
    return {"quotes": picks[:3] or fallback_quotes, "lead": lead, "watch": watch, "llm": {"used": True}}


def default_complete() -> tuple[Callable[[str, str], str] | None, str | None]:
    """The backend's own LLM client (OpenAI), when it and a key are available. (None, None) otherwise."""
    if os.getenv("EARNINGS_DAY_LLM", "1") == "0":
        return None, None
    try:
        from backend import llm_client  # needs requests and dotenv; absent on a bare laptop
    except Exception:  # noqa: BLE001
        return None, None
    if not llm_client.llm_api_key():
        return None, None
    model = os.getenv("EARNINGS_DAY_MODEL", "").strip() or llm_client.llm_model()

    def complete(system: str, prompt: str) -> str:
        body = llm_client.post_chat_completion(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            model=model,
            response_format=llm_client.json_response_format(),
            timeout=60,
            stage="earnings_day",
            max_attempts=3,
        )
        return body["choices"][0]["message"]["content"]

    return complete, model


# -- one report --------------------------------------------------------------


class Sources(Protocol):
    def cik_map(self) -> dict[str, int]: ...
    def submissions(self, cik: int) -> dict[str, Any] | None: ...
    def text(self, url: str, *, immutable: bool) -> str | None: ...
    def nasdaq_day(self, day: str) -> list[dict[str, Any]] | None: ...
    def daily(self, ticker: str) -> dict[str, Any] | None: ...
    def intraday(self, ticker: str) -> list[tuple[datetime, float]]: ...
    # Optional: {avg, analysts, year_ago} for the current quarter, or None. Sources without it get no revenue estimate.
    # def revenue_estimate(self, ticker: str) -> dict[str, Any] | None: ...


class LiveSources:
    """EDGAR, Nasdaq and Yahoo, each through a polite, cached fetcher."""

    def __init__(self, store: DocStore | None) -> None:
        # About 7 requests a second, under EDGAR's limit of 10.
        self.sec = Fetcher("earnings_day_sec", user_agent=SEC_USER_AGENT, min_interval=0.14, ttl=120)
        self.nasdaq = Fetcher(
            "earnings_day_nasdaq",
            user_agent=BROWSER_USER_AGENT,
            min_interval=0.6,
            ttl=600,
            headers={"Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"},
        )
        self.yahoo = Fetcher("earnings_day_yahoo", user_agent="Mozilla/5.0", min_interval=0.3, ttl=300)
        self.store = store

    def cik_map(self) -> dict[str, int]:
        from .sec_filings import load_cik_map

        return load_cik_map(self.sec)

    def submissions(self, cik: int) -> dict[str, Any] | None:
        payload = self.sec.get_json(_SUBMISSIONS.format(cik=cik))
        return payload if isinstance(payload, dict) else None

    def text(self, url: str, *, immutable: bool) -> str | None:
        return self.sec.get(url, ttl=None if immutable else 120)

    def nasdaq_day(self, day: str) -> list[dict[str, Any]] | None:
        url = _NASDAQ_DAY.format(day=day)
        rows = parse_calendar_day(self.nasdaq.get_json(url))
        if rows is None and shutil.which("curl"):
            # Nasdaq's CDN turns away some Python TLS stacks (seen on macOS, not on the server); curl gets through.
            try:
                body = subprocess.run(
                    ["curl", "-s", "-m", "20", "-A", BROWSER_USER_AGENT, "-H", "Accept: application/json, text/plain, */*", "-H", "Origin: https://www.nasdaq.com", "-H", "Referer: https://www.nasdaq.com/", url],
                    capture_output=True,
                    timeout=30,
                    check=False,
                ).stdout
                rows = parse_calendar_day(json.loads(body or b"null"))
            except (OSError, ValueError, subprocess.SubprocessError):
                rows = None
        return rows

    def daily(self, ticker: str) -> dict[str, Any] | None:
        from . import prices

        return prices.fetch_daily(ticker, years=3)

    def intraday(self, ticker: str) -> list[tuple[datetime, float]]:
        from . import prices

        return parse_intraday(self.yahoo.get_json(_YAHOO_INTRADAY.format(symbol=prices.yahoo_symbol(ticker))))

    def revenue_estimate(self, ticker: str) -> dict[str, Any] | None:
        """Yahoo's analyst revenue estimate for the current quarter (``0q``), or None when it cannot be read."""
        try:
            import yfinance as yf  # the backend's own dependency; imported here so the tests run without it

            from . import prices

            frame = yf.Ticker(prices.yahoo_symbol(ticker)).revenue_estimate
            if frame is None or "0q" not in frame.index:
                return None
            row = frame.loc["0q"]

            def value(name: str) -> float | None:
                # numpy numbers (int64 counts, float64 NaN) come back as plain floats, NaN as None.
                try:
                    number = float(row.get(name))
                except (TypeError, ValueError):
                    return None
                return number if number == number else None

            return {"avg": value("avg"), "analysts": value("numberOfAnalysts"), "year_ago": value("yearAgoRevenue")}
        except Exception:  # noqa: BLE001 - an estimate is a nice-to-have; the report goes on without it
            return None


def inputs_hash(report: dict[str, Any]) -> str:
    """What the report was built from. Same hash, same report: nothing to rebuild or write."""
    keys = {
        "filing": (report.get("filing") or {}).get("accession"),
        "exhibit": (report.get("filing") or {}).get("exhibit_sha1"),
        "estimate": (report.get("eps") or {}).get("estimate"),
        "actual": (report.get("eps") or {}).get("actual"),
        "revenue_estimate": ((report.get("revenue") or {}).get("estimate") or {}).get("value"),
        "reaction": {key: (report.get("reaction") or {}).get(key) for key in ("pct", "basis", "final", "typical_abs_pct")},
        "next_report": report.get("next_report"),
        "previous_guidance": report.get("previous_report"),
        "version": JOB_VERSION,
    }
    return hashlib.sha1(json.dumps(keys, sort_keys=True, default=str).encode()).hexdigest()


def settled(existing: dict[str, Any] | None) -> bool:
    """Nothing left to change: the release is read, the actual posted (or never coming) and the move final."""
    if not existing or existing.get("job_version") != JOB_VERSION:
        return False
    eps = existing.get("eps") or {}
    reaction = existing.get("reaction") or {}
    return bool(existing.get("filing")) and eps.get("verdict") != "pending" and bool(reaction.get("final"))


def build_report(
    event: dict[str, Any],
    *,
    sources: Sources,
    cik: int | None,
    name: str,
    nasdaq_rows: list[dict[str, Any]] | None,
    previous_items: list[dict[str, Any]] | None,
    next_report: str | None,
    now: datetime,
    kept_revenue_estimate: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """The report for one earnings event, or None when there is nothing to say yet."""
    ticker = str(event["ticker"]).upper()
    event_date = str(event["event_date"])[:10]
    sources_list: list[dict[str, str]] = []
    filing = None
    facts: dict[str, Any] = {"period": extract.fiscal_period("", str(event.get("fiscal_date_ending") or "")), "revenue": None, "eps": {"gaap": None, "adjusted": None}, "guidance": {"items": [], "change": "none", "headline_quote": None}, "quote_candidates": []}
    filings: list[dict[str, Any]] = []
    if cik:
        payload = sources.submissions(cik)
        filings = earnings_filings(payload or {})
        row = pick_release(filings, event_date)
        if row:
            urls = filing_urls(cik, row)
            index_html = sources.text(urls["index_url"], immutable=True) or ""
            document = release_document(parse_index(index_html))
            exhibit_url = document["url"] if document else urls["primary_url"]
            raw = sources.text(exhibit_url, immutable=True) if exhibit_url else None
            if raw:
                text = extract.html_to_text(raw)
                facts = extract.extract_release(text, fiscal_date_ending=str(event.get("fiscal_date_ending") or ""))
                filing = {
                    "form": row["form"],
                    "accession": row["accession"],
                    "filed_at": row["accepted"],
                    "items": row["items"],
                    "url": exhibit_url,
                    "index_url": urls["index_url"],
                    "exhibit": document["type"] if document else "8-K",
                    "exhibit_sha1": hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest(),
                }
                sources_list.append({"label": f"Earnings release ({filing['exhibit']}), SEC EDGAR", "url": exhibit_url})
                sources_list.append({"label": "8-K filing index, SEC EDGAR", "url": urls["index_url"]})

    # Expectations: one provider for both sides of the comparison.
    estimate, actual, provider = expectations(event, nasdaq_rows)
    if filing is None and actual is None:
        return None  # nothing reported yet
    verdict = eps_verdict(estimate, actual)
    nasdaq_url = f"https://www.nasdaq.com/market-activity/stocks/{ticker.lower().replace('.', '-')}/earnings"
    estimate_url = nasdaq_url if provider == "Nasdaq earnings calendar" else f"https://finance.yahoo.com/quote/{ticker.replace('.', '-')}/analysis"
    if estimate is not None:
        sources_list.append({"label": f"EPS estimate{' and actual' if actual is not None else ''}, {provider}", "url": estimate_url})

    revenue = facts.get("revenue") or None
    if revenue:
        # Only a revenue with its year-ago figure can be matched to an estimate, and only then is one worth a request.
        fetch = getattr(sources, "revenue_estimate", None)
        needs_fetch = callable(fetch) and not kept_revenue_estimate and isinstance(revenue.get("prior"), (int, float)) and revenue["prior"] > 0
        fetched = fetch(ticker) if needs_fetch else None
        estimate_doc = revenue_estimate(revenue, fetched, kept_revenue_estimate, now_iso=now.isoformat())
        revenue = {
            **revenue,
            "yoy_pct": yoy_pct(revenue.get("value"), revenue.get("prior")),
            "estimate": estimate_doc,
            **revenue_verdict(revenue.get("value"), estimate_doc),
        }
        if estimate_doc:
            sources_list.append({"label": "Revenue estimate, Yahoo Finance", "url": f"https://finance.yahoo.com/quote/{ticker.replace('.', '-')}/analysis"})
    guidance = facts.get("guidance") or {"items": [], "change": "none"}
    if previous_items:
        guidance = {**guidance, "items": extract.compare_with_previous(guidance.get("items") or [], previous_items)}
        guidance["change"] = extract.overall_change(guidance["items"], None if guidance.get("change") in {None, "none", "issued"} else guidance.get("change"))

    # Reaction, from the moment the release was filed.
    reaction = None
    if filing:
        session, report_day = session_of(filing["filed_at"])
    else:
        session, report_day = (str(event.get("time") or "during") if event.get("time") in {"bmo", "amc"} else "during"), event_date
    daily = sources.daily(ticker)
    if daily and daily.get("dates"):
        dates, closes = list(daily["dates"]), list(daily["closes"])
        reaction = window_move(dates, closes, session, report_day)
        if reaction is None and filing:
            bars = sources.intraday(ticker)
            accepted_ny = datetime.fromisoformat(filing["filed_at"]).astimezone(NY)
            reaction = live_move(dates, closes, bars, session, report_day, accepted_ny)
        if reaction is not None:
            history = past_moves(dates, closes, filings, exclude=(filing or {}).get("accession", ""))
            reaction["typical_abs_pct"] = extract.typical_move([row["pct"] for row in history])
            reaction["typical_n"] = len(history)
            reaction["history"] = history
            reaction["source"] = "Yahoo Finance prices"
            reaction["session"] = session
            sources_list.append({"label": "Price history, Yahoo Finance", "url": f"https://finance.yahoo.com/quote/{ticker.replace('.', '-')}/history"})

    report: dict[str, Any] = {
        "ticker": ticker,
        "company": name,
        "event_date": event_date,
        "market": "US",
        "period": facts.get("period"),
        "session": session,
        "report_day": report_day,
        "filing": filing,
        "eps": {
            "estimate": estimate,
            "actual": actual,
            **verdict,
            "estimate_source": provider if estimate is not None else None,
            "actual_source": provider if actual is not None else None,
            "source_url": estimate_url if estimate is not None or actual is not None else None,
            "gaap": (facts.get("eps") or {}).get("gaap"),
            "adjusted": (facts.get("eps") or {}).get("adjusted"),
        },
        "revenue": revenue,
        "guidance": guidance,
        "reaction": reaction,
        "next_report": next_report,
        "previous_report": [(item.get("metric"), item.get("period"), item.get("low"), item.get("high")) for item in previous_items or []] or None,
        "sources": sources_list,
        "quote_candidates": facts.get("quote_candidates") or [],
    }
    complete = bool(filing) and (verdict["verdict"] in {"beat", "miss", "in_line"} or revenue is not None)
    report["status"] = "complete" if complete else "partial"
    return report


def finish_report(report: dict[str, Any], *, name: str, complete: Callable[[str, str], str] | None, model: str | None, existing: dict[str, Any] | None, now_iso: str) -> dict[str, Any]:
    """Add the read (rules), the model's wording when it checks out, and the bookkeeping fields."""
    candidates = report.pop("quote_candidates", [])
    report["inputs_hash"] = inputs_hash(report)
    read = build_read(report, name=name, next_report=report.get("next_report"))
    # Reuse the model's words when the facts it saw did not change.
    llm_key = hashlib.sha1(json.dumps([report.get("filing", {}) and report["filing"].get("exhibit_sha1"), report["eps"].get("verdict"), report["eps"].get("actual")], default=str).encode()).hexdigest()
    previous_llm = (existing or {}).get("llm") or {}
    if existing and previous_llm.get("key") == llm_key and previous_llm.get("used"):
        worded = {"quotes": existing.get("quotes") or [], "lead": (existing.get("read") or {}).get("lead_model"), "watch": (existing.get("read") or {}).get("watch_model") or [], "llm": previous_llm}
    else:
        worded = apply_llm(report, name, candidates, complete if report.get("filing") else None)
        worded["llm"] = {**worded["llm"], "key": llm_key, "model": model if worded["llm"].get("used") else None}
    if worded.get("lead"):
        read["lead_model"] = worded["lead"]
        read["lead"] = worded["lead"]
    if worded.get("watch"):
        read["watch_model"] = worded["watch"]
        read["watch"] = (read["watch"] + worded["watch"])[:4]
    report["read"] = read
    report["quotes"] = worded["quotes"]
    report["llm"] = worded["llm"]
    report["generated_at"] = (existing or {}).get("generated_at") or now_iso
    report["updated_at"] = now_iso
    report["job_version"] = JOB_VERSION
    report["source"] = "SEC EDGAR, Nasdaq earnings calendar, Yahoo Finance"
    return report


# -- the run -----------------------------------------------------------------


def doc_id(ticker: str, event_date: str) -> str:
    return f"{ticker.upper().replace('/', '-')}__{event_date}"


def _company_name(event: dict[str, Any], universe_names: dict[str, str]) -> str:
    ticker = str(event["ticker"]).upper()
    listed = universe_names.get(ticker) or ""
    raw = listed if listed and listed.upper() != ticker else str(event.get("company") or ticker)
    short = re.sub(r",?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|plc|Holdings?|Group)\.?$", "", raw.strip(), flags=re.I)
    short = re.sub(r",?\s+(?:Inc|Corp|Co|Ltd|plc)\.?$", "", short, flags=re.I)
    return short.strip(" ,") or raw


def run(
    *,
    days: int = 1,
    tickers: list[str] | None = None,
    dry_run: bool = False,
    local_dir: str | None = None,
    use_llm: bool = True,
    store: DocStore | None = None,
    sources: Sources | None = None,
    complete: Callable[[str, str], str] | None = None,
    model: str | None = None,
    now: datetime | None = None,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    store = store or DocStore.from_env()
    sources = sources or LiveSources(store)
    now = now or utc_now()
    today = ny_now(now).date()
    start = (today - timedelta(days=max(0, days))).isoformat()
    now_iso = now.isoformat()
    if use_llm and complete is None:
        complete, model = default_complete()

    universe = {item.ticker.upper(): item.name for item in load_universe(store)}
    wanted = {symbol_key(t) for t in tickers or []}
    events = [
        data
        for _path, data in query(store, EVENTS, filters=[("event_date", ">=", start), ("event_date", "<=", today.isoformat())], limit=5000)
        if data.get("market") == "US" and str(data.get("ticker") or "").upper() in universe and (not wanted or symbol_key(str(data["ticker"])) in wanted)
    ]
    events.sort(key=lambda event: (event["event_date"], event["ticker"]))
    stats: dict[str, Any] = {"events": len(events), "window": f"{start}..{today.isoformat()}", "written": 0, "unchanged": 0, "settled": 0, "waiting": 0, "built": 0, "llm_used": 0, "llm_rejected": 0, "errors": []}
    if not events:
        return stats

    paths = [f"{COLLECTION}/{doc_id(event['ticker'], event['event_date'])}" for event in events]
    existing_docs = store.get_many(paths)
    if local_dir:
        for path in paths:
            local = Path(local_dir) / f"{path.split('/', 1)[1]}.json"
            if local.exists():
                existing_docs[path] = json.loads(local.read_text())

    cik_map: dict[str, int] | None = None
    nasdaq_days: dict[str, list[dict[str, Any]] | None] = {}
    writes: list[tuple[str, dict[str, Any]]] = []
    reports: list[dict[str, Any]] = []
    for event, path in zip(events, paths):
        ticker = str(event["ticker"]).upper()
        existing = existing_docs.get(path)
        if settled(existing):
            stats["settled"] += 1
            continue
        try:
            if cik_map is None:
                cik_map = sources.cik_map()
            day = str(event["event_date"])[:10]
            if day not in nasdaq_days:
                nasdaq_days[day] = sources.nasdaq_day(day)
            previous = [
                data
                for _p, data in query(store, COLLECTION, filters=[("ticker", "==", ticker)], limit=50)
                if str(data.get("event_date") or "") < day
            ]
            previous.sort(key=lambda data: data.get("event_date") or "")
            previous_items = ((previous[-1].get("guidance") or {}).get("items") or []) if previous else None
            upcoming = [
                str(data.get("event_date"))
                for _p, data in query(store, EVENTS, filters=[("ticker", "==", ticker)], limit=50)
                if str(data.get("event_date") or "") > day and data.get("market") == "US"
            ]
            name = _company_name(event, universe)
            report = build_report(
                event,
                sources=sources,
                cik=cik_map.get(symbol_key(ticker)),
                name=name,
                nasdaq_rows=nasdaq_days[day],
                previous_items=previous_items,
                next_report=min(upcoming) if upcoming else None,
                now=now,
                kept_revenue_estimate=((existing or {}).get("revenue") or {}).get("estimate") or None,
            )
        except Exception as error:  # noqa: BLE001 - one bad filing must not stop the others
            stats["errors"].append(f"{ticker} {event.get('event_date')}: {type(error).__name__}: {error}"[:300])
            continue
        if report is None:
            stats["waiting"] += 1
            continue
        if existing and existing.get("inputs_hash") == inputs_hash({k: v for k, v in report.items() if k != "quote_candidates"}) and existing.get("job_version") == JOB_VERSION:
            stats["unchanged"] += 1
            continue
        report = finish_report(report, name=name, complete=complete, model=model, existing=existing, now_iso=now_iso)
        stats["built"] += 1
        if report["llm"].get("used"):
            stats["llm_used"] += 1
        elif str(report["llm"].get("reason", "")).startswith("rejected"):
            stats["llm_rejected"] += 1
        reports.append(report)
        writes.append((path, report))

    if local_dir and writes:
        folder = Path(local_dir)
        folder.mkdir(parents=True, exist_ok=True)
        for path, data in writes:
            (folder / f"{path.split('/', 1)[1]}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False, default=str))
        stats["written_local"] = len(writes)
    elif not dry_run and writes:
        store.set_many(writes)
        stats["written"] = len(writes)
    stats["reports"] = reports
    return stats


def summary_line(report: dict[str, Any]) -> str:
    """One line per report for the console: the numbers next to their source."""
    eps = report.get("eps") or {}
    revenue = report.get("revenue") or {}
    reaction = report.get("reaction") or {}
    guidance = report.get("guidance") or {}
    bits = [
        f"{report['ticker']} {report['event_date']} [{report.get('status')}] {(report.get('read') or {}).get('title')}",
        f"  EPS est {eps.get('estimate')} actual {eps.get('actual')} -> {eps.get('verdict')} ({eps.get('surprise_pct')}%) | release GAAP {(eps.get('gaap') or {}).get('value')} adj {(eps.get('adjusted') or {}).get('value')}",
        f"  Revenue {extract.fmt_money(revenue.get('value'))} vs {extract.fmt_money(revenue.get('prior'))} a year ago ({revenue.get('yoy_pct')}%) from {revenue.get('method')}: {str(revenue.get('quote') or '')[:110]}",
        f"  Revenue estimate {extract.fmt_money((revenue.get('estimate') or {}).get('value'))} -> {revenue.get('verdict')} ({revenue.get('surprise_pct')}%)",
        f"  Guidance {guidance.get('change')}: " + "; ".join(f"{i['label']} {i['period']} {i['low']}-{i['high']} {i['direction']}" for i in guidance.get("items") or [])[:300],
        f"  Reaction {reaction.get('pct')}% {reaction.get('basis')} final={reaction.get('final')} typical {reaction.get('typical_abs_pct')}% over {reaction.get('typical_n')}",
        f"  Source {(report.get('filing') or {}).get('url')}",
        f"  LLM {report.get('llm')}",
    ]
    return "\n".join(bits)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--days", type=int, default=1, help="also look at reports from the last N days (default 1: today and yesterday)")
    parser.add_argument("--tickers", default="", help="comma list to limit the run")
    parser.add_argument("--dry-run", action="store_true", help="read everything, write nothing, print the reports")
    parser.add_argument("--local-dir", default="", help="write JSON files here instead of the store (a local test store)")
    parser.add_argument("--no-llm", action="store_true")
    parser.add_argument("--force", action="store_true", help="run even when EARNINGS_DAY_ENABLED is not 1")
    args = parser.parse_args()
    if os.getenv("EARNINGS_DAY_ENABLED", "") != "1" and not (args.force or args.dry_run or args.local_dir):
        print("[earnings_day] skipped: set EARNINGS_DAY_ENABLED=1 to switch it on", flush=True)
        return
    stats = run(
        days=args.days,
        tickers=[t.strip() for t in args.tickers.split(",") if t.strip()] or None,
        dry_run=args.dry_run,
        local_dir=args.local_dir or None,
        use_llm=not args.no_llm,
    )
    for report in stats.pop("reports", []):
        if args.dry_run or args.local_dir:
            print(summary_line(report), flush=True)
    print(f"[earnings_day] {stats}", flush=True)


if __name__ == "__main__":
    main()
