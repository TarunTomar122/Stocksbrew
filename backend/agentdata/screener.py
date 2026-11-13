"""Build the screening dataset: one flat row per covered US stock.

The app's screener, idea baskets and compare desk all read this snapshot, so
no page has to scan six collections at request time (a single collection scan
over HTTP takes 30 to 50 seconds).

Inputs, all read-only:

* ``tm_instruments``                        name, sector, industry, exchange
* ``tm_latest_prices``                      quote, market cap, P/E, beta, and the
                                            stored daily snapshots (P/E history)
* ``tm_stock_facts``                        valuation, growth, margins, balance
                                            sheet, dividends, analysts, next earnings
* ``tm_stock_technicals_latest``            RSI, moving averages
* ``tm_stock_intel_pro/US__<universe>``     score and the four pillars
* ``tm_news_runs/US__<universe>``           our call, zones and the one-line reason
* ``tm_price_history_daily``                adjusted daily closes: returns,
                                            volatility, 52-week range, sparkline
* ``tm_earnings_events``                    next earnings date when facts has none

Output: ``tm_screener_snapshot/US`` (meta) and ``tm_screener_snapshot/US__<n>``
(row shards). Every run replaces the snapshot. A field that cannot be computed
is left out of the row; nothing is ever written as a zero standing in for
unknown.

Run it:  python3 -m backend.agentdata.screener            (writes)
         python3 -m backend.agentdata.screener --dry-run  (prints a summary)
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from backend.call_reason import compose_company_reason, peer_label
from backend.facts_quality import guard_facts

from .store import DocStore

COLLECTION = "tm_screener_snapshot"
MARKET = "US"
SHARD_ROWS = 150
SPARK_DAYS = 63
SPARK_POINTS = 32
VOL_DAYS = 90
BENCHMARKS = ("SPY", "QQQ", "IWM")
_ROOT = Path(__file__).resolve().parents[2]

# The instrument master mixes two naming schemes. Fold them into the eleven
# GICS sectors so a sector filter means one thing.
SECTOR_ALIASES = {
    "technology": "Technology",
    "information technology": "Technology",
    "health care": "Health Care",
    "healthcare": "Health Care",
    "financials": "Financials",
    "financial services": "Financials",
    "financial": "Financials",
    "consumer discretionary": "Consumer Discretionary",
    "consumer cyclical": "Consumer Discretionary",
    "consumer staples": "Consumer Staples",
    "consumer defensive": "Consumer Staples",
    "communication services": "Communication Services",
    "communications": "Communication Services",
    "industrials": "Industrials",
    "energy": "Energy",
    "materials": "Materials",
    "basic materials": "Materials",
    "real estate": "Real Estate",
    "utilities": "Utilities",
}

CAP_TIERS = (
    ("mega", 200e9),
    ("large", 10e9),
    ("mid", 2e9),
    ("small", 300e6),
    ("micro", 0.0),
)


# -- small pure helpers ------------------------------------------------------


def num(value: Any) -> float | None:
    """A finite float, or None. Booleans and strings are not numbers here."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def rnd(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def normalize_sector(*candidates: Any) -> str | None:
    for raw in candidates:
        key = str(raw or "").strip().lower()
        if key in SECTOR_ALIASES:
            return SECTOR_ALIASES[key]
    return None


# Industry label -> GICS sector, shared with lib/gics-sector.ts. The stored
# sector is unreliable (an old seeding script filed Amgen, NextEra and
# Prologis under Technology) while the industry labels are right.
INDUSTRY_SECTORS: dict[str, str] = json.loads(
    (_ROOT / "backend" / "config" / "industry_sectors.json").read_text()
)["industries"]


def sector_for_industry(industry: Any) -> str | None:
    """The sector an industry label belongs to, or None when it is unknown or ambiguous."""
    label = " ".join(str(industry or "").lower().split())
    if not label:
        return None
    if label in INDUSTRY_SECTORS:
        return INDUSTRY_SECTORS[label]
    if re.search(r"\breits?\b", label):
        return "Financials" if "mortgage" in label else "Real Estate"
    if re.search(r"^utilities\b|\butilities$", label):
        return "Utilities"
    if label.startswith("oil & gas"):
        return "Energy"
    return None


def cap_tier(market_cap: float | None) -> str | None:
    if market_cap is None or market_cap <= 0:
        return None
    for name, floor in CAP_TIERS:
        if market_cap >= floor:
            return name
    return None


def clean_series(dates: Any, closes: Any) -> list[tuple[str, float]]:
    """(date, close) pairs, oldest first, dropping anything that is not a positive close."""
    out: list[tuple[str, float]] = []
    if not isinstance(dates, list) or not isinstance(closes, list):
        return out
    for day, close in zip(dates, closes):
        value = num(close)
        if isinstance(day, str) and len(day) >= 10 and value is not None and value > 0:
            out.append((day[:10], value))
    out.sort(key=lambda item: item[0])
    return out


def close_on_or_before(series: list[tuple[str, float]], day: str) -> tuple[str, float] | None:
    """The last close dated on or before ``day`` (binary search)."""
    lo, hi = 0, len(series)
    while lo < hi:
        mid = (lo + hi) // 2
        if series[mid][0] <= day:
            lo = mid + 1
        else:
            hi = mid
    return series[lo - 1] if lo > 0 else None


def months_before(day: str, months: int) -> str:
    """The same day-of-month ``months`` earlier, clamped to the month's length."""
    year, month, dom = int(day[:4]), int(day[5:7]), int(day[8:10])
    index = year * 12 + (month - 1) - months
    year, month = divmod(index, 12)
    month += 1
    last = (date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1)).day
    return f"{year:04d}-{month:02d}-{min(dom, last):02d}"


def days_before(day: str, days: int) -> str:
    return (date.fromisoformat(day) - timedelta(days=days)).isoformat()


def pct_change(now: float | None, then: float | None) -> float | None:
    if now is None or then is None or then <= 0:
        return None
    return (now / then - 1.0) * 100.0


