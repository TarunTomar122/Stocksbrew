"""Rule-based strategies: run each over the stored price history and publish it.

    python3 -m backend.agentdata.backtest_strategies              # refresh prices, run, write
    python3 -m backend.agentdata.backtest_strategies --prices-only  # refresh and store prices, nothing else
    python3 -m backend.agentdata.backtest_strategies --no-price-write  # run on the cached prices, write strategies
    python3 -m backend.agentdata.backtest_strategies --dry-run    # run and print, write nothing
    python3 -m backend.agentdata.backtest_strategies --only momentum-12-1

Writes (additive, through ``DocStore``):

* ``tm_strategies/{slug}``: what the page shows. Rules in plain words, the
  basket held now with the reason for each line, the backtest (stats, yearly
  table, thinned curve against SPY, caveats) and the live record.
* ``tm_strategy_runs/{slug}``: the full rebalance history and the frozen
  decisions the live record is valued from.
* ``tm_strategy_rebalances/{slug}__{signal_date}``: one record per rebalance
  that changed the basket, written on the run that first publishes the new
  basket: ``date`` (the session the trades fill, or the pick date for rules
  on financials), ``headline``, ``why`` (one paragraph from the rule itself),
  ``added`` (symbol, name, weight, rank, reason), ``removed`` (symbol, name,
  previous_weight, cause, reason), ``kept`` (symbol, name, weight,
  previous_weight), cash before and after. The web app reads it in
  ``lib/strategies-rebalances.ts``; the mail job sends Pro followers a note.
* ``tm_backtest_universe/US``: the candidate lists, names and size proxies.
* ``tm_price_history_daily/{SYMBOL}``: the refreshed price series, only those
  newer than the stored copy (skipped with ``--no-price-write``).

The after-close schedule runs this twice: ``--prices-only`` first, then
``--no-price-write``, which reads the same series back from the local price
cache. Each gets its own timeout, so slow store writes never cost the
strategies their nightly update.

Two records, kept apart on purpose:

* **Backtested.** The rules applied to past prices. Nobody held it. The stock
  pool is today's list, so it flatters the result (see ``lib/backtest/caveats.json``).
* **Live.** Starts the day a strategy is first published. The basket held that
  day is frozen as a decision, and every later month-end adds another. The live
  number is those decisions valued forward, so it cannot be revised afterwards.

Strategies that read company financials have no backtest at all: we only hold
today's figures, so a test on the past would use numbers nobody had yet.
"""

from __future__ import annotations

import argparse
import calendar as month_calendar
import json
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import backtest, prices
from .store import DocStore

_ROOT = Path(__file__).resolve().parents[2]
_UNIVERSE_PATH = _ROOT / "backend" / "config" / "instrument_universe.json"
_POPULAR_FUNDS_PATH = _ROOT / "backend" / "config" / "popular_funds.json"
COVERAGE_UNIVERSE = "us_core_155"
BENCHMARK = "SPY"
COST_BPS = 10
SOURCE = "Yahoo Finance daily closes, adjusted for splits and dividends"
BACKTEST_LABEL = "Backtested, not traded"

SECTOR_FUNDS = {
    "XLB": "Materials Select Sector SPDR",
    "XLC": "Communication Services Select Sector SPDR",
    "XLE": "Energy Select Sector SPDR",
    "XLF": "Financial Select Sector SPDR",
    "XLI": "Industrial Select Sector SPDR",
    "XLK": "Technology Select Sector SPDR",
    "XLP": "Consumer Staples Select Sector SPDR",
    "XLRE": "Real Estate Select Sector SPDR",
    "XLU": "Utilities Select Sector SPDR",
    "XLV": "Health Care Select Sector SPDR",
    "XLY": "Consumer Discretionary Select Sector SPDR",
}
ASSET_CLASS_FUNDS = {
    "SPY": "US large companies (SPDR S&P 500)",
    "QQQ": "US technology-heavy large companies (Invesco QQQ)",
    "IWM": "US small companies (iShares Russell 2000)",
    "EFA": "Developed markets outside the US (iShares MSCI EAFE)",
    "EEM": "Emerging markets (iShares MSCI Emerging Markets)",
    "VNQ": "US real estate (Vanguard Real Estate)",
    "TLT": "Long US Treasuries, 20+ years (iShares)",
    "IEF": "Mid US Treasuries, 7-10 years (iShares)",
    "LQD": "US investment-grade corporate bonds (iShares)",
    "GLD": "Gold (SPDR Gold Shares)",
    "DBC": "Commodities basket (Invesco DB)",
}
FUND_NAMES = {**SECTOR_FUNDS, **ASSET_CLASS_FUNDS}