def window_returns(series: list[tuple[str, float]], last_price: float, last_day: str) -> dict[str, float]:
    """Total return to ``last_price`` over each window that fits inside the series.

    A window whose start date is older than the first stored close is left
    out: a "1 year" return measured over seven months would be a lie.
    """
    if not series:
        return {}
    first_day = series[0][0]
    windows: list[tuple[str, str]] = [
        ("ret_1w", days_before(last_day, 7)),
        ("ret_1m", months_before(last_day, 1)),
        ("ret_3m", months_before(last_day, 3)),
        ("ret_6m", months_before(last_day, 6)),
        ("ret_1y", months_before(last_day, 12)),
        ("ret_3y", months_before(last_day, 36)),
        ("ret_5y", months_before(last_day, 60)),
        ("ret_ytd", f"{int(last_day[:4]) - 1}-12-31"),
    ]
    out: dict[str, float] = {}
    for key, start in windows:
        if start < first_day:
            continue
        base = close_on_or_before(series, start)
        change = pct_change(last_price, base[1] if base else None)
        if change is not None:
            out[key] = round(change, 2)
            if key == "ret_1w" and base:
                # How many trading days the week's move spans (five, or four around a holiday), so the reason
                # can say "over the past five trading days" and never be read as this week so far.
                sessions = sum(1 for day, _ in series if base[0] < day <= last_day)
                if last_day > series[-1][0] and date.fromisoformat(last_day).weekday() < 5:
                    sessions += 1  # a fresher quote than the last stored close is one more session
                # Seven calendar days hold four or five sessions. Any other count means a quote stamped on a weekend
                # or holiday, or closes that lag, so no count is given and the reason keeps "over the past week".
                if sessions in (4, 5):
                    out["ret_1w_sessions"] = sessions
    return out