# Each strategy: the spec the engine runs, and the same rules in plain words.
STRATEGIES: list[dict[str, Any]] = [
    {
        "slug": "momentum-12-1",
        "name": "Momentum leaders",
        "style": "Momentum",
        "tagline": "The 25 S&P 500 stocks that rose most over the past year.",
        "summary": "Stocks that have been rising tend to keep rising for a while. Each month this ranks the S&P 500 stocks we cover by their return over the past twelve months, leaving out the latest month, and holds the top 25 in equal amounts.",
        "rules": [
            "Start with the S&P 500 stocks we cover.",
            "Measure each one's return over the 12 months that ended one month ago. The latest month is left out because very recent winners often give some back.",
            "Hold the 25 with the highest return, 4% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Momentum falls hard when the market turns: the stocks that led on the way up are often the ones sold first.",
        "universe": "sp500",
        "spec": {"rank": [{"type": "momentum", "months": 12, "skip_months": 1}], "holdings": 25},
    },
    {
        "slug": "low-volatility",
        "name": "Calm stocks",
        "style": "Low volatility",
        "tagline": "The 25 S&P 500 stocks whose prices moved least over the past year.",
        "summary": "Stocks with small day-to-day swings have historically fallen less in bad markets. Each month this holds the 25 S&P 500 stocks we cover with the smallest daily price swings over the past year.",
        "rules": [
            "Start with the S&P 500 stocks we cover.",
            "Measure how much each one's price moved day to day over the last 252 sessions (about a year).",
            "Hold the 25 that moved least, 4% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Calm stocks lag in strong rallies, and the group leans toward utilities and consumer staples, which are sensitive to interest rates.",
        "universe": "sp500",
        "spec": {"rank": [{"type": "low_volatility", "days": 252}], "holdings": 25},
    },
    {
        "slug": "steady-climbers",
        "name": "Steady climbers",
        "style": "Momentum + low volatility",
        "tagline": "Stocks that rose over the past year without big daily swings.",
        "summary": "A blend of the two ideas above. Each S&P 500 stock we cover gets one rank for its past-year return and one for how calm its price has been. The 25 with the best combined rank are held in equal amounts.",
        "rules": [
            "Start with the S&P 500 stocks we cover.",
            "Rank each one by its return over the 12 months that ended one month ago.",
            "Rank each one by how little its price moved day to day over the last 252 sessions.",
            "Average the two ranks and hold the best 25, 4% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "It can miss the sharpest rebounds, because the stocks that bounce hardest after a fall are neither calm nor recent winners.",
        "universe": "sp500",
        "spec": {
            "rank": [
                {"type": "momentum", "months": 12, "skip_months": 1},
                {"type": "low_volatility", "days": 252},
            ],
            "holdings": 25,
        },
    },
    {
        "slug": "mega-cap-equal-weight",
        "name": "Ten largest, equal weight",
        "style": "Size",
        "tagline": "The ten biggest US companies, 10% each.",
        "summary": "The ten largest companies we cover, held in equal amounts instead of by size. Compared with an index fund this puts less in the very biggest company and more in number ten.",
        "rules": [
            "Start with every US company we cover.",
            "Estimate each one's market value.",
            "Hold the ten largest, 10% each.",
            "Repeat at the end of every month, which trims whatever grew and tops up whatever shrank.",
        ],
        "watch_out": "Ten stocks is a concentrated portfolio, mostly technology today. One bad earnings report moves the whole thing.",
        "universe": "covered",
        "spec": {"universe_extra": {"top_by_size": 10}, "rank": [{"type": "size"}], "holdings": 10},
    },
    {
        "slug": "large-cap-trend",
        "name": "Big companies in uptrends",
        "style": "Trend",
        "tagline": "Large companies trading above their 200-day average, with a market-wide exit.",
        "summary": "Takes the 50 largest companies we cover, keeps the ones trading above their own 200-day average price and holds the 15 strongest over the past six months. If the S&P 500 itself is below its 200-day average, everything goes to cash.",
        "rules": [
            "Start with the 50 largest US companies we cover.",
            "Keep only those whose price is above its own 200-day average.",
            "Hold the 15 with the best return over the 6 months that ended one month ago, in equal amounts.",
            "If the S&P 500 fund (SPY) closed the month below its 200-day average, hold cash instead.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "The exit only checks once a month, so a fast fall is felt before it acts, and it can sell near the low and buy back higher.",
        "universe": "covered",
        "spec": {
            "universe_extra": {"top_by_size": 50},
            "filters": [{"type": "trend", "ma_days": 200, "min": 0}],
            "rank": [{"type": "momentum", "months": 6, "skip_months": 1}],
            "market_filter": {"symbol": "SPY", "ma_days": 200},
            "holdings": 15,
        },
    },
    {
        "slug": "trend-200-day",
        "name": "S&P 500 with a 200-day exit",
        "style": "Trend",
        "tagline": "Own the index fund while it is above its 200-day average. Otherwise hold cash.",
        "summary": "The simplest trend rule there is. Hold the S&P 500 fund while its price is above its average of the last 200 sessions, and sit in cash when it is below.",
        "rules": [
            "At the end of each month, compare the S&P 500 fund (SPY) with its average closing price over the last 200 sessions.",
            "Above the average: hold SPY.",
            "Below the average: hold cash, which earns nothing in this test.",
        ],
        "watch_out": "In a choppy market it sells after a dip and buys back after the rebound, over and over. It has lagged plain buy-and-hold in most rising years.",
        "universe": "spy_only",
        "spec": {
            "filters": [{"type": "trend", "ma_days": 200, "min": 0}],
            "rank": [{"type": "trend", "ma_days": 200}],
            "holdings": 1,
        },
    },
    {
        "slug": "dual-momentum",
        "name": "Asset-class momentum",
        "style": "Momentum across asset classes",
        "tagline": "The three strongest of eleven stock, bond, gold and commodity funds, or cash.",
        "summary": "Looks across eleven funds that cover US and foreign stocks, real estate, bonds, gold and commodities. Holds the three with the best return over the past year, but only if that return is positive. A slot with no positive candidate stays in cash.",
        "rules": [
            "Start with eleven funds: US large, technology-heavy and small companies, developed and emerging markets, real estate, long and mid Treasuries, corporate bonds, gold and commodities.",
            "Measure each fund's return over the last 12 months.",
            "Drop any fund whose 12-month return is negative.",
            "Hold the three with the highest return, a third each. An empty slot stays in cash.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "It reacts slowly. After a sharp reversal it can hold last year's winners for months before the ranking catches up.",
        "universe": "asset_classes",
        "spec": {
            "filters": [{"type": "momentum", "months": 12, "skip_months": 0, "min": 0}],
            "rank": [{"type": "momentum", "months": 12, "skip_months": 0}],
            "holdings": 3,
        },
    },
    {
        "slug": "sector-rotation",
        "name": "Sector rotation",
        "style": "Momentum across sectors",
        "tagline": "The three strongest of the eleven US sector funds.",
        "summary": "Each month this ranks the eleven US sector funds by their return over the past six months and holds the top three in equal amounts.",
        "rules": [
            "Start with the eleven Select Sector SPDR funds, one for each part of the US market.",
            "Measure each fund's return over the last 6 months.",
            "Hold the three with the highest return, a third each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Three sectors is a narrow bet. When leadership changes quickly the strategy is always one step behind.",
        "universe": "sector_funds",
        "spec": {"rank": [{"type": "momentum", "months": 6, "skip_months": 0}], "holdings": 3},
    },
    {
        "slug": "buy-the-dip",
        "name": "Buy the dip",
        "style": "Mean reversion",
        "tagline": "S&P 500 stocks in a long-term uptrend that fell most in the past month.",
        "summary": "Looks for stocks that are still above their 200-day average but had a bad month. Holds the 20 that fell most over the last 21 sessions, on the idea that a pullback inside an uptrend often recovers.",
        "rules": [
            "Start with the S&P 500 stocks we cover.",
            "Keep only those whose price is above its own 200-day average.",
            "Measure how far each one fell over the last 21 sessions (about a month).",
            "Hold the 20 that fell most, 5% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Sometimes a stock falls for a good reason and keeps falling. This rule cannot tell a dip from the start of a decline, and it trades a lot.",
        "universe": "sp500",
        "spec": {
            "filters": [{"type": "trend", "ma_days": 200, "min": 0}],
            "rank": [{"type": "pullback", "days": 21}],
            "holdings": 20,
        },
    },
    {
        "slug": "congress-net-buying",
        "name": "Follow the filing: Congress",
        "style": "Follow the filing",
        "tagline": "Stocks that members of Congress reported buying more than selling in the last 90 days.",
        "summary": "Members of Congress must disclose their stock trades. This holds up to ten stocks with more purchase filings than sale filings over the last 90 days, counting from the day each filing became public.",
        "rules": [
            "Start with every US company we cover.",
            "Count purchase and sale filings by members of Congress made public in the last 90 days.",
            "Keep stocks with at least one more purchase than sale.",
            "Hold up to ten with the largest gap, 10% each. An empty slot stays in cash.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Filings arrive up to 45 days after the trade, and our filing history is only a few months long, so the test below says very little.",
        "universe": "covered",
        "spec": {
            "filters": [{"type": "congress_net_buying", "window_days": 90, "min": 1}],
            "rank": [
                {"type": "congress_net_buying", "window_days": 90, "weight": 2},
                {"type": "momentum", "months": 3, "skip_months": 0, "weight": 1},
            ],
            "holdings": 10,
        },
    },
    {
        "slug": "quality",
        "name": "Quality companies",
        "style": "Quality",
        "tagline": "High return on capital, modest debt, strong cash generation.",
        "summary": "Companies that earn a lot on the money invested in them and do not lean on debt. Holds the 25 S&P 500 stocks we cover that best combine return on invested capital with free cash flow yield.",
        "rules": [
            "Start with the S&P 500 stocks we cover.",
            "Keep companies with a return on invested capital of at least 15%.",
            "Keep companies whose debt is no more than their shareholders' equity.",
            "Rank what is left by return on invested capital and by free cash flow yield, and hold the best 25, 4% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "Good companies can be expensive stocks. This rule looks at the business and only lightly at the price paid for it.",
        "universe": "sp500",
        "spec": {
            "filters": [
                {"type": "fundamental", "field": "roic", "min": 15},
                {"type": "fundamental", "field": "debt_to_equity", "max": 1},
            ],
            "rank": [
                {"type": "fundamental", "field": "roic"},
                {"type": "fundamental", "field": "fcf_yield"},
            ],
            "holdings": 25,
        },
    },
    {
        "slug": "dividend-growers",
        "name": "Dividend growers",
        "style": "Dividends",
        "tagline": "Companies that have raised their dividend for at least ten years running.",
        "summary": "Companies with a long record of raising the dividend every year. Holds the 25 we cover with at least ten straight years of increases and a yield of at least 1%, favouring the fastest growers.",
        "rules": [
            "Start with every US company we cover.",
            "Keep companies that have raised their dividend for at least 10 years in a row.",
            "Keep companies that yield at least 1% at the current price.",
            "Hold the 25 with the fastest dividend growth, 4% each.",
            "Repeat at the end of every month.",
        ],
        "watch_out": "A long streak says the past was steady, not that the next cut cannot happen. The group leans away from fast-growing companies that pay little or nothing.",
        "universe": "covered",
        "spec": {
            "filters": [
                {"type": "fundamental", "field": "dividend_growth_years", "min": 10},
                {"type": "fundamental", "field": "dividend_yield", "min": 1},
            ],
            "rank": [{"type": "fundamental", "field": "dividend_growth"}],
            "holdings": 25,
        },
    },
]


def log(message: str) -> None:
    print(f"[strategies] {message}", flush=True)


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    return float(value)


# -- writes -------------------------------------------------------------------


# Price histories per write. Straight to SQLite (the VPS) one batch is one write transaction,
# and the web app's writes wait behind it (30s busy timeout). What costs time there is the
# array index: every date or close that changes is a random index write (~3-5 ms cold on the
# VPS). So a batch is capped by documents and by changed array values: ~30 daily appends
# (a few seconds), or one series whose whole history Yahoo rescaled after a dividend.
PRICE_WRITE_BATCH = 30
PRICE_WRITE_MAX_CHANGES = 1500
# Yahoo's adjusted closes come back with the 4th decimal jittering between fetches (Nov 2026:
# 74 of 107 series had ~200 past closes off by 0.0001-0.0002, with no real adjustment). A past
# close within this of the stored one keeps the stored value, so the jitter is not rewritten
# into the index every night. A real dividend or split rescale moves far more than this.
CLOSE_JITTER = 0.0002 + 1e-9


def _is_retryable(error: Exception) -> bool:
    """A busy store, not a broken one: HTTP errors after retries, or SQLite's locked/busy."""
    if isinstance(error, sqlite3.OperationalError):
        text = str(error).lower()
        return "locked" in text or "busy" in text
    return isinstance(error, RuntimeError)


def write_batches(
    store: DocStore,
    batches: list[list[tuple[str, dict[str, Any]]]],
    *,
    attempts: int = 8,
    progress: str = "",
) -> int:
    """Write each batch with backoff. The store is one SQLite file other jobs write to at the same time.

    A busy store shows up as RuntimeError over HTTP and as sqlite3.OperationalError
    ("database is locked") straight to the file; both are retried. Any other SQLite
    error (disk full, I/O) is raised at once.
    """
    total = sum(len(batch) for batch in batches)
    written = 0
    started = time.monotonic()
    next_report = started + 60
    for chunk in batches:
        for attempt in range(attempts):
            try:
                written += store.set_many(chunk)
                break
            except (RuntimeError, sqlite3.OperationalError) as error:
                if attempt == attempts - 1 or not _is_retryable(error):
                    raise
                log(f"write retry {attempt + 1} after: {str(error)[:120]}")
                time.sleep(5.0 * (attempt + 1))
        if progress and time.monotonic() >= next_report and written < total:
            log(f"{progress}: wrote {written} of {total} in {time.monotonic() - started:.0f}s")
            next_report = time.monotonic() + 60
    if progress:
        log(f"{progress}: wrote {written} in {time.monotonic() - started:.1f}s")
    return written


def write_with_retry(
    store: DocStore,
    docs: list[tuple[str, dict[str, Any]]],
    *,
    batch: int = 4,
    attempts: int = 8,
    progress: str = "",
) -> int:
    """Fixed-size batches through ``write_batches``."""
    batches = [docs[start : start + batch] for start in range(0, len(docs), batch)]
    return write_batches(store, batches, attempts=attempts, progress=progress)


def steady_closes(document: dict[str, Any], stored: dict[str, Any] | None) -> tuple[dict[str, Any], int]:
    """``document`` with past closes that only jittered set back to the stored values.

    Returns the document to write (a copy when anything was kept) and how many array
    values differ from the stored copy, which is roughly the index writes it will cost.
    """
    dates = list(document.get("dates") or [])
    closes = list(document.get("closes") or [])
    if not stored:
        return document, len(dates) + len(closes)
    before = dict(zip(stored.get("dates") or [], stored.get("closes") or []))
    kept = 0
    for index, (day, close) in enumerate(zip(dates, closes)):
        old = before.get(day)
        if isinstance(old, (int, float)) and old != close and abs(old - close) <= CLOSE_JITTER:
            closes[index] = old
            kept += 1
    if kept:
        document = {**document, "closes": closes}
    changes = len(set(dates) ^ set(stored.get("dates") or [])) + len(set(closes) ^ set(stored.get("closes") or []))
    return document, changes


def batches_by_changes(
    docs: list[tuple[str, dict[str, Any], int]], *, max_docs: int, max_changes: int
) -> list[list[tuple[str, dict[str, Any]]]]:
    """Group (path, data, changes) in order; a batch ends at ``max_docs`` or ``max_changes``.

    A single document over the change cap still gets a batch of its own.
    """
    batches: list[list[tuple[str, dict[str, Any]]]] = []
    current: list[tuple[str, dict[str, Any]]] = []
    budget = 0
    for path, data, changes in docs:
        if current and (len(current) >= max_docs or budget + changes > max_changes):
            batches.append(current)
            current, budget = [], 0
        current.append((path, data))
        budget += changes
    if current:
        batches.append(current)
    return batches


def sync_prices(store: DocStore, series: dict[str, dict[str, Any]]) -> int:
    """Write only the price series the store is missing or holds an older copy of."""
    # What the store holds for each symbol: its last date, and whether that
    # last bar is a real close. A copy fetched while the session was still
    # open carries a mid-session price for its last date; the dates match, but
    # it must still be replaced once the close is in.
    stored: dict[str, tuple[str, bool]] = {}
    stored_docs: dict[str, dict[str, Any]] = {}
    for path, data in store.list(prices.COLLECTION, limit=5000):
        last = str(data.get("last_date") or "")
        fetched = str(data.get("fetched_at") or "")
        closed = not (fetched[:10] == last and fetched[11:16] < "21:10")
        key = path.split("/", 1)[1]
        stored[key] = (last, closed)
        stored_docs[key] = data

    def is_stale(symbol: str, document: dict[str, Any]) -> bool:
        last, closed = stored.get(prices.doc_id(symbol), ("", True))
        return last < document["last_date"] or (last == document["last_date"] and not closed)

    stale: list[tuple[str, dict[str, Any], int]] = []
    kept_series = 0
    for symbol, document in sorted(series.items()):
        if not is_stale(symbol, document):
            continue
        steady, changes = steady_closes(document, stored_docs.get(prices.doc_id(symbol)))
        kept_series += steady is not document
        stale.append((f"{prices.COLLECTION}/{prices.doc_id(symbol)}", steady, changes))
    log(
        f"prices: {len(stale)} of {len(series)} series are newer than the store "
        f"({kept_series} kept stored closes that only jittered, {sum(c for _, _, c in stale)} changed values)"
    )
    batches = batches_by_changes(stale, max_docs=PRICE_WRITE_BATCH, max_changes=PRICE_WRITE_MAX_CHANGES)
    return write_batches(store, batches, progress="prices")


# -- inputs -------------------------------------------------------------------

# US markets close at 20:00 or 21:00 UTC depending on daylight saving. A bar
# dated the day it was fetched, fetched before this time, is a price from the
# middle of a session and not a close.
_SESSION_DONE_UTC = "21:10"


def completed_sessions(document: dict[str, Any]) -> tuple[list[str], list[float]]:
    """Dates and closes with a still-open last session removed."""
    dates = list(document["dates"])
    closes = list(document["closes"])
    fetched = str(document.get("fetched_at") or "")
    if dates and len(fetched) >= 16 and dates[-1] == fetched[0:10] and fetched[11:16] < _SESSION_DONE_UTC:
        dates.pop()
        closes.pop()
    return dates, closes



def popular_fund_tickers() -> list[str]:
    """Tickers in backend/config/popular_funds.json, the funds the fund pages cover."""
    try:
        payload = json.loads(_POPULAR_FUNDS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    return [str(row.get("ticker") or "").strip().upper() for row in payload.get("funds") or [] if str(row.get("ticker") or "").strip()]


def load_instruments() -> list[dict[str, Any]]:
    payload = json.loads(_UNIVERSE_PATH.read_text())
    market = payload["markets"]["US"]
    members = set(market["universes"][COVERAGE_UNIVERSE])
    out = [
        item
        for item in market["instruments"]
        if item.get("instrument_id") in members and item.get("ticker") and item.get("status", "active") == "active"
    ]
    out.sort(key=lambda item: item["ticker"])
    return out


def load_facts(store: DocStore, tickers: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for start in range(0, len(tickers), 100):
        chunk = tickers[start : start + 100]
        found = store.get_many([f"tm_stock_facts/US_{ticker}" for ticker in chunk])
        for path, data in found.items():
            out[path.split("/US_", 1)[1]] = data
    return out


def fundamentals_from_facts(facts: dict[str, Any], last_close: float | None) -> dict[str, float]:
    """Today's figures only. Never used in a backtest."""
    out: dict[str, float] = {}
    quality = facts.get("quality") or {}
    valuation = facts.get("valuation") or {}
    dividends = facts.get("dividends") or {}
    quick = facts.get("quick_stats") or {}
    roic = _num(quality.get("roic_pct"))
    if roic is not None:
        out["roic"] = roic
    debt = _num(quality.get("debt_to_equity"))
    if debt is not None and debt >= 0:
        out["debt_to_equity"] = debt
    price_to_fcf = _num(valuation.get("price_to_fcf"))
    if price_to_fcf is not None and price_to_fcf > 0:
        out["fcf_yield"] = 100.0 / price_to_fcf
    cap = _num(quick.get("market_cap"))
    if cap is not None and cap > 0:
        out["market_cap"] = cap
    annual = _num(dividends.get("annual_dividend"))
    if annual is not None and annual > 0 and last_close:
        out["dividend_yield"] = 100.0 * annual / last_close
        buyback = _num(dividends.get("buyback_yield_pct"))
        out["shareholder_yield"] = out["dividend_yield"] + (buyback or 0.0)
    years = _num(dividends.get("growth_years"))
    if years is not None:
        out["dividend_growth_years"] = years
    growth = _num(dividends.get("growth_pct"))
    if growth is not None:
        out["dividend_growth"] = growth
    return out


def load_congress_events(store: DocStore, known: set[str]) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []
    for _path, data in store.list("tm_power_trades", limit=5000):
        ticker = str(data.get("ticker") or "").upper()
        day = str(data.get("disclosure_date") or "")[:10]
        side = data.get("tx_type")
        if ticker in known and len(day) == 10 and side in ("buy", "sell"):
            events.append({"symbol": ticker, "date": day, "side": side})
    events.sort(key=lambda item: (item["date"], item["symbol"], item["side"]))
    return events


# -- words --------------------------------------------------------------------


def _pct(value: float, digits: int = 1) -> str:
    return f"{abs(value) * 100:.{digits}f}%"


def _money(value: float) -> str:
    if value >= 1e12:
        return f"${value / 1e12:.2f} trillion"
    if value >= 1e9:
        return f"${value / 1e9:.0f} billion"
    return f"${value / 1e6:.0f} million"


def _ordinal(number: int) -> str:
    if 10 <= number % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(number % 10, "th")
    return f"{number}{suffix}"


def signal_sentence(signal: dict[str, Any], values: dict[str, float]) -> str | None:
    key = backtest.signal_key(signal)
    if key not in values:
        return None
    value = values[key]
    kind = signal["type"]
    if kind == "momentum":
        months = signal["months"]
        skip = signal["skip_months"]
        direction = "Up" if value >= 0 else "Down"
        window = f"over the {months} months to a month ago" if skip == 1 else f"over the last {months} months"
        if skip > 1:
            window = f"over the {months} months to {skip} months ago"
        return f"{direction} {_pct(value)} {window}."
    if kind == "low_volatility":
        return f"Daily moves over the last {signal['days']} sessions add up to {_pct(value)} a year."
    if kind == "trend":
        side = "above" if value >= 0 else "below"
        return f"Closed {_pct(value)} {side} its {signal['ma_days']}-day average."
    if kind == "near_high":
        if value >= -0.0005:
            return f"Closed at its highest price of the last {signal['days']} sessions."
        return f"Closed {_pct(value)} below its high of the last {signal['days']} sessions."
    if kind == "pullback":
        direction = "Fell" if value >= 0 else "Rose"
        return f"{direction} {_pct(value)} over the last {signal['days']} sessions."
    if kind == "size":
        return f"Estimated market value {_money(value)}."
    if kind == "congress_net_buying":
        buys = int(values.get("congress_buys", 0))
        sells = int(values.get("congress_sells", 0))
        buy_word = "purchase filing" if buys == 1 else "purchase filings"
        sell_word = "sale filing" if sells == 1 else "sale filings"
        return f"{buys} {buy_word} and {sells} {sell_word} by members of Congress in the last {signal['window_days']} days."
    if kind == "fundamental":
        field = signal["field"]
        if field == "roic":
            return f"Return on invested capital {value:.0f}%."
        if field == "debt_to_equity":
            return f"Debt is {value:.2f} times shareholders' equity."
        if field == "fcf_yield":
            return f"Free cash flow yield {value:.1f}%."
        if field == "dividend_yield":
            return f"Dividend yield {value:.1f}%."
        if field == "shareholder_yield":
            return f"Dividends plus buybacks yield {value:.1f}%."
        if field == "dividend_growth_years":
            return f"Raised its dividend {int(value)} years in a row."
        if field == "dividend_growth":
            return f"Dividend grew {value:.1f}% a year."
        if field == "market_cap":
            return f"Market value {_money(value)}."
    return None


def holding_reason(spec: dict[str, Any], holding: dict[str, Any], eligible: int) -> str:
    parts: list[str] = []
    values = holding["values"]
    for signal in backtest.spec_signals(spec):
        sentence = signal_sentence(signal, values)
        if sentence and sentence not in parts:
            parts.append(sentence)
    if "size" in values and not backtest.uses_signal(spec, "size"):
        parts.append(f"Estimated market value {_money(values['size'])}.")
    if eligible > 1:
        parts.append(f"Rank {holding['rank']} of {eligible}.")
    return " ".join(parts)


# -- dates --------------------------------------------------------------------


def _weekday_on_or_before(day: date) -> date:
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def _weekday_after(day: date) -> date:
    day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def next_rebalance(price_as_of: str) -> dict[str, str]:
    """The next month-end signal and the session it trades on. Weekends are skipped, market holidays are not known."""
    today = date.fromisoformat(price_as_of)
    last_day = date(today.year, today.month, month_calendar.monthrange(today.year, today.month)[1])
    signal = _weekday_on_or_before(last_day)
    if signal <= today:
        year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        signal = _weekday_on_or_before(date(year, month, month_calendar.monthrange(year, month)[1]))
    return {"signal_date": signal.isoformat(), "trade_date": _weekday_after(signal).isoformat(), "estimated": True}


# -- curve thinning -----------------------------------------------------------


def thin_curve(curve: dict[str, list[Any]]) -> dict[str, list[Any]]:
    """One point a week: the week's last close, and the deepest drawdown seen inside that week."""
    dates = curve["dates"]
    out: dict[str, list[Any]] = {"dates": [], "strategy": [], "benchmark": [], "dd_strategy": [], "dd_benchmark": []}
    peak_s = 100.0
    peak_b = 100.0
    low_s = 0.0
    low_b = 0.0
    for i in range(len(dates)):
        s = curve["strategy"][i]
        b = curve["benchmark"][i]
        peak_s = max(peak_s, s)
        peak_b = max(peak_b, b)
        low_s = min(low_s, s / peak_s - 1.0)
        low_b = min(low_b, b / peak_b - 1.0)
        last = i == len(dates) - 1
        if last or backtest.period_key(dates[i], "weekly") != backtest.period_key(dates[i + 1], "weekly"):
            out["dates"].append(dates[i])
            out["strategy"].append(round(s, 2))
            out["benchmark"].append(round(b, 2))
            out["dd_strategy"].append(round(low_s, 4))
            out["dd_benchmark"].append(round(low_b, 4))
            low_s = 0.0
            low_b = 0.0
    return out


def spark(curve: dict[str, list[Any]], points: int = 72) -> dict[str, list[float]]:
    count = len(curve["dates"])
    step = max(1, count // points)
    index = list(range(0, count, step))
    if index[-1] != count - 1:
        index.append(count - 1)
    return {
        "strategy": [round(curve["strategy"][i], 1) for i in index],
        "benchmark": [round(curve["benchmark"][i], 1) for i in index],
    }


def risk_label(strategy: dict[str, Any], benchmark: dict[str, Any]) -> dict[str, Any]:
    """Measured, not asserted: backtested volatility against the benchmark's over the same period."""
    vol = strategy.get("volatility")
    bench = benchmark.get("volatility")
    if not vol or not bench:
        return {"label": "Not measured yet", "level": "unknown", "ratio": None}
    ratio = vol / bench
    if ratio < 0.85:
        return {"label": "Smaller swings than the S&P 500", "level": "lower", "ratio": round(ratio, 2)}
    if ratio > 1.15:
        return {"label": "Bigger swings than the S&P 500", "level": "higher", "ratio": round(ratio, 2)}
    return {"label": "Swings like the S&P 500", "level": "similar", "ratio": round(ratio, 2)}


# -- one strategy -------------------------------------------------------------


def build_groups(instruments: list[dict[str, Any]], have_prices: set[str]) -> dict[str, dict[str, Any]]:
    covered = [item["ticker"] for item in instruments if item["ticker"] in have_prices]
    sp500 = [
        item["ticker"]
        for item in instruments
        if item["ticker"] in have_prices and "S&P 500" in (item.get("index_memberships") or [])
    ]
    return {
        "sp500": {
            "id": "sp500",
            "label": "S&P 500 stocks we cover",
            "description": f"{len(sp500)} of the roughly 500 companies in the S&P 500, as the index stands today",
            "kind": "stocks",
            "partial": True,
            "symbols": sorted(sp500),
        },
        "covered": {
            "id": "covered",
            "label": "US companies we cover",
            "description": f"{len(covered)} large, mid and small US companies, as our coverage list stands today",
            "kind": "stocks",
            "partial": False,
            "symbols": sorted(covered),
        },
        "sector_funds": {
            "id": "sector_funds",
            "label": "US sector funds",
            "description": "the eleven Select Sector SPDR funds",
            "kind": "funds",
            "partial": False,
            "symbols": sorted(symbol for symbol in SECTOR_FUNDS if symbol in have_prices),
        },
        "asset_classes": {
            "id": "asset_classes",
            "label": "asset-class funds",
            "description": "eleven funds covering stocks, real estate, bonds, gold and commodities",
            "kind": "funds",
            "partial": False,
            "symbols": sorted(symbol for symbol in ASSET_CLASS_FUNDS if symbol in have_prices),
        },
        "spy_only": {
            "id": "spy_only",
            "label": "the S&P 500 fund",
            "description": "one fund, SPY",
            "kind": "funds",
            "partial": False,
            "symbols": ["SPY"],
        },
    }


def full_spec(definition: dict[str, Any], group: dict[str, Any]) -> dict[str, Any]:
    spec = {key: value for key, value in definition["spec"].items() if key != "universe_extra"}
    spec["universe"] = {"id": group["id"], **definition["spec"].get("universe_extra", {})}
    spec.setdefault("rebalance", "monthly")
    spec.setdefault("cost_bps", COST_BPS)
    spec.setdefault("benchmark", BENCHMARK)
    return spec


def describe_basket(
    spec: dict[str, Any], picked: dict[str, Any], names: dict[str, str], sectors: dict[str, str]
) -> dict[str, Any]:
    holdings = []
    weight_sum = 0.0
    for holding in picked["holdings"]:
        weight_sum += holding["weight"]
        holdings.append(
            {
                "symbol": holding["symbol"],
                "name": names.get(holding["symbol"]),
                "sector": sectors.get(holding["symbol"]),
                "weight": backtest.r6(holding["weight"]),
                "rank": holding["rank"],
                "reason": holding_reason(spec, holding, picked["eligible"]),
            }
        )
    cash = max(0.0, 1.0 - weight_sum)
    if cash < 1e-9:
        cash = 0.0
    day = backtest.format_day(picked["signal_date"])
    note = None
    if not picked["market_ok"]:
        note = f"The S&P 500 fund closed below its {spec['market_filter']['ma_days']}-day average on {day}, so the rules hold cash."
    elif not holdings:
        note = f"Nothing passed the rules on {day}, so the rules hold cash."
    elif len(holdings) < spec["holdings"]:
        note = f"{len(holdings)} of {spec['holdings']} slots are filled. The rest is cash."
    return {
        "as_of": picked["signal_date"],
        "holdings": holdings,
        "cash_weight": backtest.r6(cash),
        "eligible": picked["eligible"],
        "candidates": picked["candidates"],
        "note": note,
    }


# -- rebalance notes ----------------------------------------------------------
#
# When the basket a strategy holds moves to a new month, the job compares it
# with the basket it published before and writes one record of what changed
# and why, in the strategy's own terms. No model call: every sentence comes
# from the rule and the numbers the rule read on the day the picks were made.

REBALANCE_COLLECTION = "tm_strategy_rebalances"
# A weight that moved by less than this (a tenth of a percentage point) did not change.
WEIGHT_STEP = 0.001
# How many tickers a sentence names before it says "and N more".
NAMED_IN_SENTENCE = 6

FIELD_WORDS = {
    "roic": "return on invested capital",
    "fcf_yield": "free cash flow yield",
    "dividend_yield": "dividend yield",
    "shareholder_yield": "dividends plus buybacks yield",
    "dividend_growth_years": "run of dividend raises",
    "dividend_growth": "dividend growth",
    "debt_to_equity": "debt to equity",
    "market_cap": "market value",
}


def _field_value(field: str, value: float) -> str:
    if field == "debt_to_equity":
        return f"{value:.2f} times equity"
    if field == "dividend_growth_years":
        return f"{int(value)} years"
    if field == "market_cap":
        return _money(value)
    return f"{value:.1f}%"


def _signal_words(signal: dict[str, Any]) -> str:
    """What one ranking signal measures, as a short noun phrase."""
    kind = signal["type"]
    if kind == "momentum":
        return f"{signal['months']}-month return"
    if kind == "low_volatility":
        return "steady prices"
    if kind == "trend":
        return f"distance above the {signal['ma_days']}-day average"
    if kind == "near_high":
        return f"closeness to the {signal['days']}-day high"
    if kind == "pullback":
        return f"fall over the last {signal['days']} sessions"
    if kind == "congress_net_buying":
        return "buying by members of Congress"
    if kind == "fundamental":
        return FIELD_WORDS.get(signal["field"], signal["field"].replace("_", " "))
    return "size"


def top_group(spec: dict[str, Any]) -> str:
    """The group the rules hold, in words: "the 25 with the highest 12-month return"."""
    slots = spec["holdings"]
    who = "the one" if slots == 1 else f"the {slots}"
    ranks = spec["rank"]
    if len(ranks) > 1:
        return f"{who} with the best combined rank on {kit_join([_signal_words(signal) for signal in ranks])}"
    signal = ranks[0]
    kind = signal["type"]
    if kind == "momentum":
        return f"{who} with the highest {signal['months']}-month return"
    if kind == "low_volatility":
        return f"{who} with the steadiest prices"
    if kind == "trend":
        return f"{who} furthest above {'its' if slots == 1 else 'their'} {signal['ma_days']}-day average"
    if kind == "near_high":
        return f"{who} closest to {'its' if slots == 1 else 'their'} {signal['days']}-day high"
    if kind == "pullback":
        return f"{who} that fell most over the last {signal['days']} sessions"
    if kind == "size":
        return "the largest" if slots == 1 else f"the {slots} largest"
    if kind == "congress_net_buying":
        return f"{who} with the most buying by members of Congress"
    if kind == "fundamental":
        lowest = signal["field"] == "debt_to_equity"
        return f"{who} with the {'lowest' if lowest else 'highest'} {_signal_words(signal)}"
    return who


def pool_words(spec: dict[str, Any]) -> str:
    """The filters a stock must pass before it is ranked, as a "from those ..." clause, or ""."""
    bits: list[str] = []
    for rule in spec["filters"]:
        kind = rule["type"]
        if kind == "trend" and rule["min"] == 0:
            bits.append(f"above their {rule['ma_days']}-day average")
        elif kind == "momentum" and rule["min"] == 0:
            bits.append(f"up over the last {rule['months']} months")
        elif kind == "congress_net_buying":
            bits.append("with more purchases than sales by members of Congress")
        elif kind == "fundamental":
            # Financial floors and limits are listed in the rules on the page; naming all of them here is too much.
            return ""
    return f", from those {kit_join(bits)}" if bits else ""


def kit_join(items: list[str]) -> str:
    items = [item for item in items if item]
    if len(items) <= 1:
        return "".join(items)
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])} and {items[-1]}"


def _named(symbols: list[str]) -> str:
    """Up to six tickers, then a count: "AAPL, MSFT and 4 more"."""
    if len(symbols) <= NAMED_IN_SENTENCE:
        return kit_join(symbols)
    shown = symbols[: NAMED_IN_SENTENCE - 1]
    return f"{', '.join(shown)} and {len(symbols) - len(shown)} more"


def _filter_miss(rule: dict[str, Any], value: float) -> str:
    """Why one stock failed one filter, with the number the rule read."""
    kind = rule["type"]
    low = rule["min"] is not None and value < rule["min"]
    if kind == "trend":
        side = "below" if value < 0 else "above"
        if low and rule["min"] == 0:
            return f"Closed {_pct(value)} below its {rule['ma_days']}-day average, and the rules only hold ones above it."
        return f"Closed {_pct(value)} {side} its {rule['ma_days']}-day average, outside the rule."
    if kind == "momentum":
        direction = "Down" if value < 0 else "Up"
        if low and rule["min"] == 0:
            return f"{direction} {_pct(value)} over the last {rule['months']} months, and the rules only hold ones that are up."
        return f"{direction} {_pct(value)} over the last {rule['months']} months, outside the rule."
    if kind == "congress_net_buying":
        return f"Members of Congress no longer filed more purchases than sales of it in the last {rule['window_days']} days."
    if kind == "fundamental":
        field = rule["field"]
        words = FIELD_WORDS.get(field, field.replace("_", " "))
        if low:
            return f"Its {words} is {_field_value(field, value)}, under the rule's floor of {_field_value(field, rule['min'])}."
        if rule["max"] is not None and value > rule["max"]:
            return f"Its {words} is {_field_value(field, value)}, over the rule's limit of {_field_value(field, rule['max'])}."
    return "It no longer passes the rules."


def _filter_group(rule: dict[str, Any], many: bool) -> str:
    """The same miss for a group, in a "left because ..." clause."""
    kind = rule["type"]
    if kind == "trend":
        return f"{'they' if many else 'it'} closed below {'their' if many else 'its'} {rule['ma_days']}-day average"
    if kind == "momentum":
        return f"{'they are' if many else 'it is'} down over the last {rule['months']} months"
    if kind == "congress_net_buying":
        return f"members of Congress no longer bought more of {'them' if many else 'it'} than they sold"
    if kind == "fundamental":
        words = FIELD_WORDS.get(rule["field"], rule["field"].replace("_", " "))
        return f"{'their' if many else 'its'} {words} is outside the rule"
    return f"{'they' if many else 'it'} no longer {'pass' if many else 'passes'} the rules"


def explain_exit(
    spec: dict[str, Any], panel: backtest.Panel, index: int, symbol: str, ranked: dict[str, dict[str, Any]], eligible: int
) -> tuple[str, str, str]:
    """Why a stock held before is not held now: (cause, group key, the reason in a sentence)."""
    if symbol in ranked:
        holding = ranked[symbol]
        evidence = [
            sentence
            for sentence in (signal_sentence(signal, holding["values"]) for signal in spec["rank"])
            if sentence
        ]
        rank = f"Rank {holding['rank']} of {eligible}, and the rules hold {spec['holdings']}."
        return "rank", "rank", " ".join(evidence + [rank])
    if symbol not in panel.px:
        return "pool", "pool", "No longer in the pool the rules pick from."
    price = panel.px[symbol][index]
    seen = panel.obs[symbol][index]
    if backtest.is_nan(price) or price <= 0 or seen < 0 or index - seen > backtest.MAX_STALE_SESSIONS:
        return "data", "stale", "We have no recent price for it."
    top = spec["universe"]["top_by_size"]
    if top is not None:
        sizes: list[tuple[str, float]] = []
        for other in panel.universe:
            other_price = panel.px[other][index]
            if backtest.is_nan(other_price) or other_price <= 0:
                continue
            value = backtest.signal_value({"type": "size"}, other, index, panel)
            if not backtest.is_nan(value):
                sizes.append((other, value))
        sizes.sort(key=lambda item: (-item[1], item[0]))
        if symbol not in {item[0] for item in sizes[:top]}:
            return "size", "size", f"No longer one of the {top} largest companies we cover."
    for rule in spec["filters"]:
        value = backtest.signal_value(rule, symbol, index, panel)
        if backtest.is_nan(value):
            if rule["type"] == "fundamental":
                return "data", "data", "We no longer have the company figures the rules need."
            return "data", "data", "There is not enough price history to measure it."
        if (rule["min"] is not None and value < rule["min"]) or (rule["max"] is not None and value > rule["max"]):
            return "filter", f"filter:{backtest.signal_key(rule)}", _filter_miss(rule, value)
    return "data", "data", "We could not measure it on the day the picks were made."


def _weights(basket: dict[str, Any] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    for holding in (basket or {}).get("holdings") or []:
        weight = _num(holding.get("weight"))
        if isinstance(holding.get("symbol"), str) and weight is not None:
            out[holding["symbol"]] = weight
    return out


def is_new_rebalance(previous_basket: dict[str, Any] | None, basket: dict[str, Any]) -> bool:
    """The basket moved to a later month: the monthly rebalance happened since the last publish."""
    before = str((previous_basket or {}).get("as_of") or "")
    now = str(basket.get("as_of") or "")
    return bool(before) and bool(now) and now > before and now[0:7] != before[0:7]


def rebalance_record(
    definition: dict[str, Any],
    spec: dict[str, Any],
    panel: backtest.Panel,
    group: dict[str, Any],
    previous_basket: dict[str, Any] | None,
    basket: dict[str, Any],
    last_info: dict[str, Any] | None,
    names: dict[str, str],
    generated_at: str,
) -> dict[str, Any] | None:
    """What changed at this rebalance and why, or None when it is not a new rebalance or nothing changed."""
    if not is_new_rebalance(previous_basket, basket):
        return None
    signal_date = basket["as_of"]
    if signal_date not in panel.calendar:
        return None
    before = _weights(previous_basket)
    after = _weights(basket)
    before_cash = _num((previous_basket or {}).get("cash_weight")) or 0.0
    after_cash = _num(basket.get("cash_weight")) or 0.0
    added_symbols = [h["symbol"] for h in basket["holdings"] if h["symbol"] not in before]
    removed_symbols = [s for s in before if s not in after]
    kept_symbols = [h["symbol"] for h in basket["holdings"] if h["symbol"] in before]
    reweighted = [symbol for symbol in kept_symbols if abs(after[symbol] - before[symbol]) >= WEIGHT_STEP]
    if not added_symbols and not removed_symbols and not reweighted and abs(after_cash - before_cash) < WEIGHT_STEP:
        return None

    index = panel.calendar.index(signal_date)
    # Every stock that passed the rules, ranked: the same selection with a slot for each.
    full = backtest.select(dict(spec, holdings=max(1, len(panel.universe))), panel, index)
    ranked = {holding["symbol"]: holding for holding in full["holdings"]}
    market_ok = full["market_ok"]
    stocks = group["kind"] == "stocks"
    unit, units = ("stock", "stocks") if stocks else ("fund", "funds")
    by_symbol = {h["symbol"]: h for h in basket["holdings"]}

    # Leavers that still passed the rules read best nearest the cut first; the rest keep the old basket's order.
    removed_symbols.sort(key=lambda symbol: ranked[symbol]["rank"] if symbol in ranked else len(ranked) + 1)
    removed: list[dict[str, Any]] = []
    groups: dict[str, list[str]] = {}
    group_rules: dict[str, dict[str, Any]] = {}
    for symbol in removed_symbols:
        if not market_ok:
            cause, key = "market", "market"
            reason = f"Sold with everything else: the S&P 500 fund closed below its {spec['market_filter']['ma_days']}-day average."
        else:
            cause, key, reason = explain_exit(spec, panel, index, symbol, ranked, full["eligible"])
        if key.startswith("filter:"):
            group_rules[key] = next(rule for rule in spec["filters"] if f"filter:{backtest.signal_key(rule)}" == key)
        groups.setdefault(key, []).append(symbol)
        removed.append(
            {"symbol": symbol, "name": names.get(symbol), "previous_weight": backtest.r6(before[symbol]), "cause": cause, "reason": reason}
        )

    rule_sentence = f"Each month the rules hold {top_group(spec)}{pool_words(spec)}."
    sentences: list[str] = []
    if not market_ok:
        sentences.append(
            f"The S&P 500 fund closed below its {spec['market_filter']['ma_days']}-day average on {backtest.format_day(signal_date)}, "
            "so the rules sold everything and hold cash until it closes back above."
        )
    else:
        sentences.append(rule_sentence)
        market_exit_before = str((previous_basket or {}).get("note") or "").startswith("The S&P 500 fund closed below")
        if added_symbols and not before and spec["market_filter"] is not None and market_exit_before:
            sentences.append(f"The S&P 500 fund closed back above its {spec['market_filter']['ma_days']}-day average, so the rules bought again.")
        if added_symbols:
            sentences.append(f"{_named(added_symbols)} came in.")
        for key, symbols in groups.items():
            many = len(symbols) > 1
            if key == "rank":
                sentences.append(f"{_named(symbols)} left because {'they' if many else 'it'} slipped out of that group.")
            elif key == "size":
                sentences.append(
                    f"{_named(symbols)} left because {'they are' if many else 'it is'} no longer among the {spec['universe']['top_by_size']} largest."
                )
            elif key == "pool":
                sentences.append(f"{_named(symbols)} left because {'they are' if many else 'it is'} no longer in the pool.")
            elif key == "stale":
                sentences.append(f"{_named(symbols)} left because we have no recent price for {'them' if many else 'it'}.")
            elif key == "data":
                sentences.append(f"{_named(symbols)} left because we could not measure {'them' if many else 'it'} on the rule's terms.")
            else:
                sentences.append(f"{_named(symbols)} left because {_filter_group(group_rules[key], many)}.")
        if kept_symbols and (added_symbols or removed_symbols):
            if len(kept_symbols) == 1:
                sentences.append("One stayed at a new weight." if reweighted else "One stayed.")
            else:
                stayed = f"The other {len(kept_symbols)} stayed"
                sentences.append(f"{stayed}, {len(reweighted)} of them at a new weight." if reweighted else f"{stayed}.")
        elif reweighted:
            sentences.append(f"No {unit} came in or left. {len(reweighted)} changed weight.")
        if basket.get("note") and after_cash >= WEIGHT_STEP:
            sentences.append(str(basket["note"]))

    if not market_ok:
        headline = f"Sold every {unit} and moved to cash."
    elif not before and added_symbols:
        headline = f"Bought {len(added_symbols)} {unit if len(added_symbols) == 1 else units} after a spell in cash."
    else:
        bits = []
        if added_symbols:
            bits.append(f"{len(added_symbols)} {unit if len(added_symbols) == 1 else units} came in")
        if removed_symbols:
            bits.append(f"{len(removed_symbols)} left" if added_symbols else f"{len(removed_symbols)} {unit if len(removed_symbols) == 1 else units} left")
        if kept_symbols:
            bits.append(f"{len(kept_symbols)} stayed")
        headline = (kit_join(bits) + ".").capitalize() if added_symbols or removed_symbols else f"Same {units}, {len(reweighted)} at a new weight."

    trade_date = (last_info or {}).get("trade_date") if (last_info or {}).get("signal_date") == signal_date else None
    return {
        "slug": definition["slug"],
        "name": definition["name"],
        "kind": group["kind"],
        "date": trade_date or signal_date,
        "signal_date": signal_date,
        "trade_date": trade_date,
        "previous_as_of": previous_basket.get("as_of"),
        "headline": headline,
        "why": " ".join(sentences),
        "rule": rule_sentence,
        "added": [
            {
                "symbol": symbol,
                "name": by_symbol[symbol].get("name"),
                "weight": by_symbol[symbol]["weight"],
                "rank": by_symbol[symbol].get("rank"),
                "reason": by_symbol[symbol].get("reason") or "",
            }
            for symbol in added_symbols
        ],
        "removed": removed,
        "kept": [
            {
                "symbol": symbol,
                "name": by_symbol[symbol].get("name"),
                "weight": by_symbol[symbol]["weight"],
                "previous_weight": backtest.r6(before[symbol]),
            }
            for symbol in kept_symbols
        ],
        "reweighted": len(reweighted),
        "held": len(basket["holdings"]),
        "previously_held": len(before),
        "cash_weight": backtest.r6(after_cash),
        "previous_cash_weight": backtest.r6(before_cash),
        "market_ok": market_ok,
        "source": SOURCE,
        "generated_at": generated_at,
    }


def rebalance_path(record: dict[str, Any]) -> str:
    return f"{REBALANCE_COLLECTION}/{record['slug']}__{record['signal_date']}"


def run_strategy(
    definition: dict[str, Any],
    group: dict[str, Any],
    data_base: dict[str, Any],
    names: dict[str, str],
    sectors: dict[str, str],
    previous: dict[str, Any] | None,
    previous_run: dict[str, Any] | None,
    today: str,
    *,
    rebalances_out: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    raw_spec = full_spec(definition, group)
    spec = backtest.normalize_spec(raw_spec)
    data = dict(
        data_base,
        universe=group["symbols"],
        universe_label=group["label"],
        universe_kind=group["kind"],
        universe_partial=group["partial"],
    )
    panel = backtest.Panel(spec, data)
    calendar = panel.calendar
    price_as_of = calendar[-1]
    published_at = (previous or {}).get("published_at") or today
    live_since = (previous or {}).get("live", {}).get("since") or today
    testable = backtest.is_backtestable(spec)

    result = None
    backtest_doc = None
    rebalances: list[dict[str, Any]] = []
    try:
        if testable:
            result = backtest.run_backtest(raw_spec, data)
    except backtest.BacktestError as error:
        log(f"{definition['slug']}: no backtest ({error})")

    # The basket held now is the one chosen at the last completed rebalance.
    if result is not None:
        rebalances = result["rebalances"]
        last_rebalance = rebalances[-1]
        signal_index = calendar.index(last_rebalance["signal_date"])
        picked = backtest.select(spec, panel, signal_index)
        last_info = {"signal_date": last_rebalance["signal_date"], "trade_date": last_rebalance["trade_date"]}
    else:
        picked = backtest.select(spec, panel, panel.size - 1)
        last_info = None
    basket = describe_basket(spec, picked, names, sectors)

    decisions: list[dict[str, Any]] = list((previous_run or {}).get("decisions") or [])
    started = bool(decisions) and backtest.simulate_decisions(
        decisions, data_base["prices"], benchmark=spec["benchmark"], cost_bps=spec["cost_bps"]
    ) is not None
    if result is None and started and previous and price_as_of[0:7] == decisions[-1]["signal_date"][0:7]:
        # Rules on today's financials are only re-run at a rebalance. Between
        # rebalances the page shows the basket that was frozen, not today's picks.
        basket = previous["basket"]

    if result is not None:
        strategy_stats = result["summary"]["strategy"]
        benchmark_stats = result["summary"]["benchmark"]
        backtest_doc = {
            "label": BACKTEST_LABEL,
            "period": result["period"],
            "strategy": strategy_stats,
            "benchmark": benchmark_stats,
            "years": result["years"],
            "hit_rate": result["hit_rate"],
            "worst_year": result["worst_year"],
            "best_year": result["best_year"],
            "turnover": result["turnover"],
            "costs": result["costs"],
            "cash": result["cash"],
            "universe": result["universe"],
            "curve": thin_curve(result["curve"]),
            "spark": spark(result["curve"]),
            "recent_rebalances": [
                {
                    "signal_date": item["signal_date"],
                    "trade_date": item["trade_date"],
                    "added": item["added"],
                    "dropped": item["dropped"],
                    "held": len(item["holdings"]),
                    "turnover": item["turnover"],
                    "cash": item["cash"],
                    "market_ok": item["market_ok"],
                }
                for item in rebalances[-18:]
            ][::-1],
            "caveats": result["caveats"],
        }
        risk = risk_label(strategy_stats, benchmark_stats)
        caveats = result["caveats"]
    else:
        risk = risk_label({}, {})
        flags = ["live_only", "survivorship" if group["kind"] == "stocks" else "fixed_funds", "definitions"]
        caveats = backtest.build_caveats(
            flags,
            {"live_since": backtest.format_day(live_since), "candidates": str(len(panel.universe))},
        )

    # Live record: frozen decisions, valued forward. Never rewritten.
    frozen = [{"symbol": h["symbol"], "weight": h["weight"]} for h in basket["holdings"]]
    if not decisions:
        decisions.append({"signal_date": today, "holdings": frozen, "recorded_at": today, "kind": "start"})
    elif not started and len(decisions) == 1 and decisions[0].get("kind") == "start":
        # Nothing has filled yet, so the starting basket still follows the latest
        # completed close. It is fixed for good once the first session fills.
        decisions[0] = dict(decisions[0], holdings=frozen, recorded_at=today)
    else:
        last_signal = decisions[-1]["signal_date"]
        if result is not None:
            for item in rebalances:
                if item["signal_date"] > last_signal:
                    decisions.append(
                        {
                            "signal_date": item["signal_date"],
                            "holdings": [{"symbol": h["symbol"], "weight": h["weight"]} for h in item["holdings"]],
                            "recorded_at": today,
                            "kind": "rebalance",
                        }
                    )
        elif price_as_of[0:7] != last_signal[0:7]:
            decisions.append({"signal_date": price_as_of, "holdings": frozen, "recorded_at": today, "kind": "rebalance"})
    live_run = backtest.simulate_decisions(decisions, data_base["prices"], benchmark=spec["benchmark"], cost_bps=spec["cost_bps"])
    if live_run is None:
        live = {
            "since": live_since,
            "sessions": 0,
            "first_fill_date": None,
            "last_date": None,
            "strategy_return": None,
            "benchmark_return": None,
            "curve": None,
            "decisions": len(decisions),
            "note": "The live record begins at the close of the first session after publication. Nothing to show yet.",
        }
    else:
        live = {
            "since": live_since,
            "sessions": live_run["sessions"],
            "first_fill_date": live_run["first_fill_date"],
            "last_date": live_run["last_date"],
            "strategy_return": live_run["strategy_return"],
            "benchmark_return": live_run["benchmark_return"],
            "curve": live_run["curve"],
            "decisions": len(decisions),
            "note": None,
        }
    if result is None and last_info is None:
        last_info = {"signal_date": decisions[-1]["signal_date"], "trade_date": None}

    generated_at = datetime.now(timezone.utc).isoformat()
    doc = {
        "slug": definition["slug"],
        "name": definition["name"],
        "style": definition["style"],
        "tagline": definition["tagline"],
        "summary": definition["summary"],
        "rules": definition["rules"],
        "watch_out": definition["watch_out"],
        "status": "backtested" if backtest_doc else "live_only",
        "universe": {
            "id": group["id"],
            "label": group["label"],
            "description": group["description"],
            "kind": group["kind"],
            "count": len(panel.universe),
            "top_by_size": spec["universe"]["top_by_size"],
        },
        "rebalance": spec["rebalance"],
        "cost_bps": spec["cost_bps"],
        "benchmark": spec["benchmark"],
        "spec": spec,
        "risk": risk,
        "basket": basket,
        "backtest": backtest_doc,
        "caveats": caveats,
        "live": live,
        "last_rebalance": last_info,
        "next_rebalance": next_rebalance(price_as_of),
        "price_as_of": price_as_of,
        "source": SOURCE,
        "published_at": published_at,
        "generated_at": generated_at,
    }
    run_doc = {
        "slug": definition["slug"],
        "generated_at": generated_at,
        "published_at": published_at,
        "price_as_of": price_as_of,
        "spec": spec,
        "decisions": decisions,
        "rebalances": [
            {
                "signal_date": item["signal_date"],
                "trade_date": item["trade_date"],
                "holdings": [[h["symbol"], h["weight"]] for h in item["holdings"]],
                "added": item["added"],
                "dropped": item["dropped"],
                "turnover": item["turnover"],
                "cash": item["cash"],
                "eligible": item["eligible"],
                "market_ok": item["market_ok"],
            }
            for item in rebalances
        ],
    }
    # A backtestable strategy whose backtest failed tonight fell back to today's picks: that is not a
    # scheduled rebalance, so it writes no note. And the note can never stop the strategy from publishing.
    if rebalances_out is not None and (result is not None or not testable):
        try:
            record = rebalance_record(
                definition, spec, panel, group, (previous or {}).get("basket"), basket, last_info, names, generated_at
            )
        except Exception as error:  # noqa: BLE001
            log(f"{definition['slug']}: no rebalance note ({type(error).__name__}: {error})")
            record = None
        if record is not None:
            rebalances_out.append(record)
    return doc, run_doc


# -- the job ------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="run everything, write nothing")
    parser.add_argument("--only", action="append", default=[], help="run only this slug (repeatable)")
    parser.add_argument("--no-price-write", action="store_true", help="do not write refreshed prices back to the store")
    parser.add_argument("--prices-only", action="store_true", help="refresh and store prices, then stop")
    args = parser.parse_args(argv)
    if args.prices_only and args.no_price_write:
        parser.error("--prices-only and --no-price-write leave nothing to do")

    store = DocStore.from_env()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    instruments = load_instruments()
    tickers = [item["ticker"] for item in instruments]
    names = {item["ticker"]: item.get("name") or item["ticker"] for item in instruments}
    names.update(FUND_NAMES)
    sectors = {item["ticker"]: item.get("sector") or "" for item in instruments}

    # The popular funds ride along so their pages (1-year return, chart) stay current; the
    # strategies never read them (build_groups below only takes covered stocks).
    wanted = list(dict.fromkeys([BENCHMARK] + sorted(FUND_NAMES) + tickers + popular_fund_tickers()))
    log(f"prices: {len(wanted)} symbols")
    fetch_started = time.monotonic()
    series = prices.load_many(wanted, log=False)
    log(f"prices: fetched in {time.monotonic() - fetch_started:.0f}s")
    price_data: dict[str, dict[str, Any]] = {}
    for symbol, document in series.items():
        dates, closes = completed_sessions(document)
        if len(dates) >= 2:
            price_data[symbol] = {"dates": dates, "closes": closes}
    missing = [symbol for symbol in wanted if symbol not in price_data]
    log(f"prices: {len(price_data)} loaded, through {price_data[BENCHMARK]['dates'][-1] if BENCHMARK in price_data else 'n/a'}, {len(missing)} without history {missing[:20]}")
    if BENCHMARK not in price_data:
        log("no SPY history, stopping")
        return 1
    if not (args.dry_run or args.no_price_write):
        sync_prices(store, series)
    if args.prices_only:
        return 0

    facts = load_facts(store, tickers)
    size_factors: dict[str, float] = {}
    fundamentals: dict[str, dict[str, float]] = {}
    for ticker in tickers:
        if ticker not in price_data:
            continue
        last_close = price_data[ticker]["closes"][-1]
        figures = fundamentals_from_facts(facts.get(ticker) or {}, last_close)
        if figures:
            fundamentals[ticker] = figures
        cap = figures.get("market_cap")
        if cap and last_close > 0:
            size_factors[ticker] = cap / last_close
    events = load_congress_events(store, set(tickers))
    log(f"facts: {len(facts)} docs, {len(size_factors)} size proxies, {len(events)} congress filings")

    groups = build_groups(instruments, set(price_data))
    data_base = {"prices": price_data, "size_factors": size_factors, "events": events, "fundamentals": fundamentals}

    selected = [item for item in STRATEGIES if not args.only or item["slug"] in args.only]
    slugs = [item["slug"] for item in selected]
    previous = store.get_many([f"tm_strategies/{slug}" for slug in slugs])
    previous_runs = store.get_many([f"tm_strategy_runs/{slug}" for slug in slugs])

    docs: list[tuple[str, dict[str, Any]]] = []
    for order, definition in enumerate(STRATEGIES):
        if definition not in selected:
            continue
        slug = definition["slug"]
        changes: list[dict[str, Any]] = []
        doc, run_doc = run_strategy(
            definition,
            groups[definition["universe"]],
            data_base,
            names,
            sectors,
            previous.get(f"tm_strategies/{slug}"),
            previous_runs.get(f"tm_strategy_runs/{slug}"),
            today,
            rebalances_out=changes,
        )
        doc["order"] = order
        # The change record goes first: once the new basket is stored, the next run compares against it and
        # would not see this rebalance again.
        for record in changes:
            docs.append((rebalance_path(record), record))
            log(f"{slug}: rebalanced on {record['date']}: {record['headline']}")
        docs.append((f"tm_strategies/{slug}", doc))
        docs.append((f"tm_strategy_runs/{slug}", run_doc))
        test = doc["backtest"]
        if test:
            s = test["strategy"]
            b = test["benchmark"]
            log(
                f"{slug}: {test['period']['start']}..{test['period']['end']} "
                f"cagr {s['annualized_return']} vs {b['annualized_return']}, vol {s['volatility']}, sharpe {s['sharpe']} vs {b['sharpe']}, "
                f"maxdd {s['max_drawdown']}, turnover {test['turnover']['annual']}, holds {len(doc['basket']['holdings'])}, "
                f"{len(json.dumps(doc)) // 1024}KB"
            )
        else:
            log(f"{slug}: live only, holds {len(doc['basket']['holdings'])} of {doc['basket']['eligible']} eligible")

    universe_doc = {
        "market": "US",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "price_as_of": price_data[BENCHMARK]["dates"][-1],
        "groups": list(groups.values()),
        "names": {symbol: names[symbol] for symbol in sorted(price_data) if symbol in names},
        "size_factors": {symbol: round(value, 2) for symbol, value in sorted(size_factors.items())},
        "events": events,
        "events_start": events[0]["date"] if events else None,
        "missing_prices": missing,
    }
    if not args.only:
        docs.append(("tm_backtest_universe/US", universe_doc))

    # Every note of the run carries the same time, taken just before the write: the mail job waits
    # until that is half an hour old, so one email has every strategy that rebalanced today.
    stamped = datetime.now(timezone.utc).isoformat()
    for path, data in docs:
        if path.startswith(f"{REBALANCE_COLLECTION}/"):
            data["generated_at"] = stamped

    if args.dry_run:
        log(f"dry run: would write {len(docs)} documents")
        return 0
    written = write_with_retry(store, docs)
    log(f"wrote {written} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