def annualized_volatility(closes: list[float], days: int = VOL_DAYS) -> float | None:
    """Standard deviation of daily log returns over the last ``days`` sessions, annualised, in percent."""
    tail = closes[-(days + 1) :]
    if len(tail) < max(21, days // 2):
        return None
    logs = [math.log(b / a) for a, b in zip(tail, tail[1:]) if a > 0 and b > 0]
    if len(logs) < 20:
        return None
    return statistics.stdev(logs) * math.sqrt(252) * 100.0


def max_drawdown(closes: list[float]) -> float | None:
    """Largest peak-to-trough fall in the series, as a negative percent."""
    if len(closes) < 2:
        return None
    peak = closes[0]
    worst = 0.0
    for close in closes:
        peak = max(peak, close)
        worst = min(worst, close / peak - 1.0)
    return worst * 100.0


def thin(values: list[float], max_points: int) -> list[float]:
    """Evenly spaced sample that always keeps the first and last value."""
    if len(values) <= max_points:
        return list(values)
    step = (len(values) - 1) / (max_points - 1)
    return [values[round(i * step)] for i in range(max_points)]


def percentile_rank(history: list[float], latest: float) -> float | None:
    """Share of stored values strictly below ``latest``, 0 to 100."""
    if not history:
        return None
    below = sum(1 for value in history if value < latest)
    return below / len(history) * 100.0


def daily_history(window: Any) -> list[tuple[str, dict[str, Any]]]:
    """One stored snapshot per day (the last one captured), oldest first."""
    by_day: dict[str, tuple[str, dict[str, Any]]] = {}
    if not isinstance(window, list):
        return []
    for entry in window:
        if not isinstance(entry, dict):
            continue
        stamp = entry.get("captured_at")
        if not isinstance(stamp, str) or len(stamp) < 10:
            continue
        day = stamp[:10]
        if day not in by_day or stamp >= by_day[day][0]:
            by_day[day] = (stamp, entry)
    return [(day, by_day[day][1]) for day in sorted(by_day)]


def stored_history_stats(window: Any, current_pe: float | None) -> dict[str, Any]:
    """Where today's P/E sits among the daily P/Es we have on file for the stock.

    The stored range can end well before today (the snapshots stopped carrying
    fundamentals for a while), so the dates of the range travel with the
    number and the page prints them.
    """
    days = daily_history(window)
    out: dict[str, Any] = {}
    if not days or current_pe is None or current_pe <= 0:
        return out
    pes = [
        (day, value)
        for day, entry in days
        if (value := num((entry.get("fundamentals") or {}).get("pe_ttm"))) is not None and value > 0
    ]
    if len(pes) >= 20:
        values = [value for _, value in pes]
        out["pe_hist_pctile"] = rnd(percentile_rank(values, current_pe), 1)
        out["pe_hist_median"] = rnd(statistics.median(values), 2)
        out["pe_hist_days"] = len(values)
        out["pe_hist_from"] = pes[0][0]
        out["pe_hist_to"] = pes[-1][0]
    return out


def rating_trend(facts: dict[str, Any] | None) -> dict[str, Any]:
    """Share of analysts rating the stock a buy, and how the count of buy ratings moved over three months."""
    trend = ((facts or {}).get("analyst_trend") or {}).get("recommendation_trend")
    if not isinstance(trend, list):
        return {}
    months: list[tuple[float, float]] = []
    for entry in trend:
        if not isinstance(entry, dict):
            continue
        counts = [num(entry.get(key)) or 0.0 for key in ("strong_buy", "buy", "hold", "sell", "strong_sell")]
        total = sum(counts)
        if total > 0:
            months.append((counts[0] + counts[1], total))
    if not months:
        return {}
    buys, total = months[-1]
    out: dict[str, Any] = {"buy_pct": round(buys / total * 100.0, 1)}
    if len(months) >= 4:
        out["buys_chg_3m"] = int(round(buys - months[-4][0]))
    return out


def call_word(stance: Any) -> str | None:
    key = str(stance or "").strip().lower()
    if key in ("accumulate", "buy", "add"):
        return "Add"
    if key in ("hold", "watch"):
        return "Hold"
    if key in ("trim", "avoid", "sell", "reduce"):
        return "Trim"
    return None


def call_fields(intel: dict[str, Any] | None, price: float | None) -> dict[str, Any]:
    """Our call, the zones and the one-line reason from the stored brief."""
    out: dict[str, Any] = {}
    if not isinstance(intel, dict):
        return out
    directive = intel.get("directive_v2") if isinstance(intel.get("directive_v2"), dict) else {}
    legacy = intel.get("directive") if isinstance(intel.get("directive"), dict) else {}
    word = call_word(directive.get("stance")) or call_word(legacy.get("stance"))
    if word is None:
        return out
    out["call"] = word
    action = directive.get("action") if isinstance(directive.get("action"), dict) else {}
    reason = (
        str(directive.get("call_reason") or "").strip()
        or str(action.get("summary") or "").strip()
        or str(legacy.get("rationale") or "").strip()
    )
    if reason:
        out["call_reason"] = reason[:320]
        source = str(directive.get("call_reason_source") or "").strip() if directive.get("call_reason") else ""
        out["call_reason_source"] = source or "template"
    confidence = str(directive.get("confidence") or legacy.get("confidence") or "").strip().lower()
    if confidence in ("low", "med", "medium", "high"):
        out["call_confidence"] = "medium" if confidence == "med" else confidence
    stamp = intel.get("generated_at") or intel.get("as_of")
    if isinstance(stamp, str):
        out["call_at"] = stamp

    zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
    add_below = num(zones.get("accumulate_below"))
    trim_above = num(zones.get("trim_above"))
    if add_below is not None and add_below > 0:
        out["add_below"] = round(add_below, 2)
    if trim_above is not None and trim_above > 0:
        out["trim_above"] = round(trim_above, 2)
    if price is not None and price > 0:
        if add_below is not None and add_below > 0:
            out["to_add_pct"] = round((price / add_below - 1.0) * 100.0, 2)
        if trim_above is not None and trim_above > 0:
            out["to_trim_pct"] = round((trim_above / price - 1.0) * 100.0, 2)
        if add_below is not None and add_below > 0 and price <= add_below:
            out["zone"] = "add"
        elif trim_above is not None and trim_above > 0 and price >= trim_above:
            out["zone"] = "trim"
        elif add_below is not None or trim_above is not None:
            out["zone"] = "between"
    return out


def pillar_metric(intel_pro: dict[str, Any] | None, pillar: str, label: str) -> float | None:
    pillars = (intel_pro or {}).get("pillars")
    metrics = ((pillars or {}).get(pillar) or {}).get("metrics") if isinstance(pillars, dict) else None
    if not isinstance(metrics, list):
        return None
    for metric in metrics:
        if isinstance(metric, dict) and metric.get("label") == label:
            return num(metric.get("value"))
    return None


def revenue_cagr_3y(history: Any) -> float | None:
    """Three-year revenue growth rate from fiscal-year rows ("FY 2026", "FY 2025", ...)."""
    if not isinstance(history, list):
        return None
    years: dict[int, float] = {}
    for row in history:
        if not isinstance(row, dict):
            continue
        period = str(row.get("period") or "")
        revenue = num(row.get("revenue"))
        if period.startswith("FY ") and period[3:].strip().isdigit() and revenue is not None and revenue > 0:
            years[int(period[3:].strip())] = revenue
    if not years:
        return None
    latest = max(years)
    if latest - 3 not in years:
        return None
    return ((years[latest] / years[latest - 3]) ** (1 / 3) - 1.0) * 100.0


def next_earnings(facts: dict[str, Any] | None, calendar: dict[str, tuple[str, str]], ticker: str, today: str) -> dict[str, Any]:
    best: tuple[str, str] | None = None
    events = (facts or {}).get("events")
    if isinstance(events, list):
        for event in events:
            if not isinstance(event, dict) or str(event.get("kind") or "").lower() != "earnings":
                continue
            day = str(event.get("date") or "")[:10]
            if len(day) == 10 and day >= today and (best is None or day < best[0]):
                label = str(event.get("date_label") or "").upper()
                time = "after close" if "AMC" in label else "before open" if "BMO" in label else ""
                best = (day, time)
    if best is None and ticker in calendar:
        day, time = calendar[ticker]
        time = {"amc": "after close", "bmo": "before open", "post": "after close", "pre": "before open"}.get(time.lower(), "")
        best = (day, time)
    if best is None:
        return {}
    out: dict[str, Any] = {"earnings_date": best[0], "earnings_in_days": (date.fromisoformat(best[0]) - date.fromisoformat(today)).days}
    if best[1]:
        out["earnings_time"] = best[1]
    return out


def put(row: dict[str, Any], key: str, value: Any, digits: int | None = 2) -> None:
    """Set a field only when there is a real value."""
    if value is None or value == "":
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            return
        if digits == 0:
            value = int(round(value))
        elif digits is not None:
            value = round(value, digits)
    row[key] = value


def price_fields(series: list[tuple[str, float]], quote_price: float | None, quote_day: str | None) -> dict[str, Any]:
    """Everything derived from the daily closes: returns, volatility, 52-week range, sparkline."""
    if len(series) < 2:
        return {}
    closes = [close for _, close in series]
    last_day, last_close = series[-1]
    # A quote taken after the last stored close is the freshest price we have.
    if quote_price is not None and quote_price > 0 and quote_day is not None and quote_day >= last_day:
        end_price, end_day = quote_price, quote_day
        if quote_day > last_day:
            closes = closes + [quote_price]
        else:
            closes = closes[:-1] + [quote_price]
    else:
        end_price, end_day = last_close, last_day

    out: dict[str, Any] = dict(window_returns(series, end_price, end_day))
    out["price_history_to"] = last_day

    year_start = months_before(end_day, 12)
    year = [close for day, close in series if day >= year_start] + ([end_price] if end_price != last_close else [])
    if len(year) >= 120:
        high, low = max(year), min(year)
        out["hi_52w"] = round(high, 2)
        out["lo_52w"] = round(low, 2)
        out["from_hi_pct"] = round((end_price / high - 1.0) * 100.0, 2)
        out["from_lo_pct"] = round((end_price / low - 1.0) * 100.0, 2)
        drawdown = max_drawdown(year)
        if drawdown is not None:
            out["drawdown_1y"] = round(drawdown, 2)

    # Moving averages from the same closes, so "above the 200-day" matches the chart.
    for key, sessions in (("vs_50d", 50), ("vs_200d", 200)):
        if len(closes) >= sessions:
            average = sum(closes[-sessions:]) / sessions
            if average > 0:
                out[key] = round((end_price / average - 1.0) * 100.0, 2)

    volatility = annualized_volatility(closes)
    if volatility is not None:
        out["vol_90d"] = round(volatility, 1)

    spark = thin(closes[-SPARK_DAYS:], SPARK_POINTS)
    if len(spark) >= 2:
        out["spark"] = [round(value, 2) for value in spark]
    return out


def live_pe(facts: dict[str, Any], price: float | None) -> float | None:
    """Today's price over the facts' four-quarter diluted EPS, when the facts confirm it is in dollars.

    0.0 for a four-quarter loss (no P/E, in any currency), None when the facts cannot say. lib/stock-header-facts.ts
    livePe is the page's twin.
    """
    financials = facts.get("financials") if isinstance(facts.get("financials"), dict) else {}
    if financials.get("fiscal_year") != "TTM":
        return None
    eps = num(financials.get("eps_diluted"))
    if eps is not None and eps <= 0:
        return 0.0
    if financials.get("currency") != "USD" or financials.get("reported_currency"):
        return None
    if eps is None or price is None or price <= 0:
        return None
    return price / eps


def build_row(
    *,
    instrument: dict[str, Any],
    latest: dict[str, Any] | None,
    facts: dict[str, Any] | None,
    technicals: dict[str, Any] | None,
    intel_pro: dict[str, Any] | None,
    intel: dict[str, Any] | None,
    series: list[tuple[str, float]],
    earnings: dict[str, tuple[str, str]],
    today: str,
) -> dict[str, Any] | None:
    """One screener row. Returns None for an instrument with no price at all."""
    ticker = str(instrument.get("ticker") or "").strip().upper()
    if not ticker:
        return None
    latest = latest or {}
    # The reader's checks (backend/facts_quality.py): no figure the doc's own tables rule out, no withheld map.
    facts = guard_facts(facts) or {}
    technicals = technicals or {}
    quote = latest.get("quote") if isinstance(latest.get("quote"), dict) else {}
    fundamentals = latest.get("fundamentals") if isinstance(latest.get("fundamentals"), dict) else {}

    quote_price = num(quote.get("current"))
    quote_stamp = quote.get("captured_at") or latest.get("captured_at")
    quote_day = quote_stamp[:10] if isinstance(quote_stamp, str) and len(quote_stamp) >= 10 else None
    price = quote_price if quote_price and quote_price > 0 else (series[-1][1] if series else None)
    if price is None:
        return None

    row: dict[str, Any] = {"symbol": ticker, "instrument_id": str(instrument.get("instrument_id") or f"US_{ticker}")}
    put(row, "name", str(instrument.get("name") or (latest.get("provider_metadata") or {}).get("name") or ticker).strip())
    industry = str(instrument.get("industry") or (intel_pro or {}).get("industry_label") or "").strip()
    sector = sector_for_industry(industry) or normalize_sector(instrument.get("sector"), (intel_pro or {}).get("sector_label"))
    put(row, "sector", sector)
    put(row, "industry", industry)
    put(row, "exchange", str(instrument.get("exchange") or "").strip())
    memberships = instrument.get("index_memberships")
    if isinstance(memberships, list) and memberships:
        row["indexes"] = [str(item) for item in memberships if item][:4]

    # Price and returns
    put(row, "price", price, 4)
    if isinstance(quote_stamp, str):
        row["price_at"] = quote_stamp
    put(row, "day_pct", num(quote.get("day_change_pct")))
    put(row, "volume", num(quote.get("volume")), 0)
    row.update(price_fields(series, quote_price, quote_day))
    if "day_pct" not in row and len(series) >= 2:
        put(row, "day_pct", pct_change(series[-1][1], series[-2][1]))

    # Size and valuation
    # Yahoo's `fundamentals` block on tm_latest_prices is written once, when a stock is added, and never refreshed
    # (the price jobs fetch quotes only), so the weekly facts (Finviz) come first and Yahoo's block is the fallback.
    quick = facts.get("quick_stats") if isinstance(facts.get("quick_stats"), dict) else {}
    market_cap = num(quick.get("market_cap")) or num(fundamentals.get("market_cap"))
    put(row, "market_cap", market_cap, 0)
    put(row, "cap_tier", cap_tier(market_cap))
    valuation = facts.get("valuation") if isinstance(facts.get("valuation"), dict) else {}
    # P/E: today's price over the facts' four-quarter EPS, else the weekly one; never Yahoo's frozen block.
    pe = live_pe(facts, price)
    if pe is None:
        pe = num(quick.get("pe_ttm"))
    elif pe <= 0:
        pe = None
    put(row, "pe", pe if pe and pe > 0 else None)
    for key, source in (("fwd_pe", "forward_pe"), ("ps", "price_to_sales"), ("p_fcf", "price_to_fcf"), ("ev_ebitda", "ev_to_ebitda")):
        value = num(valuation.get(source))
        put(row, key, value if value and value > 0 else None)
    peg = pillar_metric(intel_pro, "valuation", "PEG")
    put(row, "peg", peg if peg and peg > 0 else None)
    row.update(stored_history_stats(latest.get("history_window"), pe))

    # Growth and margins
    financials = facts.get("financials") if isinstance(facts.get("financials"), dict) else {}
    put(row, "rev_growth", num(financials.get("revenue_growth_yoy_pct")))
    put(row, "eps_growth", pillar_metric(intel_pro, "growth", "EPS growth (TTM)"))
    put(row, "eps_next_y", num(quick.get("eps_next_year_growth_pct")))
    put(row, "rev_cagr_3y", revenue_cagr_3y(facts.get("financial_history")))
    put(row, "revenue", num(financials.get("revenue")), 0)
    put(row, "net_income", num(financials.get("net_income")), 0)
    history = facts.get("financial_history")
    ttm = history[0] if isinstance(history, list) and history and isinstance(history[0], dict) else {}
    put(row, "gross_margin", num(ttm.get("gross_margin_pct")))
    put(row, "op_margin", num(ttm.get("operating_margin_pct")))
    put(row, "net_margin", num(ttm.get("profit_margin_pct")))
    revenue = num(ttm.get("revenue")) or num(financials.get("revenue"))
    fcf = num(ttm.get("free_cash_flow")) or num(financials.get("free_cash_flow"))
    if revenue and revenue > 0 and fcf is not None:
        put(row, "fcf_margin", fcf / revenue * 100.0)
    put(row, "fcf", fcf, 0)

    # Balance sheet and quality
    quality = facts.get("quality") if isinstance(facts.get("quality"), dict) else {}
    balance = facts.get("balance") if isinstance(facts.get("balance"), dict) else {}
    put(row, "roe", num(quality.get("roe_pct")))
    put(row, "roic", num(quality.get("roic_pct")))
    put(row, "debt_equity", num(quality.get("debt_to_equity")))
    put(row, "current_ratio", num(quality.get("current_ratio")))
    put(row, "cash", num(balance.get("cash_and_investments")), 0)
    put(row, "debt", num(balance.get("total_debt")), 0)
    put(row, "net_cash", num(balance.get("net_cash")), 0)

    # Dividends
    dividends = facts.get("dividends") if isinstance(facts.get("dividends"), dict) else {}
    dividend_yield = num(dividends.get("yield_pct"))
    if dividend_yield is None:
        dividend_yield = num(fundamentals.get("dividend_yield"))
    put(row, "div_yield", dividend_yield if dividend_yield and dividend_yield > 0 else None)
    put(row, "payout", num(dividends.get("payout_ratio_pct")))
    put(row, "div_growth", num(dividends.get("growth_pct")))
    put(row, "div_growth_years", num(dividends.get("growth_years")), 0)
    put(row, "buyback_yield", num(dividends.get("buyback_yield_pct")))

    # Analysts
    analyst = facts.get("analyst") if isinstance(facts.get("analyst"), dict) else {}
    consensus = latest.get("analyst_consensus") if isinstance(latest.get("analyst_consensus"), dict) else {}
    target = num(analyst.get("target_price")) or num(consensus.get("target_price"))
    if target and target > 0:
        put(row, "target", target)
        put(row, "upside", (target / price - 1.0) * 100.0)
    put(row, "analyst_label", str(analyst.get("label") or consensus.get("label") or "").strip())
    put(row, "analyst_count", num(analyst.get("analyst_count")), 0)
    put(row, "rec_score", num(quick.get("recommendation_score")))
    row.update(rating_trend(facts))

    # Earnings
    row.update(next_earnings(facts, earnings, ticker, today))

    # Technicals and risk
    rsi = technicals.get("rsi_14") if isinstance(technicals.get("rsi_14"), dict) else {}
    put(row, "rsi", num(rsi.get("value")), 1)
    averages = technicals.get("moving_averages") if isinstance(technicals.get("moving_averages"), dict) else {}
    for key, source in (("vs_50d", "sma_50"), ("vs_200d", "sma_200")):
        average = num(averages.get(source))
        if key not in row and average and average > 0:
            put(row, key, (price / average - 1.0) * 100.0)
    put(row, "beta", num(fundamentals.get("beta")))
    put(row, "short_float", pillar_metric(intel_pro, "momentum", "Short float"))
    put(row, "inst_own", num(quick.get("institutional_ownership_pct")))
    if "from_hi_pct" not in row:
        distance = technicals.get("distance") if isinstance(technicals.get("distance"), dict) else {}
        put(row, "from_hi_pct", num(distance.get("from_52w_high_pct")))
        put(row, "from_lo_pct", num(distance.get("from_52w_low_pct")))
        high, low = num(fundamentals.get("week_52_high")), num(fundamentals.get("week_52_low"))
        put(row, "hi_52w", high if high and high > 0 else None)
        put(row, "lo_52w", low if low and low > 0 else None)

    # Our scores
    overall = (intel_pro or {}).get("overall") if isinstance((intel_pro or {}).get("overall"), dict) else {}
    put(row, "score", num(overall.get("score")), 1)
    put(row, "verdict", str(overall.get("verdict") or "").strip().lower())
    pillars = (intel_pro or {}).get("pillars") if isinstance((intel_pro or {}).get("pillars"), dict) else {}
    for key, pillar in (("s_value", "valuation"), ("s_growth", "growth"), ("s_quality", "quality"), ("s_momentum", "momentum")):
        put(row, key, num((pillars.get(pillar) or {}).get("score")), 1)

    # Our read
    row.update(call_fields(intel, price))
    if isinstance(intel, dict):
        put(row, "thesis", str(intel.get("thesis") or "").strip()[:240])
        options = intel.get("options_digest") if isinstance(intel.get("options_digest"), dict) else {}
        implied = num(options.get("iv_mean_30d"))
        if implied and implied > 0:
            put(row, "iv_30d", implied * 100.0, 1)
    return row


def minimal_row(ticker: str, series: list[tuple[str, float]], *, benchmark: bool) -> dict[str, Any] | None:
    """Price and returns only, for benchmarks and basket lines outside coverage."""
    if len(series) < 2:
        return None
    row: dict[str, Any] = {"symbol": ticker, "price": round(series[-1][1], 4), "price_at": f"{series[-1][0]}T21:00:00+00:00"}
    put(row, "day_pct", pct_change(series[-1][1], series[-2][1]))
    row.update(price_fields(series, None, None))
    row["benchmark" if benchmark else "uncovered"] = True
    return row


def coverage(rows: list[dict[str, Any]]) -> dict[str, int]:
    """How many rows carry each field. The app uses it to decide which filters and presets to offer."""
    counts: dict[str, int] = {}
    for row in rows:
        for key in row:
            counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


# -- reads -------------------------------------------------------------------


def _chunks(items: list[str], size: int) -> Iterable[list[str]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _get_many(store: DocStore, paths: list[str], *, chunk: int, select: list[str] | None = None) -> dict[str, dict[str, Any]]:
    """Batch read by path in small chunks so one response never gets huge."""
    out: dict[str, dict[str, Any]] = {}
    if store.mode != "http":
        return store.get_many(paths)
    for part in _chunks(paths, chunk):
        body: dict[str, Any] = {"paths": part}
        if select:
            body["select"] = select
        payload = store._request("POST", "/documents:batchGet", body) or {}
        for document in payload.get("documents", []):
            if isinstance(document, dict) and isinstance(document.get("data"), dict):
                out[document["path"]] = document["data"]
    return out


_COMPARE = {
    ">=": lambda left, right: left >= right,
    ">": lambda left, right: left > right,
    "<=": lambda left, right: left <= right,
    "<": lambda left, right: left < right,
}


def _matches(row: dict[str, Any], flt: dict[str, Any]) -> bool:
    """One query filter applied in Python (the SQLite path), the way the HTTP service applies it."""
    field, op, value = flt["field"], flt["op"], flt["value"]
    if op == "==":
        return row.get(field) == value
    compare = _COMPARE.get(op)
    if compare is None:
        raise ValueError(f"unsupported filter op {op!r}")
    # A missing field never passes a comparison (the HTTP service skips documents without the field).
    if row.get(field) in (None, ""):
        return False
    return compare(str(row.get(field)), str(value))


def _query(store: DocStore, collection: str, filters: list[dict[str, Any]], select: list[str] | None = None) -> list[dict[str, Any]]:
    if store.mode != "http":
        rows = [data for _, data in store.list(collection, limit=20000)]
        for flt in filters:
            rows = [row for row in rows if _matches(row, flt)]
        return rows
    body: dict[str, Any] = {"collection": collection, "filters": filters, "orders": [], "limit": 10000}
    if select:
        body["select"] = select
    payload = store._request("POST", "/query", body) or {}
    return [doc.get("data") or {} for doc in payload.get("documents", []) if isinstance(doc, dict)]


def theme_tickers(store: DocStore) -> list[str]:
    """Every ticker named in an idea basket, so a basket line always has a price row."""
    tickers: set[str] = set()

    def collect(themes: Any) -> None:
        if not isinstance(themes, list):
            return
        for theme in themes:
            if not isinstance(theme, dict):
                continue
            for group in ("candidates", "watchlist"):
                for line in theme.get(group) or []:
                    if isinstance(line, dict) and isinstance(line.get("ticker"), str):
                        tickers.add(line["ticker"].strip().upper())

    try:
        collect(json.loads((_ROOT / "backend" / "config" / "research_themes_seed.json").read_text()))
    except (OSError, ValueError):
        pass
    remote = store.get("tm_config/research_themes")
    if isinstance(remote, dict):
        collect(remote.get("themes"))
    return sorted(ticker for ticker in tickers if ticker)


def calendar_names(events: Iterable[dict[str, Any]]) -> dict[str, str]:
    """Company names from the earnings calendar, for stocks the instrument master names by ticker.

    All-capitals names ("MCDONALD`S CORP") are skipped; the Nasdaq calendar's own casing is kept.
    """
    out: dict[str, str] = {}
    for event in events:
        ticker = str(event.get("ticker") or "").upper()
        company = " ".join(str(event.get("company") or "").split())
        if ticker and company and company.upper() != ticker and not company.isupper():
            out.setdefault(ticker, company)
    return out


def last_reports(events: Iterable[dict[str, Any]], today: str) -> dict[str, dict[str, Any]]:
    """Latest reported earnings per ticker with a known surprise: {date, label, surprise_pct}."""
    out: dict[str, dict[str, Any]] = {}
    for event in events:
        ticker = str(event.get("ticker") or "").upper()
        day = str(event.get("actuals_reported_date") or event.get("event_date") or "")[:10]
        label = str(event.get("surprise_label") or "").lower()
        surprise = num(event.get("eps_surprise_pct"))
        if not ticker or len(day) != 10 or day > today or label not in ("beat", "miss", "inline", "in-line", "met"):
            continue
        if ticker in out and out[ticker]["date"] >= day:
            continue
        out[ticker] = {"date": day, "label": label, "surprise_pct": surprise}
    return out


def peer_moves(rows: list[dict[str, Any]], *, min_peers: int = 4) -> dict[str, dict[str, Any]]:
    """For each symbol, how the rest of its industry (else its sector) moved: label and median returns."""
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    labels: dict[str, tuple[str, str]] = {}
    for row in rows:
        kind, label = peer_label(row.get("industry"), row.get("sector"))
        industry_key = ("industry", label) if kind == "industry" else None
        _, sector_label = peer_label("", row.get("sector"))
        sector_key = ("sector", sector_label) if sector_label else None
        for key in (industry_key, sector_key):
            if key:
                groups.setdefault(key, []).append(row)
        labels[row["symbol"]] = (label if kind == "industry" else "", sector_label)
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        industry_label, sector_label = labels.get(row["symbol"], ("", ""))
        for key in (("industry", industry_label), ("sector", sector_label)):
            if not key[1]:
                continue
            others = [other for other in groups.get(key, []) if other["symbol"] != row["symbol"]]
            if len(others) < min_peers:
                continue
            entry: dict[str, Any] = {"label": key[1]}
            for field in ("ret_1w", "ret_1m"):
                values = [value for other in others if (value := num(other.get(field))) is not None]
                if len(values) >= min_peers:
                    entry[field] = statistics.median(values)
            out[row["symbol"]] = entry
            break
    return out


def _brief_next_event(intel: dict[str, Any] | None, today: str) -> tuple[str, str]:
    """The brief's next dated event that is not earnings: ('the FDA decision', '2026-12-02')."""
    cards = ((intel or {}).get("visual_cards") or {}).get("catalyst_cards") if isinstance((intel or {}).get("visual_cards"), dict) else None
    for card in cards or []:
        if not isinstance(card, dict):
            continue
        event = " ".join(str(card.get("event") or "").split()).rstrip(".")
        day = str(card.get("window") or "")[:10]
        if not event or "earning" in event.lower() or len(event) > 50 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day) or day < today:
            continue
        if re.search(r"[{}\[\]<>$%\d]", event):
            continue
        event = re.sub(r"^(?:the|next|upcoming)\s+", "", event, flags=re.IGNORECASE)
        first, _, rest = event.partition(" ")
        if first[:1].isupper() and not first.isupper() and first.lower() in ("congressional", "annual", "investor", "quarterly", "federal", "court", "shareholder"):
            first = first.lower()
        return f"the {first} {rest}".strip(), day
    return "", ""


def reason_facts(
    row: dict[str, Any],
    intel: dict[str, Any] | None,
    *,
    peers: dict[str, Any] | None,
    report: dict[str, Any] | None,
    today: str,
    name: str | None = None,
) -> dict[str, Any]:
    """The flat input ``compose_company_reason`` reads, from a finished row and its brief.

    ``name`` stands in when the instrument master only has the ticker ("MCD").
    """
    directive = (intel or {}).get("directive_v2") if isinstance((intel or {}).get("directive_v2"), dict) else {}
    legacy = (intel or {}).get("directive") if isinstance((intel or {}).get("directive"), dict) else {}
    facts: dict[str, Any] = {
        key: row.get(key)
        for key in (
            "name", "symbol", "pe", "pe_hist_median", "pe_hist_days", "pe_hist_from", "pe_hist_to", "rev_growth",
            "eps_next_y", "ret_1w", "ret_1w_sessions", "ret_1m", "buys_chg_3m", "div_yield", "div_growth_years", "from_hi_pct",
        )
    }
    if name and str(facts.get("name") or "").upper() == str(row.get("symbol") or "").upper():
        facts["name"] = name
    facts["stance"] = directive.get("stance") or legacy.get("stance")
    facts["execution"] = directive.get("execution")
    facts["next_report"] = row.get("earnings_date")
    facts["has_add_level"] = bool(row.get("add_below"))
    if peers:
        facts["peer_label"] = peers.get("label")
        facts["peer_ret_1w"] = peers.get("ret_1w")
        facts["peer_ret_1m"] = peers.get("ret_1m")
    if report:
        facts["last_report"] = report
    event, day = _brief_next_event(intel, today)
    if event:
        facts["next_event"], facts["next_event_date"] = event, day
    return facts


def attach_company_reasons(
    rows: list[dict[str, Any]],
    intel_by_id: dict[str, dict[str, Any]],
    reports: dict[str, dict[str, Any]],
    today: str,
    names: dict[str, str] | None = None,
) -> dict[str, int]:
    """Replace the shared template under each call with a reason about the company.

    ``call_reason`` becomes two sentences built from the row's own numbers
    (``call_reason_source`` "company", the second sentence also in
    ``call_change``). A row whose numbers say too little keeps the brief's own
    reason. Returns counts by source.
    """
    peers = peer_moves(rows)
    day = date.fromisoformat(today)
    counts: dict[str, int] = {}
    for row in rows:
        if not row.get("call"):
            continue
        intel = intel_by_id.get(str(row.get("instrument_id") or ""))
        facts = reason_facts(
            row, intel, peers=peers.get(row["symbol"]), report=reports.get(row["symbol"]), today=today, name=(names or {}).get(row["symbol"])
        )
        try:
            composed = compose_company_reason(facts, today=day)
        except Exception as exc:  # one odd row must not cost the snapshot
            log(f"reason for {row['symbol']} failed: {exc}")
            composed = None
        if composed:
            row["call_reason"] = composed["text"]
            # "company", not "facts": the brief's own fallback line is already called "facts".
            row["call_reason_source"] = "company"
            row["call_change"] = composed["change"]
        source = str(row.get("call_reason_source") or "none")
        counts[source] = counts.get(source, 0) + 1
    return counts


def log(message: str) -> None:
    print(f"[screener] {message}", file=sys.stderr, flush=True)


def build(store: DocStore, *, today: str | None = None) -> dict[str, Any]:
    today = today or datetime.now(timezone.utc).date().isoformat()
    universes = store.get("tm_config/active_universes") or {}
    universe = str(universes.get("US_universe") or "us_core_155")
    fallbacks = [name for name in ("us_core_155", "us_core_100") if name != universe]

    instruments = [
        row
        for row in _query(store, "tm_instruments", [{"field": "market", "op": "==", "value": "US"}])
        if str(row.get("status") or "active") == "active" and str(row.get("support_tier") or "") != "macro"
    ]
    by_ticker = {str(row.get("ticker") or "").upper(): row for row in instruments if row.get("ticker")}
    ids = [str(row.get("instrument_id") or f"US_{ticker}") for ticker, row in by_ticker.items()]
    log(f"{len(by_ticker)} active US instruments, universe {universe}")

    latest = _get_many(store, [f"tm_latest_prices/{i}" for i in ids], chunk=30)
    log(f"latest prices: {len(latest)}")
    facts = _get_many(store, [f"tm_stock_facts/{i}" for i in ids], chunk=200)
    log(f"facts: {len(facts)}")
    technicals = _get_many(store, [f"tm_stock_technicals_latest/{i}" for i in ids], chunk=300)
    log(f"technicals: {len(technicals)}")

    intel_pro: dict[str, dict[str, Any]] = {}
    intel: dict[str, dict[str, Any]] = {}
    intel_select = ["directive_v2", "directive", "thesis", "generated_at", "as_of", "options_digest", "visual_cards"]
    for name in [universe, *fallbacks]:
        missing = [i for i in ids if i not in intel_pro]
        for path, data in _get_many(store, [f"tm_stock_intel_pro/US__{name}/stocks/{i}" for i in missing], chunk=200).items():
            intel_pro[path.rsplit("/", 1)[-1]] = data
        missing = [i for i in ids if i not in intel]
        for path, data in _get_many(
            store, [f"tm_news_runs/US__{name}/stock_intelligence/{i}" for i in missing], chunk=150, select=intel_select
        ).items():
            intel[path.rsplit("/", 1)[-1]] = data
    log(f"scores: {len(intel_pro)}, briefs: {len(intel)}")

    extras = [ticker for ticker in [*theme_tickers(store), *BENCHMARKS] if ticker not in by_ticker]
    symbols = [*by_ticker.keys(), *extras]
    history = _get_many(store, [f"tm_price_history_daily/{symbol}" for symbol in symbols], chunk=40)
    log(f"daily price history: {len(history)} of {len(symbols)} symbols")

    calendar: dict[str, tuple[str, str]] = {}
    for event in _query(
        store,
        "tm_earnings_events",
        [{"field": "event_date", "op": ">=", "value": today}],
        ["ticker", "event_date", "time"],
    ):
        ticker = str(event.get("ticker") or "").upper()
        day = str(event.get("event_date") or "")[:10]
        if ticker and len(day) == 10 and day >= today and (ticker not in calendar or day < calendar[ticker][0]):
            calendar[ticker] = (day, str(event.get("time") or ""))

    # Reported results from the past five weeks, for "its Nov 4 report beat forecasts by 6%".
    recent_events = _query(
        store,
        "tm_earnings_events",
        [{"field": "event_date", "op": ">=", "value": days_before(today, 200)}],
        ["ticker", "company", "event_date", "actuals_reported_date", "surprise_label", "eps_surprise_pct"],
    )
    reports = last_reports(
        [event for event in recent_events if days_before(today, 35) <= str(event.get("event_date") or "")[:10] <= today],
        today,
    )
    names = calendar_names(recent_events)
    log(f"recent reported earnings: {len(reports)}, calendar names: {len(names)}")

    rows: list[dict[str, Any]] = []
    extra_rows: list[dict[str, Any]] = []
    last_history_day = ""
    for ticker in sorted(by_ticker):
        instrument = by_ticker[ticker]
        instrument_id = str(instrument.get("instrument_id") or f"US_{ticker}")
        raw = history.get(f"tm_price_history_daily/{ticker}") or {}
        series = clean_series(raw.get("dates"), raw.get("closes"))
        if series:
            last_history_day = max(last_history_day, series[-1][0])
        kind = str(raw.get("instrument_type") or "EQUITY").upper()
        if ticker in BENCHMARKS or kind != "EQUITY":
            # Funds and indexes are yardsticks, not things to screen.
            extra = minimal_row(ticker, series, benchmark=True)
            if extra is not None:
                put(extra, "name", str(instrument.get("name") or ticker).strip())
                extra_rows.append(extra)
            continue
        row = build_row(
            instrument=instrument,
            latest=latest.get(f"tm_latest_prices/{instrument_id}"),
            facts=facts.get(f"tm_stock_facts/{instrument_id}"),
            technicals=technicals.get(f"tm_stock_technicals_latest/{instrument_id}"),
            intel_pro=intel_pro.get(instrument_id),
            intel=intel.get(instrument_id),
            series=series,
            earnings=calendar,
            today=today,
        )
        if row is None:
            continue
        if "sector" not in row and "market_cap" not in row:
            # Warrants and funds the instrument master does not classify: not something to screen.
            extra = minimal_row(ticker, series, benchmark=False)
            if extra is not None:
                extra_rows.append(extra)
            continue
        rows.append(row)

    reason_counts = attach_company_reasons(rows, intel, reports, today, names)
    log(f"call reasons by source: {reason_counts}")

    # Basket lines and benchmarks we do not cover: price and returns only.
    for ticker in extras:
        raw = history.get(f"tm_price_history_daily/{ticker}") or {}
        series = clean_series(raw.get("dates"), raw.get("closes"))
        extra = minimal_row(ticker, series, benchmark=ticker in BENCHMARKS)
        if extra is not None:
            extra_rows.append(extra)

    generated_at = datetime.now(timezone.utc).isoformat()
    shards = [rows[start : start + SHARD_ROWS] for start in range(0, len(rows), SHARD_ROWS)]
    docs: list[tuple[str, dict[str, Any]]] = []
    shard_ids: list[str] = []
    for index, shard in enumerate(shards):
        shard_id = f"{MARKET}__{index}"
        shard_ids.append(shard_id)
        docs.append((f"{COLLECTION}/{shard_id}", {"market": MARKET, "generated_at": generated_at, "rows": shard}))
    docs.append((f"{COLLECTION}/{MARKET}__extra", {"market": MARKET, "generated_at": generated_at, "rows": extra_rows}))
    meta = {
        "market": MARKET,
        "universe_id": universe,
        "generated_at": generated_at,
        "as_of_day": today,
        "price_history_to": last_history_day or None,
        "row_count": len(rows),
        "extra_count": len(extra_rows),
        "shards": shard_ids,
        "extra_shard": f"{MARKET}__extra",
        "coverage": coverage(rows),
        "call_reasons": reason_counts,
        "pe_history": {
            "from": min((row["pe_hist_from"] for row in rows if "pe_hist_from" in row), default=None),
            "to": max((row["pe_hist_to"] for row in rows if "pe_hist_to" in row), default=None),
        },
        "sources": {
            "prices": "Yahoo Finance quotes and adjusted daily closes",
            "fundamentals": "Company filings via stockanalysis, finviz and Nasdaq",
            "analysts": "Nasdaq and Yahoo Finance consensus",
            "technicals": "finviz RSI, moving averages from our price snapshots",
            "calls": "stocksbrew briefs",
        },
    }
    docs.append((f"{COLLECTION}/{MARKET}", meta))
    return {"docs": docs, "meta": meta, "rows": rows, "extra_rows": extra_rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the screener snapshot.")
    parser.add_argument("--dry-run", action="store_true", help="compute and print a summary, write nothing")
    parser.add_argument("--today", help="override the as-of day (YYYY-MM-DD), for tests")
    args = parser.parse_args(argv)

    store = DocStore.from_env()
    result = build(store, today=args.today)
    meta = result["meta"]
    log(f"{meta['row_count']} rows, {meta['extra_count']} extra, {len(meta['shards'])} shards")
    sizes = [len(json.dumps(data, separators=(",", ":"))) for _, data in result["docs"]]
    log(f"largest doc {max(sizes) // 1024} KB, total {sum(sizes) // 1024} KB")
    if args.dry_run:
        print(json.dumps({"coverage": meta["coverage"], "sample": result["rows"][:1]}, indent=1))
        return 0
    written = store.set_many(result["docs"])
    log(f"wrote {written} documents to {COLLECTION} ({store.mode})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
