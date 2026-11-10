"""Multi-asset market coverage: indices, ETFs, rates, commodities, FX, crypto
and prediction markets, from free public sources, written to the document store.

Run it::

    python3 -m backend.agentdata.markets                  # everything
    python3 -m backend.agentdata.markets --only rates,fx  # some classes
    python3 -m backend.agentdata.markets --dry-run        # fetch and report, write nothing

Sources (no API keys):

* Yahoo's public chart endpoint: indices, ETFs, commodity futures, FX.
* US Treasury daily par yield curve CSV: rates and the 2s10s spread.
* CoinGecko public API: crypto price, market cap, volume, history.
* Kalshi and Polymarket public read APIs: prediction market odds, their daily
  history and the resolution rules.
* Yahoo's quoteSummary endpoint (cookie + crumb, still keyless): ETF expense
  ratio, assets and top 10 holdings.
* Cboe's public CDN: the VIX family (9 day to 1 year), VVIX, SKEW and the daily
  put/call ratios. This is the whole of the "options" class: summary data only,
  no chains and no per-contract quotes.

Collections (all additive, nothing is deleted):

* ``tm_market_assets/{id}``     slim asset doc with a ~64 point sparkline.
* ``tm_markets_series/{id}``    the full ~1 year daily series for the detail chart.
* ``tm_markets_curves/treasury`` today's yield curve next to a month and a year ago.
* ``tm_markets_curves/vix``     implied volatility by horizon (9 days to 1 year).
* ``tm_prediction_markets/{id}`` one doc per prediction market event.
* ``tm_prediction_history/{id}`` daily probability history of its leading outcomes.
* ``tm_markets_meta/latest``    the ids of the current run, counts and failures.

The app reads the id lists in ``tm_markets_meta/latest`` so a market that has
closed or an asset that is dropped from the config stops showing without a delete.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import http.cookiejar
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from .store import DocStore

ASSETS_COLLECTION = "tm_market_assets"
SERIES_COLLECTION = "tm_markets_series"
CURVES_COLLECTION = "tm_markets_curves"
META_COLLECTION = "tm_markets_meta"
PREDICTION_COLLECTION = "tm_prediction_markets"
PREDICTION_HISTORY_COLLECTION = "tm_prediction_history"

CLASSES = ("index", "etf", "rate", "commodity", "fx", "crypto", "option", "prediction")

_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "markets"
# Yahoo rate-limits full browser user agents on this endpoint; the short form is accepted.
_YAHOO_UA = "Mozilla/5.0"
_APP_UA = "stocksbrew-markets/1.0 (+https://www.stocksbrew.online)"
_SPARK_POINTS = 64
_HISTORY_DAYS = 400

# ---------------------------------------------------------------------------
# What we cover
# ---------------------------------------------------------------------------

INDICES = [
    # id, yahoo symbol, display symbol, name, unit
    ("sp500", "^GSPC", "SPX", "S&P 500", "pts"),
    ("nasdaq100", "^NDX", "NDX", "Nasdaq 100", "pts"),
    ("dow", "^DJI", "DJI", "Dow Jones Industrial Average", "pts"),
    ("russell2000", "^RUT", "RUT", "Russell 2000", "pts"),
    ("vix", "^VIX", "VIX", "CBOE Volatility Index", "pts"),
]

ETFS = [
    # ticker, name, group
    ("SPY", "SPDR S&P 500 ETF", "broad"),
    ("QQQ", "Invesco QQQ (Nasdaq 100)", "broad"),
    ("IWM", "iShares Russell 2000 ETF", "broad"),
    ("DIA", "SPDR Dow Jones Industrial Average ETF", "broad"),
    ("VTI", "Vanguard Total Stock Market ETF", "broad"),
    ("EFA", "iShares MSCI EAFE ETF (developed ex-US)", "broad"),
    ("EEM", "iShares MSCI Emerging Markets ETF", "broad"),
    ("XLK", "Technology Select Sector SPDR", "sector"),
    ("XLF", "Financial Select Sector SPDR", "sector"),
    ("XLE", "Energy Select Sector SPDR", "sector"),
    ("XLV", "Health Care Select Sector SPDR", "sector"),
    ("XLI", "Industrial Select Sector SPDR", "sector"),
    ("XLY", "Consumer Discretionary Select Sector SPDR", "sector"),
    ("XLP", "Consumer Staples Select Sector SPDR", "sector"),
    ("XLU", "Utilities Select Sector SPDR", "sector"),
    ("XLB", "Materials Select Sector SPDR", "sector"),
    ("XLRE", "Real Estate Select Sector SPDR", "sector"),
    ("XLC", "Communication Services Select Sector SPDR", "sector"),
    ("SMH", "VanEck Semiconductor ETF", "sector"),
    ("TLT", "iShares 20+ Year Treasury Bond ETF", "bond"),
    ("IEF", "iShares 7-10 Year Treasury Bond ETF", "bond"),
    ("SHY", "iShares 1-3 Year Treasury Bond ETF", "bond"),
    ("LQD", "iShares Investment Grade Corporate Bond ETF", "bond"),
    ("HYG", "iShares High Yield Corporate Bond ETF", "bond"),
    ("GLD", "SPDR Gold Shares", "commodity"),
    ("SLV", "iShares Silver Trust", "commodity"),
    ("USO", "United States Oil Fund", "commodity"),
    ("VOO", "Vanguard S&P 500 ETF", "broad"),
    ("RSP", "Invesco S&P 500 Equal Weight ETF", "broad"),
    ("SCHD", "Schwab US Dividend Equity ETF", "broad"),
    ("ARKK", "ARK Innovation ETF", "thematic"),
    ("SOXX", "iShares Semiconductor ETF", "thematic"),
    ("IGV", "iShares Expanded Tech-Software ETF", "thematic"),
    ("BOTZ", "Global X Robotics & Artificial Intelligence ETF", "thematic"),
    ("CIBR", "First Trust Nasdaq Cybersecurity ETF", "thematic"),
    ("XBI", "SPDR S&P Biotech ETF", "thematic"),
    ("KRE", "SPDR S&P Regional Banking ETF", "thematic"),
    ("ITA", "iShares US Aerospace & Defense ETF", "thematic"),
    ("XHB", "SPDR S&P Homebuilders ETF", "thematic"),
    ("JETS", "US Global Jets ETF", "thematic"),
    ("URA", "Global X Uranium ETF", "thematic"),
    ("TAN", "Invesco Solar ETF", "thematic"),
    ("GDX", "VanEck Gold Miners ETF", "thematic"),
    ("KWEB", "KraneShares CSI China Internet ETF", "thematic"),
    ("VNQ", "Vanguard Real Estate ETF", "thematic"),
    ("IBIT", "iShares Bitcoin Trust ETF", "thematic"),
]

# Cboe index history files: id, file symbol, display symbol, name, horizon in days (None: not a point on the curve)
CBOE_INDICES = [
    ("vix9d", "VIX9D", "VIX9D", "9-day implied volatility", 9),
    ("vix3m", "VIX3M", "VIX3M", "3-month implied volatility", 93),
    ("vix6m", "VIX6M", "VIX6M", "6-month implied volatility", 184),
    ("vix1y", "VIX1Y", "VIX1Y", "1-year implied volatility", 365),
    ("vvix", "VVIX", "VVIX", "Volatility of the VIX", None),
    ("skew", "SKEW", "SKEW", "Cboe SKEW index (tail risk pricing)", None),
]

# Cboe daily market statistics: id, ratio name, section with the volumes, display symbol, name
CBOE_PUT_CALL = [
    ("pc-total", "TOTAL PUT/CALL RATIO", "SUM OF ALL PRODUCTS", "P/C ALL", "Put/call ratio, all Cboe options"),
    ("pc-equity", "EQUITY PUT/CALL RATIO", "EQUITY OPTIONS", "P/C EQ", "Put/call ratio, single-stock options"),
    ("pc-index", "INDEX PUT/CALL RATIO", "INDEX OPTIONS", "P/C IDX", "Put/call ratio, index options"),
    ("pc-spx", "SPX + SPXW PUT/CALL RATIO", "SPX + SPXW", "P/C SPX", "Put/call ratio, S&P 500 options"),
]

# Treasury CSV column -> (asset id or None, tenor label, long label, months)
TREASURY_TENORS = [
    ("1 Mo", None, "1M", "1 month", 1),
    ("3 Mo", "us3m", "3M", "3 month", 3),
    ("6 Mo", None, "6M", "6 month", 6),
    ("1 Yr", "us1y", "1Y", "1 year", 12),
    ("2 Yr", "us2y", "2Y", "2 year", 24),
    ("3 Yr", None, "3Y", "3 year", 36),
    ("5 Yr", "us5y", "5Y", "5 year", 60),
    ("7 Yr", None, "7Y", "7 year", 84),
    ("10 Yr", "us10y", "10Y", "10 year", 120),
    ("20 Yr", None, "20Y", "20 year", 240),
    ("30 Yr", "us30y", "30Y", "30 year", 360),
]

COMMODITIES = [
    # id, front symbol, root, exchange suffix, contract months, name, unit
    ("gold", "GC=F", "GC", "CMX", "GJMQVZ", "Gold", "USD/oz"),
    ("silver", "SI=F", "SI", "CMX", "HKNUZ", "Silver", "USD/oz"),
    ("copper", "HG=F", "HG", "CMX", "HKNUZ", "Copper", "USD/lb"),
    ("wti", "CL=F", "CL", "NYM", "FGHJKMNQUVXZ", "WTI crude oil", "USD/bbl"),
    ("brent", "BZ=F", "BZ", "NYM", "FGHJKMNQUVXZ", "Brent crude oil", "USD/bbl"),
    ("natgas", "NG=F", "NG", "NYM", "FGHJKMNQUVXZ", "Natural gas (Henry Hub)", "USD/MMBtu"),
]

FX = [
    # id, yahoo symbol, display symbol, name
    ("dxy", "DX-Y.NYB", "DXY", "US Dollar Index"),
    ("eurusd", "EURUSD=X", "EUR/USD", "Euro / US dollar"),
    ("usdjpy", "USDJPY=X", "USD/JPY", "US dollar / Japanese yen"),
    ("gbpusd", "GBPUSD=X", "GBP/USD", "British pound / US dollar"),
    ("usdcad", "USDCAD=X", "USD/CAD", "US dollar / Canadian dollar"),
    ("audusd", "AUDUSD=X", "AUD/USD", "Australian dollar / US dollar"),
    ("usdchf", "USDCHF=X", "USD/CHF", "US dollar / Swiss franc"),
    ("usdcny", "USDCNY=X", "USD/CNY", "US dollar / Chinese yuan"),
    ("usdinr", "USDINR=X", "USD/INR", "US dollar / Indian rupee"),
]

CRYPTO = [
    # id, coingecko id, symbol, yahoo fallback symbol
    ("btc", "bitcoin", "BTC", "BTC-USD"),
    ("eth", "ethereum", "ETH", "ETH-USD"),
    ("sol", "solana", "SOL", "SOL-USD"),
    ("xrp", "ripple", "XRP", "XRP-USD"),
    ("bnb", "binancecoin", "BNB", "BNB-USD"),
    ("doge", "dogecoin", "DOGE", "DOGE-USD"),
    ("ada", "cardano", "ADA", "ADA-USD"),
    ("trx", "tron", "TRX", "TRX-USD"),
    ("link", "chainlink", "LINK", "LINK-USD"),
    ("avax", "avalanche-2", "AVAX", "AVAX-USD"),
]

KALSHI_SERIES = [
    # series ticker, topic, how many upcoming events to keep
    ("KXFEDDECISION", "fed", 2),
    ("KXRECSSNBER", "recession", 2),
    ("KXCPIYOY", "inflation", 1),
    ("KXU3", "jobs", 1),
    ("KXPAYROLLS", "jobs", 1),
    ("KXGDP", "growth", 1),
    ("KXINXY", "stocks", 1),
]

POLYMARKET_TAGS = ("fed", "economy", "inflation", "elections", "politics")
POLYMARKET_MAX_EVENTS = 8
POLYMARKET_MAX_ELECTION_EVENTS = 4
# How many outcomes of one event get a daily probability history.
_HISTORY_OUTCOMES = 3
# Finance questions about the US economy and markets; other countries' central
# banks and inflation prints are left out so the list stays on topic.
_POLY_INCLUDE = re.compile(
    r"\b(fed|rate (cut|hike)s?|inflation|cpi|pce|ppi|recession|gdp|unemployment|jobs|payrolls|"
    r"largest company|treasury|yield|tariff|s&p|nasdaq|debt ceiling|shutdown|"
    r"election|presidential|nominee|nomination|midterms?|senate|house)\b",
    re.I,
)
_POLY_EXCLUDE = re.compile(
    r"\b(russia|swiss|mexico|south africa|uk|china|japan|canada|europe|ecb|india|brazil|turkey|"
    r"argentina|korea|australia|england|germany|france|boe|boj|french|german|british|canadian|"
    r"japanese|korean|brazilian|italian|italy|spanish|spain|israel|israeli|ukraine|ukrainian|iran|"
    r"venezuela|polish|poland|dutch|netherlands|hungary|philippines|colombia|chile|peru)\b",
    re.I,
)

SOURCES = {
    "yahoo": {"name": "Yahoo Finance", "url": "https://finance.yahoo.com"},
    "treasury": {
        "name": "US Treasury",
        "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        "TextView?type=daily_treasury_yield_curve",
    },
    "coingecko": {"name": "CoinGecko", "url": "https://www.coingecko.com"},
    "kalshi": {"name": "Kalshi", "url": "https://kalshi.com"},
    "polymarket": {"name": "Polymarket", "url": "https://polymarket.com"},
    "cboe": {"name": "Cboe", "url": "https://www.cboe.com/us/options/market_statistics/daily/"},
}

_FUTURES_MONTH_CODES = "FGHJKMNQUVXZ"
_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ---------------------------------------------------------------------------
# Pure helpers (unit tested)
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _to_float(value: Any) -> float | None:
    """A finite float, or None. Empty strings and junk are 'unknown', never zero."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(value, digits)


def downsample(values: list[float], points: int = _SPARK_POINTS) -> list[float]:
    """Evenly spaced samples that always keep the first and the last value."""
    count = len(values)
    if count <= points or points < 2:
        return list(values)
    step = (count - 1) / (points - 1)
    return [values[min(count - 1, round(index * step))] for index in range(points)]


def value_on_or_before(dates: list[str], values: list[float], day: str) -> tuple[str, float] | None:
    """The last observation on or before ``day`` (ISO dates sort as strings)."""
    low, high = 0, len(dates)
    while low < high:
        mid = (low + high) // 2
        if dates[mid] <= day:
            low = mid + 1
        else:
            high = mid
    if low == 0:
        return None
    return dates[low - 1], values[low - 1]


def _change(last: float, base: float | None, mode: str) -> float | None:
    if base is None:
        return None
    if mode == "bps":
        return round((last - base) * 100, 1)
    if mode == "abs":
        return round(last - base, 2)
    if base <= 0:
        return None
    return round((last / base - 1) * 100, 2)


def compute_changes(dates: list[str], values: list[float], mode: str = "pct") -> dict[str, float | None]:
    """1 day, 1 week, 1 month, year to date and 1 year change of the last value.

    ``mode`` is ``pct`` (percent change of a price), ``bps`` (the values are
    yields in percent, the change is a difference in basis points) or ``abs``
    (a plain difference, for ratios). A window the
    series does not reach back to is None, never zero.
    """
    empty: dict[str, float | None] = {"d1": None, "w1": None, "m1": None, "ytd": None, "y1": None}
    if len(dates) < 2 or len(dates) != len(values):
        return empty
    last_day = date.fromisoformat(dates[-1])
    last = values[-1]
    out = dict(empty)
    out["d1"] = _change(last, values[-2], mode)

    def window(target: date, tolerance_days: int) -> float | None:
        found = value_on_or_before(dates[:-1], values[:-1], target.isoformat())
        if found is None:
            return None
        # A series that starts later than the window would otherwise quietly
        # report a shorter period as the full one.
        if (target - date.fromisoformat(found[0])).days > tolerance_days:
            return None
        return _change(last, found[1], mode)

    out["w1"] = window(last_day - timedelta(days=7), 5)
    out["m1"] = window(last_day - timedelta(days=30), 6)
    out["y1"] = window(last_day - timedelta(days=365), 8)
    out["ytd"] = window(date(last_day.year - 1, 12, 31), 8)
    return out


def year_range(dates: list[str], values: list[float]) -> dict[str, Any]:
    """High and low of the trailing year of the series, with their dates."""
    if not dates:
        return {}
    cutoff = (date.fromisoformat(dates[-1]) - timedelta(days=366)).isoformat()
    pairs = [(day, value) for day, value in zip(dates, values) if day >= cutoff]
    if not pairs:
        return {}
    high = max(pairs, key=lambda pair: pair[1])
    low = min(pairs, key=lambda pair: pair[1])
    digits = 6 if abs(high[1]) < 10 else 4
    return {
        "high_1y": round(high[1], digits),
        "high_1y_date": high[0],
        "low_1y": round(low[1], digits),
        "low_1y_date": low[0],
    }


def parse_yahoo_chart(result: dict[str, Any]) -> dict[str, Any] | None:
    """Daily closes (unadjusted, what a quote page shows) and quote metadata."""
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0] or {}
    raw = quote.get("close") or []
    dates: list[str] = []
    closes: list[float] = []
    for stamp, close in zip(timestamps, raw):
        value = _to_float(close)
        if value is None or value <= 0:
            continue
        day = datetime.fromtimestamp(int(stamp), tz=timezone.utc).strftime("%Y-%m-%d")
        if dates and dates[-1] == day:
            closes[-1] = value
            continue
        dates.append(day)
        closes.append(value)
    meta = result.get("meta") or {}
    price = _to_float(meta.get("regularMarketPrice"))
    if price is None and closes:
        price = closes[-1]
    if price is None or price <= 0:
        return None
    market_time = meta.get("regularMarketTime")
    as_of = (
        datetime.fromtimestamp(int(market_time), tz=timezone.utc).isoformat(timespec="seconds")
        if isinstance(market_time, (int, float)) and market_time > 0
        else None
    )
    # The last daily bar is the session in progress; pin it to the live quote so
    # the level and the changes are computed from the same number.
    if closes and as_of and dates[-1] == as_of[:10]:
        closes[-1] = price
    return {
        "dates": dates,
        "closes": closes,
        "price": price,
        "as_of": as_of,
        "currency": meta.get("currency"),
        "short_name": meta.get("shortName"),
        "long_name": meta.get("longName"),
        "instrument_type": meta.get("instrumentType"),
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
    }


def parse_treasury_csv(text: str) -> list[dict[str, Any]]:
    """Rows of the Treasury par yield curve CSV, oldest first.

    Returns ``[{"date": "2026-11-06", "yields": {"10 Yr": 4.86, ...}}]``. A blank
    cell (a tenor that was not published that day) is left out of ``yields``.
    """
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    for record in reader:
        raw_date = (record.get("Date") or "").strip()
        try:
            day = datetime.strptime(raw_date, "%m/%d/%Y").date().isoformat()
        except ValueError:
            continue
        yields: dict[str, float] = {}
        for column, cell in record.items():
            if column in (None, "Date"):
                continue
            value = _to_float(cell)
            if value is not None:
                yields[column.strip()] = value
        if yields:
            rows.append({"date": day, "yields": yields})
    return _dedupe_rows(rows)


def _dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Oldest first, one row per date (yearly files can overlap on a boundary day)."""
    unique = {row["date"]: row for row in rows}
    return [unique[day] for day in sorted(unique)]


def parse_contract_label(short_name: str | None) -> tuple[int, int] | None:
    """``"Crude Oil Dec 26"`` -> ``(2026, 12)``. None when Yahoo's label has no month."""
    match = re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\b", short_name or "")
    if not match:
        return None
    return 2000 + int(match.group(2)), _MONTH_NAMES.index(match.group(1)) + 1


def later_contracts(
    root: str, exchange: str, months: str, front: tuple[int, int], targets: tuple[int, ...] = (3, 6, 12)
) -> list[dict[str, Any]]:
    """Listed contracts closest to each target distance (in months) after the front month."""
    front_year, front_month = front
    listed: list[tuple[int, int, int]] = []  # (months out, year, month)
    for offset in range(1, 15):
        index = front_month - 1 + offset
        year, month = front_year + index // 12, index % 12 + 1
        if _FUTURES_MONTH_CODES[month - 1] in months:
            listed.append((offset, year, month))
    picked: list[tuple[int, int, int]] = []
    for target in targets:
        if not listed:
            break
        best = min(listed, key=lambda item: (abs(item[0] - target), item[0]))
        if best not in picked:
            picked.append(best)
    return [
        {
            "symbol": f"{root}{_FUTURES_MONTH_CODES[month - 1]}{year % 100:02d}.{exchange}",
            "label": f"{_MONTH_NAMES[month - 1]} {year % 100:02d}",
            "months_out": offset,
        }
        for offset, year, month in sorted(picked)
    ]


def curve_structure(curve: list[dict[str, Any]], flat_band_pct: float = 0.5) -> dict[str, Any] | None:
    """Contango, backwardation or flat, from the front month against the furthest
    later contract within a year. None unless both ends have a price."""
    priced = [point for point in curve if _to_float(point.get("price")) is not None]
    if len(priced) < 2:
        return None
    front, later = priced[0], priced[-1]
    if front.get("months_out") != 0 or not front["price"]:
        return None
    spread_pct = round((later["price"] / front["price"] - 1) * 100, 2)
    if spread_pct > flat_band_pct:
        state = "contango"
    elif spread_pct < -flat_band_pct:
        state = "backwardation"
    else:
        state = "flat"
    return {
        "state": state,
        "front_label": front["label"],
        "front_price": front["price"],
        "later_label": later["label"],
        "later_price": later["price"],
        "later_months_out": later["months_out"],
        "spread_pct": spread_pct,
    }


def _probability(bid: Any, ask: Any, last: Any) -> float | None:
    """A market's implied probability: the bid/ask midpoint when the book is
    tight, otherwise the last trade."""
    bid_value, ask_value, last_value = _to_float(bid), _to_float(ask), _to_float(last)
    if bid_value is not None and ask_value is not None and 0 < ask_value <= 1 and 0 <= ask_value - bid_value <= 0.1:
        return round((bid_value + ask_value) / 2, 4)
    if last_value is not None and 0 <= last_value <= 1:
        return round(last_value, 4)
    return None


def _trim_ladder(outcomes: list[dict[str, Any]], limit: int = 7) -> list[dict[str, Any]]:
    """Keep the strikes where the odds are still in play, plus one settled
    neighbour on each side so the reader sees where the range ends."""
    if len(outcomes) <= limit:
        return outcomes
    live = [index for index, outcome in enumerate(outcomes) if 0.03 < outcome["probability"] < 0.97]
    if not live:
        middle = min(range(len(outcomes)), key=lambda index: abs(outcomes[index]["probability"] - 0.5))
        live = [middle]
    start, end = max(0, live[0] - 1), min(len(outcomes), live[-1] + 2)
    window = outcomes[start:end]
    while len(window) > limit:
        # Drop from whichever end is further from an even bet.
        if abs(window[0]["probability"] - 0.5) >= abs(window[-1]["probability"] - 0.5):
            window = window[1:]
        else:
            window = window[:-1]
    return window


def _top_exclusive(outcomes: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    """The most likely outcomes of a pick-one market, in their listed order.

    Long shots under 1% are dropped once two real contenders remain; the doc's
    ``outcome_count`` still says how many outcomes the market lists.
    """
    ranked = sorted(range(len(outcomes)), key=lambda index: outcomes[index]["probability"], reverse=True)
    keep = [index for position, index in enumerate(ranked[:limit]) if position < 2 or outcomes[index]["probability"] >= 0.01]
    return [outcomes[index] for index in sorted(keep)]


def implied_range(outcomes: list[dict[str, Any]]) -> dict[str, float] | None:
    """For an "above X" ladder: the two strikes the even-odds point sits between."""
    strikes = sorted(
        (outcome for outcome in outcomes if outcome.get("strike") is not None),
        key=lambda outcome: outcome["strike"],
    )
    for lower, upper in zip(strikes, strikes[1:]):
        if lower["probability"] >= 0.5 > upper["probability"]:
            return {"low": lower["strike"], "high": upper["strike"]}
    return None


def parse_kalshi_event(event: dict[str, Any], topic: str, fetched_at: str) -> dict[str, Any] | None:
    """One Kalshi event with its nested markets -> a prediction market doc."""
    markets = [market for market in (event.get("markets") or []) if market.get("status") == "active"]
    if not markets:
        return None
    outcomes: list[dict[str, Any]] = []
    volume = 0.0
    volume_24h = 0.0
    close_times: list[str] = []
    for market in markets:
        volume += _to_float(market.get("volume_fp")) or 0.0
        volume_24h += _to_float(market.get("volume_24h_fp")) or 0.0
        if market.get("close_time"):
            close_times.append(str(market["close_time"]))
        probability = _probability(
            market.get("yes_bid_dollars"), market.get("yes_ask_dollars"), market.get("last_price_dollars")
        )
        if probability is None:
            continue
        label = str(market.get("yes_sub_title") or market.get("subtitle") or market.get("title") or "").strip()
        outcome: dict[str, Any] = {"label": label or "Yes", "probability": probability}
        previous = _probability(
            market.get("previous_yes_bid_dollars"),
            market.get("previous_yes_ask_dollars"),
            market.get("previous_price_dollars"),
        )
        if previous is not None:
            outcome["change_24h"] = round(probability - previous, 4)
        if market.get("ticker"):
            outcome["ref"] = str(market["ticker"])
        rules = "\n\n".join(
            part.strip() for part in (market.get("rules_primary"), market.get("rules_secondary")) if part and part.strip()
        )
        if rules:
            outcome["_rules"] = rules
        strike = _to_float(market.get("floor_strike"))
        if market.get("strike_type") == "greater" and strike is not None:
            outcome["strike"] = strike
        outcomes.append(outcome)
    if not outcomes:
        return None

    ticker = str(event.get("event_ticker") or "").strip()
    series = str(event.get("series_ticker") or "").strip()
    if not ticker:
        return None
    question = str(event.get("title") or "").strip()
    sub_title = str(event.get("sub_title") or "").strip()

    extra: dict[str, Any] = {}
    total_outcomes = len(outcomes)
    if len(outcomes) == 1:
        kind = "binary"
        yes = outcomes[0]
        extra["yes_label"] = yes["label"]
        no: dict[str, Any] = {"label": "No", "probability": round(1 - yes["probability"], 4)}
        if "change_24h" in yes:
            no["change_24h"] = round(-yes["change_24h"], 4) + 0.0  # no negative zero
        outcomes = [{**yes, "label": "Yes"}, no]
    elif all("strike" in outcome for outcome in outcomes):
        kind = "ladder"
        outcomes.sort(key=lambda outcome: outcome["strike"])
        implied = implied_range(outcomes)
        if implied:
            extra["implied_range"] = implied
        outcomes = _trim_ladder(outcomes)
    else:
        kind = "exclusive" if event.get("mutually_exclusive") else "multi"
        outcomes = _top_exclusive(outcomes)

    # The rules are written per outcome; keep the leading outcome's, and say whose they are.
    leader = outcomes[0] if kind == "binary" else max(outcomes, key=lambda outcome: outcome["probability"])
    if leader.get("_rules"):
        extra["rules"] = leader["_rules"][:_RULES_LIMIT]
        if kind != "binary":
            extra["rules_outcome"] = leader["label"]
    for outcome in outcomes:
        outcome.pop("_rules", None)
    sources = [
        {"name": str(item.get("name") or "").strip(), "url": str(item.get("url") or "").strip()}
        for item in (event.get("settlement_sources") or [])
        if isinstance(item, dict) and item.get("name")
    ]
    if sources:
        extra["settlement_sources"] = sources[:3]

    return {
        "id": f"kalshi-{ticker.lower()}",
        "class": "prediction",
        "source": "kalshi",
        "source_name": SOURCES["kalshi"]["name"],
        "source_url": f"https://kalshi.com/markets/{series.lower()}" if series else SOURCES["kalshi"]["url"],
        "topic": topic,
        "question": question,
        "detail": sub_title,
        "kind": kind,
        "outcomes": outcomes,
        "outcome_count": total_outcomes,
        "volume": round(volume, 2),
        "volume_24h": round(volume_24h, 2),
        "volume_unit": "contracts",
        "close_time": min(close_times) if close_times else None,
        "as_of": fetched_at,
        "fetched_at": fetched_at,
        **extra,
    }


_RULES_LIMIT = 4000


def parse_polymarket_history(payload: Any) -> tuple[list[str], list[float]]:
    """``{"history": [{"t": 1785456023, "p": 0.027}]}`` -> one probability per UTC day, oldest first."""
    by_day: dict[str, float] = {}
    for item in (payload or {}).get("history") or [] if isinstance(payload, dict) else []:
        stamp, value = _to_float(item.get("t")), _to_float(item.get("p"))
        if stamp is None or value is None or not 0 <= value <= 1:
            continue
        by_day[datetime.fromtimestamp(stamp, tz=timezone.utc).strftime("%Y-%m-%d")] = round(value, 4)
    days = sorted(by_day)
    return days, [by_day[day] for day in days]


def parse_kalshi_candles(payload: Any) -> tuple[list[str], list[float]]:
    """Daily Kalshi candlesticks -> one probability per UTC day, oldest first.

    A day's value is the closing bid/ask midpoint when the book was tight,
    otherwise the last trade of the day; a day with neither is left out.
    """
    by_day: dict[str, float] = {}
    for candle in (payload or {}).get("candlesticks") or [] if isinstance(payload, dict) else []:
        stamp = _to_float(candle.get("end_period_ts"))
        if stamp is None:
            continue
        value = _probability(
            (candle.get("yes_bid") or {}).get("close_dollars"),
            (candle.get("yes_ask") or {}).get("close_dollars"),
            (candle.get("price") or {}).get("close_dollars"),
        )
        if value is None:
            continue
        # The candle is stamped at the end of its period; the day it covers is the one before.
        by_day[datetime.fromtimestamp(stamp - 1, tz=timezone.utc).strftime("%Y-%m-%d")] = value
    days = sorted(by_day)
    return days, [by_day[day] for day in days]


def parse_fund_profile(result: dict[str, Any]) -> dict[str, Any]:
    """Yahoo quoteSummary (topHoldings, fundProfile, summaryDetail) -> ETF facts.

    Only fields the response actually carries are returned; an empty ``{}`` cell
    (Yahoo's way of saying "not reported") never becomes a zero.
    """

    def raw(node: Any) -> float | None:
        return _to_float(node.get("raw")) if isinstance(node, dict) else None

    out: dict[str, Any] = {}
    profile = result.get("fundProfile") or {}
    fees = profile.get("feesExpensesInvestment") or {}
    expense = raw(fees.get("annualReportExpenseRatio"))
    if expense is None:
        expense = raw(fees.get("netExpRatio"))
    if expense is not None and 0 <= expense < 0.2:
        out["expense_ratio_pct"] = round(expense * 100, 3)
    for key, field in (("family", "fund_family"), ("categoryName", "category")):
        if isinstance(profile.get(key), str) and profile[key].strip():
            out[field] = profile[key].strip()
    detail = result.get("summaryDetail") or {}
    assets = raw(detail.get("totalAssets"))
    if assets is not None and assets > 0:
        out["total_assets"] = assets
    fund_yield = raw(detail.get("yield"))
    if fund_yield is not None and 0 < fund_yield < 1:
        out["yield_pct"] = round(fund_yield * 100, 2)
    top = result.get("topHoldings") or {}
    holdings: list[dict[str, Any]] = []
    for item in top.get("holdings") or []:
        weight = raw(item.get("holdingPercent"))
        name = str(item.get("holdingName") or "").strip()
        symbol = str(item.get("symbol") or "").strip().upper()
        if weight is None or weight <= 0 or not (name or symbol):
            continue
        holdings.append({"symbol": symbol or None, "name": name or symbol, "weight_pct": round(weight * 100, 2)})
    if holdings:
        holdings.sort(key=lambda holding: holding["weight_pct"], reverse=True)
        out["holdings"] = holdings[:10]
        out["holdings_weight_pct"] = round(sum(holding["weight_pct"] for holding in holdings[:10]), 2)
    sectors: list[dict[str, Any]] = []
    for entry in top.get("sectorWeightings") or []:
        for key, node in (entry or {}).items():
            weight = raw(node)
            if weight is not None and weight > 0.001:
                sectors.append({"sector": key.replace("_", " "), "weight_pct": round(weight * 100, 2)})
    if sectors:
        out["sectors"] = sorted(sectors, key=lambda sector: sector["weight_pct"], reverse=True)[:6]
    return out


def parse_cboe_history(text: str) -> tuple[list[str], list[float]]:
    """A Cboe index history CSV (``DATE,OPEN,HIGH,LOW,CLOSE`` or ``DATE,<NAME>``) -> daily closes."""
    by_day: dict[str, float] = {}
    reader = csv.reader(io.StringIO(text.lstrip("\ufeff")))
    header = next(reader, None) or []
    column = header.index("CLOSE") if "CLOSE" in header else 1
    for row in reader:
        if len(row) <= column:
            continue
        try:
            day = datetime.strptime(row[0].strip(), "%m/%d/%Y").date().isoformat()
        except ValueError:
            continue
        value = _to_float(row[column])
        if value is not None and value > 0:
            by_day[day] = value
    days = sorted(by_day)
    return days, [by_day[day] for day in days]


def parse_cboe_daily_options(payload: Any) -> dict[str, Any]:
    """Cboe's daily market statistics -> ``{"ratios": {name: value}, "volume": {section: {...}}}``."""
    ratios: dict[str, float] = {}
    volume: dict[str, dict[str, float]] = {}
    if not isinstance(payload, dict):
        return {"ratios": ratios, "volume": volume}
    for item in payload.get("ratios") or []:
        value = _to_float((item or {}).get("value"))
        if value is not None and value > 0:
            ratios[str(item.get("name") or "").strip()] = value
    for section, rows in payload.items():
        if section == "ratios" or not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, dict) and row.get("name") == "VOLUME":
                call, put = _to_float(row.get("call")), _to_float(row.get("put"))
                if call is not None and put is not None:
                    volume[section] = {"call": call, "put": put}
    return {"ratios": ratios, "volume": volume}


def _json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def polymarket_topic(title: str) -> str:
    lowered = title.lower()
    if re.search(r"election|presidential|nominee|nomination|midterm|\bsenate\b|\bhouse\b", lowered):
        return "election"
    if re.search(r"\bfed\b|rate (cut|hike)", lowered):
        return "fed"
    if re.search(r"inflation|\bcpi\b|\bpce\b|\bppi\b", lowered):
        return "inflation"
    if "recession" in lowered:
        return "recession"
    if re.search(r"unemployment|jobs|payrolls", lowered):
        return "jobs"
    if "gdp" in lowered:
        return "growth"
    if re.search(r"largest company|s&p|nasdaq", lowered):
        return "stocks"
    return "economy"


def parse_polymarket_event(event: dict[str, Any], fetched_at: str) -> dict[str, Any] | None:
    """One Polymarket (Gamma API) event -> a prediction market doc."""
    slug = str(event.get("slug") or "").strip()
    event_id = str(event.get("id") or "").strip()
    question = str(event.get("title") or "").strip()
    if not (slug and event_id and question):
        return None
    markets = [
        market
        for market in (event.get("markets") or [])
        if market.get("active", True) and not market.get("closed")
    ]
    if not markets:
        return None

    outcomes: list[dict[str, Any]] = []
    extra: dict[str, Any] = {}
    if len(markets) == 1:
        kind = "binary"
        labels = _json_list(markets[0].get("outcomes"))
        prices = [_to_float(price) for price in _json_list(markets[0].get("outcomePrices"))]
        tokens = _json_list(markets[0].get("clobTokenIds"))
        day_change = _to_float(markets[0].get("oneDayPriceChange"))
        for position, (label, price) in enumerate(zip(labels, prices)):
            if price is not None and 0 <= price <= 1:
                outcome: dict[str, Any] = {"label": str(label), "probability": round(price, 4)}
                # The API reports the one-day change of the first outcome; the second mirrors it.
                if day_change is not None and position < 2:
                    outcome["change_24h"] = round(day_change if position == 0 else -day_change, 4)
                if position < len(tokens):
                    outcome["ref"] = str(tokens[position])
                outcomes.append(outcome)
        if len(outcomes) < 2:
            return None
    else:
        kind = "exclusive" if event.get("negRisk") else "multi"
        ordered = sorted(markets, key=lambda market: _to_float(market.get("groupItemThreshold")) or 0.0)
        for market in ordered:
            labels = _json_list(market.get("outcomes"))
            prices = [_to_float(price) for price in _json_list(market.get("outcomePrices"))]
            if not labels or not prices or str(labels[0]).lower() != "yes" or prices[0] is None:
                continue
            if not 0 <= prices[0] <= 1:
                continue
            label = str(market.get("groupItemTitle") or market.get("question") or "").strip()
            if label:
                outcome = {"label": label, "probability": round(prices[0], 4)}
                day_change = _to_float(market.get("oneDayPriceChange"))
                if day_change is not None:
                    outcome["change_24h"] = round(day_change, 4)
                tokens = _json_list(market.get("clobTokenIds"))
                if tokens:
                    outcome["ref"] = str(tokens[0])
                outcomes.append(outcome)
        if not outcomes:
            return None
    total_outcomes = len(outcomes)
    if kind == "exclusive":
        outcomes = _top_exclusive(outcomes)
    elif kind == "multi":
        outcomes = _trim_ladder(outcomes)

    rules = str(event.get("description") or markets[0].get("description") or "").strip()
    if rules:
        extra["rules"] = rules[:_RULES_LIMIT]
    resolution_url = str(event.get("resolutionSource") or markets[0].get("resolutionSource") or "").strip()
    if resolution_url.startswith("http"):
        extra["settlement_sources"] = [
            {"name": urllib.parse.urlsplit(resolution_url).netloc.removeprefix("www."), "url": resolution_url}
        ]

    return {
        "id": f"poly-{event_id}",
        "class": "prediction",
        "source": "polymarket",
        "source_name": SOURCES["polymarket"]["name"],
        "source_url": f"https://polymarket.com/event/{slug}",
        "topic": polymarket_topic(question),
        "question": question,
        "detail": "",
        "kind": kind,
        "outcomes": outcomes,
        "outcome_count": total_outcomes,
        "volume": _round(_to_float(event.get("volume")), 2),
        "volume_24h": _round(_to_float(event.get("volume24hr")), 2),
        "volume_unit": "usd",
        "close_time": event.get("endDate"),
        "as_of": fetched_at,
        "fetched_at": fetched_at,
        **extra,
    }


def polymarket_relevant(title: str) -> bool:
    return bool(_POLY_INCLUDE.search(title)) and not _POLY_EXCLUDE.search(title)


def build_asset_doc(
    *,
    asset_id: str,
    asset_class: str,
    name: str,
    symbol: str,
    dates: list[str],
    values: list[float],
    price: float,
    unit: str,
    source: str,
    source_url: str,
    as_of: str | None,
    fetched_at: str,
    change_mode: str = "pct",
    order: int = 0,
    extra: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The slim asset doc (with sparkline) and the full series doc for one asset."""
    cutoff = (date.fromisoformat(dates[-1]) - timedelta(days=366)).isoformat() if dates else ""
    year_dates = [day for day in dates if day >= cutoff]
    year_values = values[len(dates) - len(year_dates) :]
    digits = 6 if abs(price) < 10 else 4
    asset: dict[str, Any] = {
        "id": asset_id,
        "class": asset_class,
        "name": name,
        "symbol": symbol,
        "price": round(price, digits),
        "prev_close": round(values[-2], digits) if len(values) >= 2 else None,
        "unit": unit,
        "change_mode": change_mode,
        "change": compute_changes(dates, values, change_mode),
        **year_range(dates, values),
        "spark": [round(value, digits) for value in downsample(year_values)],
        "spark_start": year_dates[0] if year_dates else None,
        "spark_end": year_dates[-1] if year_dates else None,
        "source": source,
        "source_name": SOURCES[source]["name"],
        "source_url": source_url,
        "as_of": as_of or fetched_at,
        "fetched_at": fetched_at,
        "order": order,
    }
    if extra:
        asset.update(extra)
    series = {
        "id": asset_id,
        "dates": year_dates,
        "values": [round(value, digits) for value in year_values],
        "unit": unit,
        "source": source,
        "source_name": SOURCES[source]["name"],
        "as_of": asset["as_of"],
        "fetched_at": fetched_at,
    }
    return asset, series


# ---------------------------------------------------------------------------
# HTTP with a small on-disk cache so repeat runs stay polite
# ---------------------------------------------------------------------------


class Fetcher:
    def __init__(self, *, use_cache: bool = True) -> None:
        self.use_cache = use_cache
        self._last_call: dict[str, float] = {}

    def _cache_path(self, url: str) -> Path:
        return _CACHE_DIR / f"{hashlib.sha1(url.encode('utf-8')).hexdigest()}.txt"

    def text(self, url: str, *, ttl: int, user_agent: str = _APP_UA, pause: float = 0.25, retries: int = 3) -> str:
        """GET ``url``. Raises RuntimeError with a short reason when it cannot be had."""
        cache = self._cache_path(url)
        if self.use_cache and cache.exists() and time.time() - cache.stat().st_mtime < ttl:
            return cache.read_text()
        host = urllib.parse.urlsplit(url).netloc
        last_error = "no response"
        for attempt in range(retries):
            wait = pause - (time.time() - self._last_call.get(host, 0.0))
            if wait > 0:
                time.sleep(wait)
            request = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "*/*"})
            try:
                self._last_call[host] = time.time()
                with urllib.request.urlopen(request, timeout=30) as response:
                    body = response.read().decode("utf-8", "replace")
                _CACHE_DIR.mkdir(parents=True, exist_ok=True)
                cache.write_text(body)
                return body
            except urllib.error.HTTPError as error:
                last_error = f"HTTP {error.code}"
                if error.code == 429:
                    retry_after = _to_float(error.headers.get("Retry-After")) or 0.0
                    time.sleep(min(max(retry_after, 4.0 * (attempt + 1)), 25.0))
                    continue
                if error.code >= 500:
                    time.sleep(2.0 * (attempt + 1))
                    continue
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                last_error = type(error).__name__
                time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"{host}: {last_error}")

    def cached(self, key: str, *, ttl: int, produce: Callable[[], str]) -> str:
        """A response that needs more than a plain GET (cookies, a crumb), cached under ``key``."""
        cache = self._cache_path(key)
        if self.use_cache and cache.exists() and time.time() - cache.stat().st_mtime < ttl:
            return cache.read_text()
        body = produce()
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(body)
        return body

    def json(self, url: str, **kwargs: Any) -> Any:
        body = self.text(url, **kwargs)
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            self._cache_path(url).unlink(missing_ok=True)
            raise RuntimeError(f"{urllib.parse.urlsplit(url).netloc}: response was not JSON") from None


def _yahoo_chart(fetcher: Fetcher, symbol: str, *, days: int = _HISTORY_DAYS, ttl: int = 600) -> dict[str, Any]:
    # Whole-day period bounds keep the URL (and so the cache key) stable within a day.
    today = int(time.time()) // 86400 * 86400
    query = urllib.parse.urlencode({"period1": today - days * 86400, "period2": today + 2 * 86400, "interval": "1d"})
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?{query}"
    payload = fetcher.json(url, ttl=ttl, user_agent=_YAHOO_UA)
    results = (payload.get("chart") or {}).get("result") or []
    parsed = parse_yahoo_chart(results[0]) if results else None
    if not parsed or len(parsed["dates"]) < 2:
        raise RuntimeError(f"Yahoo has no usable series for {symbol}")
    return parsed


class YahooSession:
    """Yahoo's quoteSummary endpoint wants a cookie and a matching crumb. Both are
    handed out to anyone, with no key or account."""

    def __init__(self) -> None:
        self._opener: urllib.request.OpenerDirector | None = None
        self._crumb = ""
        self._failed = ""
        self._last_call = 0.0

    def _open(self, url: str) -> str:
        assert self._opener is not None
        wait = 0.35 - (time.time() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.time()
        request = urllib.request.Request(url, headers={"User-Agent": _YAHOO_UA, "Accept": "*/*"})
        with self._opener.open(request, timeout=30) as response:
            return response.read().decode("utf-8", "replace")

    def _ensure(self) -> None:
        if self._opener is not None and self._crumb:
            return
        if self._failed:
            # One refusal is enough: do not knock again for every remaining fund.
            raise RuntimeError(self._failed)
        try:
            self._handshake()
        except RuntimeError as error:
            self._failed = str(error)
            raise

    def _handshake(self) -> None:
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        try:
            self._open("https://fc.yahoo.com")  # answers 404 and sets the cookie
        except urllib.error.HTTPError:
            pass
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise RuntimeError(f"Yahoo cookie: {type(error).__name__}") from None
        try:
            self._crumb = self._open("https://query2.finance.yahoo.com/v1/test/getcrumb").strip()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise RuntimeError(f"Yahoo crumb: {getattr(error, 'code', type(error).__name__)}") from None
        if not self._crumb or len(self._crumb) > 40 or "<" in self._crumb:
            self._crumb = ""
            raise RuntimeError("Yahoo did not hand out a crumb")

    def quote_summary(self, symbol: str, modules: str) -> str:
        self._ensure()
        query = urllib.parse.urlencode({"modules": modules, "crumb": self._crumb})
        url = f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(symbol)}?{query}"
        try:
            return self._open(url)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Yahoo quoteSummary {symbol}: HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            raise RuntimeError(f"Yahoo quoteSummary {symbol}: {type(error).__name__}") from None


def _fund_profile(fetcher: Fetcher, session: YahooSession, ticker: str) -> dict[str, Any]:
    """Expense ratio, assets and top holdings of one ETF. Raises RuntimeError when unavailable."""
    key = f"yahoo-fund-profile:{ticker}"
    body = fetcher.cached(
        key, ttl=20 * 3600, produce=lambda: session.quote_summary(ticker, "topHoldings,fundProfile,summaryDetail")
    )
    try:
        results = ((json.loads(body).get("quoteSummary") or {}).get("result")) or []
    except json.JSONDecodeError:
        results = []
    if not results:
        fetcher._cache_path(key).unlink(missing_ok=True)
        raise RuntimeError(f"Yahoo has no fund profile for {ticker}")
    return parse_fund_profile(results[0])


def _yahoo_quote_url(symbol: str) -> str:
    return f"https://finance.yahoo.com/quote/{urllib.parse.quote(symbol)}"


# ---------------------------------------------------------------------------
# Collectors: each returns (asset docs, series docs, other docs, failures)
# ---------------------------------------------------------------------------

Docs = list[tuple[str, dict[str, Any]]]
Failure = dict[str, str]


class Run:
    def __init__(self, fetcher: Fetcher) -> None:
        self.fetcher = fetcher
        self.fetched_at = _iso_now()
        self.assets: dict[str, dict[str, Any]] = {}
        self.series: dict[str, dict[str, Any]] = {}
        self.other: Docs = []
        self.predictions: dict[str, dict[str, Any]] = {}
        self.failures: list[Failure] = []
        self.expected: dict[str, list[str]] = {}

    def expect(self, asset_class: str, asset_id: str) -> None:
        self.expected.setdefault(asset_class, []).append(asset_id)

    def add(self, asset: dict[str, Any], series: dict[str, Any]) -> None:
        self.assets[asset["id"]] = asset
        self.series[asset["id"]] = series

    def fail(self, item: str, source: str, error: Exception | str) -> None:
        self.failures.append({"item": item, "source": source, "reason": str(error)[:200]})
        print(f"[markets] FAILED {item} ({source}): {error}", flush=True)


def _collect_yahoo_simple(
    run: Run, asset_class: str, rows: list[tuple[str, str, str, str, str, dict[str, Any]]]
) -> None:
    """rows: (id, yahoo symbol, display symbol, name, unit, extra)."""
    for order, (asset_id, yahoo_symbol, symbol, name, unit, extra) in enumerate(rows):
        run.expect(asset_class, asset_id)
        try:
            chart = _yahoo_chart(run.fetcher, yahoo_symbol)
        except RuntimeError as error:
            run.fail(asset_id, "yahoo", error)
            continue
        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class=asset_class,
            name=name,
            symbol=symbol,
            dates=chart["dates"],
            values=chart["closes"],
            price=chart["price"],
            unit=unit,
            source="yahoo",
            source_url=_yahoo_quote_url(yahoo_symbol),
            as_of=chart["as_of"],
            fetched_at=run.fetched_at,
            order=order,
            extra={"source_symbol": yahoo_symbol, "currency": chart["currency"], **extra},
        )
        run.add(asset, series)


def collect_indices(run: Run) -> None:
    _collect_yahoo_simple(
        run, "index", [(asset_id, yahoo, symbol, name, unit, {}) for asset_id, yahoo, symbol, name, unit in INDICES]
    )


def collect_etfs(run: Run) -> None:
    _collect_yahoo_simple(
        run,
        "etf",
        [(ticker.lower(), ticker, ticker, name, "USD", {"group": group}) for ticker, name, group in ETFS],
    )
    # Fund facts are a bonus on top of the price: a miss leaves the ETF without
    # holdings, it does not drop the ETF.
    session = YahooSession()
    missing: list[str] = []
    for ticker, _, _ in ETFS:
        asset = run.assets.get(ticker.lower())
        if not asset:
            continue
        try:
            profile = _fund_profile(run.fetcher, session, ticker)
        except RuntimeError as error:
            missing.append(ticker)
            print(f"[markets] {ticker}: no fund profile ({error})", flush=True)
            continue
        if profile:
            asset.update(profile)
            asset["profile_source_name"] = SOURCES["yahoo"]["name"]
            asset["profile_source_url"] = f"{_yahoo_quote_url(ticker)}/holdings"
            asset["profile_as_of"] = run.fetched_at
        else:
            missing.append(ticker)
    if missing and len(missing) == len([ticker for ticker, _, _ in ETFS if ticker.lower() in run.assets]):
        run.fail("etf-profiles", "yahoo", "no ETF fund profile could be read (holdings and expense ratios missing)")


def _weekdays_back(last: date, days: int) -> list[date]:
    out = []
    for offset in range(days, -1, -1):
        day = last - timedelta(days=offset)
        if day.weekday() < 5:
            out.append(day)
    return out


def collect_options(run: Run) -> None:
    """Options summary data from Cboe: implied volatility by horizon and put/call ratios."""
    for asset_id, *_ in CBOE_INDICES:
        run.expect("option", asset_id)
    for asset_id, *_ in CBOE_PUT_CALL:
        run.expect("option", asset_id)

    histories: dict[str, tuple[list[str], list[float]]] = {}
    for file_symbol in ["VIX"] + [row[1] for row in CBOE_INDICES]:
        url = f"https://cdn.cboe.com/api/global/us_indices/daily_prices/{file_symbol}_History.csv"
        try:
            dates, values = parse_cboe_history(run.fetcher.text(url, ttl=3600, pause=0.3))
            if len(dates) < 2:
                raise RuntimeError(f"Cboe history for {file_symbol} is empty")
        except RuntimeError as error:
            if file_symbol != "VIX":
                run.fail(file_symbol.lower(), "cboe", error)
            continue
        cutoff = (date.fromisoformat(dates[-1]) - timedelta(days=_HISTORY_DAYS)).isoformat()
        start = next((index for index, day in enumerate(dates) if day >= cutoff), 0)
        histories[file_symbol] = (dates[start:], values[start:])

    order = 0
    for asset_id, file_symbol, symbol, name, horizon in CBOE_INDICES:
        if file_symbol not in histories:
            continue
        dates, values = histories[file_symbol]
        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class="option",
            name=name,
            symbol=symbol,
            dates=dates,
            values=values,
            price=values[-1],
            unit="pts",
            source="cboe",
            source_url=f"https://www.cboe.com/us/indices/dashboard/{file_symbol}/",
            # Index values are end-of-day closes (4:15pm ET).
            as_of=f"{dates[-1]}T21:15:00+00:00",
            fetched_at=run.fetched_at,
            order=order,
            extra={"group": "volatility", "horizon_days": horizon, "daily_only": True},
        )
        run.add(asset, series)
        order += 1

    # Implied volatility by horizon, all on the same close.
    points: list[dict[str, Any]] = []
    spot = histories.get("VIX")
    latest_day = spot[0][-1] if spot else None
    if spot and latest_day:
        month_ago = (date.fromisoformat(latest_day) - timedelta(days=30)).isoformat()
        rows = [("VIX9D", "vix9d", "9D", 9), ("VIX", "vix", "1M", 30)]
        rows += [("VIX3M", "vix3m", "3M", 93), ("VIX6M", "vix6m", "6M", 184), ("VIX1Y", "vix1y", "1Y", 365)]
        for file_symbol, asset_id, label, horizon in rows:
            history = histories.get(file_symbol)
            if not history or history[0][-1] != latest_day:
                continue
            before = value_on_or_before(history[0], history[1], month_ago)
            points.append(
                {
                    "label": label,
                    "symbol": file_symbol,
                    "days": horizon,
                    "asset_id": asset_id,
                    "value": round(history[1][-1], 2),
                    "value_1m_ago": round(before[1], 2) if before else None,
                }
            )
    if len(points) >= 3:
        by_symbol = {point["symbol"]: point["value"] for point in points}
        state = None
        if "VIX" in by_symbol and "VIX3M" in by_symbol:
            ratio = by_symbol["VIX"] / by_symbol["VIX3M"]
            state = "inverted" if ratio > 1.0 else "normal"
        run.other.append(
            (
                f"{CURVES_COLLECTION}/vix",
                {
                    "id": "vix",
                    "date": latest_day,
                    "points": points,
                    "state": state,
                    "vix_to_vix3m": round(by_symbol["VIX"] / by_symbol["VIX3M"], 3)
                    if "VIX" in by_symbol and "VIX3M" in by_symbol
                    else None,
                    "source": "cboe",
                    "source_name": SOURCES["cboe"]["name"],
                    "source_url": "https://www.cboe.com/tradable_products/vix/term_structure/",
                    "as_of": f"{latest_day}T21:15:00+00:00",
                    "fetched_at": run.fetched_at,
                },
            )
        )

    # Put/call ratios: one small file per trading day. Past days never change, so
    # after the first run this is one request a day.
    today = datetime.now(timezone.utc).date()
    daily: dict[str, dict[str, Any]] = {}
    for day in _weekdays_back(today, 372):
        url = f"https://cdn.cboe.com/data/us/options/market_statistics/daily/{day.isoformat()}_daily_options"
        age = (today - day).days
        try:
            payload = run.fetcher.json(url, ttl=400 * 86400 if age > 3 else 1800, pause=0.12, retries=1)
        except RuntimeError:
            continue  # a market holiday, or a day Cboe has not published yet
        parsed = parse_cboe_daily_options(payload)
        if parsed["ratios"]:
            daily[day.isoformat()] = parsed
    days = sorted(daily)
    for asset_id, ratio_name, section, symbol, name in CBOE_PUT_CALL:
        pairs = [(day, daily[day]["ratios"][ratio_name]) for day in days if ratio_name in daily[day]["ratios"]]
        if len(pairs) < 2 or pairs[-1][0] != days[-1]:
            run.fail(asset_id, "cboe", "no recent put/call ratio in Cboe's daily statistics")
            continue
        dates = [day for day, _ in pairs]
        values = [value for _, value in pairs]
        extra: dict[str, Any] = {"group": "put_call", "daily_only": True}
        volume = daily[dates[-1]]["volume"].get(section)
        if volume:
            extra["call_volume"] = volume["call"]
            extra["put_volume"] = volume["put"]
        recent = values[-20:]
        if len(recent) == 20:
            extra["average_20d"] = round(sum(recent) / len(recent), 2)
        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class="option",
            name=name,
            symbol=symbol,
            dates=dates,
            values=values,
            price=values[-1],
            unit="ratio",
            source="cboe",
            source_url=SOURCES["cboe"]["url"],
            as_of=f"{dates[-1]}T21:15:00+00:00",
            fetched_at=run.fetched_at,
            change_mode="abs",
            order=order,
            extra=extra,
        )
        run.add(asset, series)
        order += 1


def collect_fx(run: Run) -> None:
    _collect_yahoo_simple(
        run,
        "fx",
        [
            (asset_id, yahoo, symbol, name, "pts" if asset_id == "dxy" else "rate", {})
            for asset_id, yahoo, symbol, name in FX
        ],
    )


def collect_commodities(run: Run) -> None:
    for order, (asset_id, front_symbol, root, exchange, months, name, unit) in enumerate(COMMODITIES):
        run.expect("commodity", asset_id)
        try:
            chart = _yahoo_chart(run.fetcher, front_symbol)
        except RuntimeError as error:
            run.fail(asset_id, "yahoo", error)
            continue

        extra: dict[str, Any] = {"source_symbol": front_symbol, "currency": chart["currency"]}
        front = parse_contract_label(chart["short_name"])
        if front:
            front_label = f"{_MONTH_NAMES[front[1] - 1]} {front[0] % 100:02d}"
            extra["contract"] = front_label
            curve: list[dict[str, Any]] = [
                {"label": front_label, "symbol": front_symbol, "months_out": 0, "price": round(chart["price"], 4)}
            ]
            stale_before = (datetime.now(timezone.utc) - timedelta(days=6)).isoformat()
            for contract in later_contracts(root, exchange, months, front):
                try:
                    later = _yahoo_chart(run.fetcher, contract["symbol"], days=10)
                except RuntimeError as error:
                    # A missing deferred contract only thins the curve; the asset itself is fine.
                    print(f"[markets] {asset_id}: no {contract['label']} contract ({error})", flush=True)
                    continue
                # A contract that has not traded for days would make the curve lie.
                if not later["as_of"] or later["as_of"] < stale_before:
                    continue
                curve.append({**contract, "price": round(later["price"], 4), "as_of": later["as_of"]})
            if len(curve) >= 2:
                extra["curve"] = curve
                structure = curve_structure(curve)
                if structure:
                    extra["structure"] = structure

        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class="commodity",
            name=name,
            symbol=root,
            dates=chart["dates"],
            values=chart["closes"],
            price=chart["price"],
            unit=unit,
            source="yahoo",
            source_url=_yahoo_quote_url(front_symbol),
            as_of=chart["as_of"],
            fetched_at=run.fetched_at,
            order=order,
            extra=extra,
        )
        run.add(asset, series)


def _treasury_url(year: int) -> str:
    return (
        "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        f"daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
        f"&field_tdr_date_value={year}&page&_format=csv"
    )


def collect_rates(run: Run) -> None:
    asset_ids = [asset_id for _, asset_id, *_ in TREASURY_TENORS if asset_id] + ["us2s10s"]
    for asset_id in asset_ids:
        run.expect("rate", asset_id)
    this_year = datetime.now(timezone.utc).year
    rows: list[dict[str, Any]] = []
    try:
        for year in (this_year - 1, this_year):
            # Last year's file never changes; this year's gains a row each afternoon.
            ttl = 7 * 86400 if year < this_year else 1800
            try:
                rows.extend(parse_treasury_csv(run.fetcher.text(_treasury_url(year), ttl=ttl, user_agent=_YAHOO_UA)))
            except RuntimeError:
                # Early January: the new year's file may not exist yet.
                if year < this_year or not rows:
                    raise
        rows = _dedupe_rows(rows)
        if len(rows) < 2:
            raise RuntimeError("Treasury yield curve file had fewer than two rows")
    except RuntimeError as error:
        for asset_id in asset_ids:
            run.fail(asset_id, "treasury", error)
        return

    latest = rows[-1]
    dates = [row["date"] for row in rows]
    # Treasury posts the day's curve after the 3:30pm ET close of the bond market.
    as_of = f"{latest['date']}T20:30:00+00:00"
    source_url = f"{SOURCES['treasury']['url']}&field_tdr_date_value={latest['date'][:4]}"

    def series_for(column: str) -> tuple[list[str], list[float]]:
        pairs = [(row["date"], row["yields"][column]) for row in rows if column in row["yields"]]
        return [day for day, _ in pairs], [value for _, value in pairs]

    order = 0
    for column, asset_id, tenor, long_label, months in TREASURY_TENORS:
        if not asset_id:
            continue
        tenor_dates, tenor_values = series_for(column)
        if len(tenor_dates) < 2 or tenor_dates[-1] != latest["date"]:
            run.fail(asset_id, "treasury", f"no {column} yield for {latest['date']}")
            continue
        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class="rate",
            name=f"{long_label.capitalize()} Treasury yield",
            symbol=f"US{tenor}",
            dates=tenor_dates,
            values=tenor_values,
            price=tenor_values[-1],
            unit="%",
            source="treasury",
            source_url=source_url,
            as_of=as_of,
            fetched_at=run.fetched_at,
            change_mode="bps",
            order=order,
            extra={"tenor": tenor, "tenor_months": months},
        )
        run.add(asset, series)
        order += 1

    # 2s10s: the 10 year yield minus the 2 year, in percentage points.
    spread_pairs = [
        (row["date"], round(row["yields"]["10 Yr"] - row["yields"]["2 Yr"], 4))
        for row in rows
        if "10 Yr" in row["yields"] and "2 Yr" in row["yields"]
    ]
    if len(spread_pairs) >= 2 and spread_pairs[-1][0] == latest["date"]:
        spread_dates = [day for day, _ in spread_pairs]
        spread_values = [value for _, value in spread_pairs]
        asset, series = build_asset_doc(
            asset_id="us2s10s",
            asset_class="rate",
            name="2s10s spread (10 year minus 2 year)",
            symbol="2s10s",
            dates=spread_dates,
            values=spread_values,
            price=spread_values[-1],
            unit="pp",
            source="treasury",
            source_url=source_url,
            as_of=as_of,
            fetched_at=run.fetched_at,
            change_mode="bps",
            order=order,
            extra={"inverted": spread_values[-1] < 0},
        )
        run.add(asset, series)
    else:
        run.fail("us2s10s", "treasury", "missing 2 year or 10 year yield")

    # The curve itself, next to where it stood a month and a year ago.
    def row_on_or_before(day: date) -> dict[str, Any] | None:
        found = value_on_or_before(dates, list(range(len(rows))), day.isoformat())
        return rows[found[1]] if found else None

    latest_day = date.fromisoformat(latest["date"])
    month_ago = row_on_or_before(latest_day - timedelta(days=30))
    year_ago = row_on_or_before(latest_day - timedelta(days=365))
    points = []
    for column, asset_id, tenor, long_label, months in TREASURY_TENORS:
        if column not in latest["yields"]:
            continue
        points.append(
            {
                "tenor": tenor,
                "label": long_label,
                "months": months,
                "asset_id": asset_id,
                "value": latest["yields"][column],
                "value_1m_ago": (month_ago or {}).get("yields", {}).get(column),
                "value_1y_ago": (year_ago or {}).get("yields", {}).get(column),
            }
        )
    yields = latest["yields"]
    curve_doc = {
        "id": "treasury",
        "date": latest["date"],
        "date_1m_ago": month_ago["date"] if month_ago else None,
        "date_1y_ago": year_ago["date"] if year_ago else None,
        "points": points,
        "spread_2s10s_bps": round((yields["10 Yr"] - yields["2 Yr"]) * 100, 1)
        if "10 Yr" in yields and "2 Yr" in yields
        else None,
        "spread_3m10y_bps": round((yields["10 Yr"] - yields["3 Mo"]) * 100, 1)
        if "10 Yr" in yields and "3 Mo" in yields
        else None,
        "source": "treasury",
        "source_name": SOURCES["treasury"]["name"],
        "source_url": source_url,
        "as_of": as_of,
        "fetched_at": run.fetched_at,
    }
    run.other.append((f"{CURVES_COLLECTION}/treasury", curve_doc))


def _coingecko_series(run: Run, coin_id: str) -> tuple[list[str], list[float]]:
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days=365&interval=daily"
    payload = run.fetcher.json(url, ttl=12 * 3600, pause=2.5, retries=2)
    by_day: dict[str, float] = {}
    for stamp, price in payload.get("prices") or []:
        value = _to_float(price)
        if value is None or value <= 0:
            continue
        by_day[datetime.fromtimestamp(stamp / 1000, tz=timezone.utc).strftime("%Y-%m-%d")] = value
    days = sorted(by_day)
    if len(days) < 30:
        raise RuntimeError(f"CoinGecko history for {coin_id} is too short")
    return days, [by_day[day] for day in days]


def collect_crypto(run: Run) -> None:
    for asset_id, *_ in CRYPTO:
        run.expect("crypto", asset_id)
    ids = ",".join(coin_id for _, coin_id, _, _ in CRYPTO)
    url = (
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd"
        f"&ids={urllib.parse.quote(ids)}&order=market_cap_desc&per_page=50&page=1"
        "&sparkline=false&price_change_percentage=24h,7d,30d,1y"
    )
    try:
        rows = run.fetcher.json(url, ttl=300, pause=2.5)
        if not isinstance(rows, list):
            raise RuntimeError("CoinGecko markets response was not a list")
    except RuntimeError as error:
        for asset_id, *_ in CRYPTO:
            run.fail(asset_id, "coingecko", error)
        return
    by_id = {str(row.get("id")): row for row in rows if isinstance(row, dict)}

    for asset_id, coin_id, symbol, yahoo_symbol in CRYPTO:
        row = by_id.get(coin_id)
        price = _to_float((row or {}).get("current_price"))
        if not row or price is None or price <= 0:
            run.fail(asset_id, "coingecko", "coin missing from the markets response")
            continue
        series_source = "coingecko"
        try:
            dates, values = _coingecko_series(run, coin_id)
        except RuntimeError as error:
            # The public tier rate-limits history calls; Yahoo carries the same daily closes.
            print(f"[markets] {asset_id}: CoinGecko history unavailable ({error}), using Yahoo", flush=True)
            try:
                chart = _yahoo_chart(run.fetcher, yahoo_symbol)
                dates, values, series_source = chart["dates"], chart["closes"], "yahoo"
            except RuntimeError as yahoo_error:
                run.fail(asset_id, "coingecko", f"no price history: {yahoo_error}")
                continue
        as_of = str(row.get("last_updated") or "").replace(".000Z", "+00:00").replace("Z", "+00:00") or None
        # Pin today's point to the live price so level and changes agree.
        today = (as_of or run.fetched_at)[:10]
        if dates[-1] == today:
            values[-1] = price
        elif dates[-1] < today:
            dates.append(today)
            values.append(price)

        asset, series = build_asset_doc(
            asset_id=asset_id,
            asset_class="crypto",
            name=str(row.get("name") or symbol),
            symbol=symbol,
            dates=dates,
            values=values,
            price=price,
            unit="USD",
            source="coingecko",
            source_url=f"https://www.coingecko.com/en/coins/{coin_id}",
            as_of=as_of,
            fetched_at=run.fetched_at,
            order=int(_to_float(row.get("market_cap_rank")) or 999),
            extra={
                "currency": "USD",
                "source_symbol": coin_id,
                "series_source": series_source,
                "market_cap": _to_float(row.get("market_cap")),
                "market_cap_rank": _to_float(row.get("market_cap_rank")),
                "volume_24h": _to_float(row.get("total_volume")),
                "circulating_supply": _to_float(row.get("circulating_supply")),
                "ath": _to_float(row.get("ath")),
                "ath_date": str(row.get("ath_date") or "")[:10] or None,
                "image": row.get("image"),
            },
        )
        # CoinGecko's own rolling windows are exact to the minute; prefer them
        # over day-bar arithmetic for the windows it reports.
        for key, field in (
            ("d1", "price_change_percentage_24h_in_currency"),
            ("w1", "price_change_percentage_7d_in_currency"),
            ("m1", "price_change_percentage_30d_in_currency"),
            ("y1", "price_change_percentage_1y_in_currency"),
        ):
            reported = _to_float(row.get(field))
            if reported is not None:
                asset["change"][key] = round(reported, 2)
        run.add(asset, series)


def collect_predictions(run: Run) -> None:
    found: list[dict[str, Any]] = []

    for series_ticker, topic, keep in KALSHI_SERIES:
        url = (
            "https://api.elections.kalshi.com/trade-api/v2/events"
            f"?series_ticker={series_ticker}&status=open&with_nested_markets=true&limit=20"
        )
        try:
            payload = run.fetcher.json(url, ttl=600, pause=0.4)
        except RuntimeError as error:
            run.fail(f"kalshi:{series_ticker}", "kalshi", error)
            continue
        docs = []
        for event in payload.get("events") or []:
            doc = parse_kalshi_event(event, topic, run.fetched_at)
            if doc and doc.get("close_time") and doc["close_time"] > run.fetched_at[:19]:
                docs.append(doc)
        docs.sort(key=lambda doc: doc["close_time"])
        if not docs:
            run.fail(f"kalshi:{series_ticker}", "kalshi", "no open event with active markets")
        found.extend(docs[:keep])

    poly: dict[str, dict[str, Any]] = {}
    poly_failed = 0
    for tag in POLYMARKET_TAGS:
        url = (
            "https://gamma-api.polymarket.com/events?closed=false&limit=30"
            f"&order=volume24hr&ascending=false&tag_slug={tag}"
        )
        try:
            events = run.fetcher.json(url, ttl=600, pause=0.4)
        except RuntimeError as error:
            poly_failed += 1
            run.fail(f"polymarket:{tag}", "polymarket", error)
            continue
        for event in events if isinstance(events, list) else []:
            if not isinstance(event, dict) or not polymarket_relevant(str(event.get("title") or "")):
                continue
            doc = parse_polymarket_event(event, run.fetched_at)
            if not doc or not doc.get("close_time") or doc["close_time"] <= run.fetched_at[:19]:
                continue
            # Thin markets say little; skip anything that has barely traded.
            if (doc.get("volume") or 0) < 25_000:
                continue
            poly[doc["id"]] = doc
    ranked = sorted(poly.values(), key=lambda doc: doc.get("volume_24h") or 0, reverse=True)
    found.extend([doc for doc in ranked if doc["topic"] != "election"][:POLYMARKET_MAX_EVENTS])
    found.extend([doc for doc in ranked if doc["topic"] == "election"][:POLYMARKET_MAX_ELECTION_EVENTS])

    topic_rank = {
        "fed": 0, "inflation": 1, "recession": 2, "jobs": 3, "growth": 4, "stocks": 5, "economy": 6, "election": 7,
    }
    found.sort(key=lambda doc: (topic_rank.get(doc["topic"], 9), doc.get("close_time") or ""))
    for order, doc in enumerate(found):
        doc["order"] = order
        history = _prediction_history(run, doc)
        for outcome in doc["outcomes"]:
            outcome.pop("ref", None)
        if history:
            doc["has_history"] = True
            run.other.append(
                (
                    f"{PREDICTION_HISTORY_COLLECTION}/{doc['id']}",
                    {
                        "id": doc["id"],
                        "series": history,
                        "source": doc["source"],
                        "source_name": doc["source_name"],
                        "as_of": run.fetched_at,
                        "fetched_at": run.fetched_at,
                    },
                )
            )
        run.predictions[doc["id"]] = doc


def _prediction_history(run: Run, doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Daily probability of the leading outcomes of one market. Empty when the venue has none."""
    if doc["kind"] == "binary":
        chosen = doc["outcomes"][:1]
    else:
        chosen = sorted(doc["outcomes"], key=lambda outcome: outcome["probability"], reverse=True)[:_HISTORY_OUTCOMES]
    day = int(time.time()) // 86400 * 86400
    series: list[dict[str, Any]] = []
    for outcome in chosen:
        ref = outcome.get("ref")
        if not ref:
            continue
        try:
            if doc["source"] == "polymarket":
                url = f"https://clob.polymarket.com/prices-history?market={ref}&interval=max&fidelity=1440"
                dates, values = parse_polymarket_history(run.fetcher.json(url, ttl=3 * 3600, pause=0.3, retries=2))
            else:
                series_ticker = doc["source_url"].rstrip("/").rsplit("/", 1)[-1].upper()
                url = (
                    f"https://api.elections.kalshi.com/trade-api/v2/series/{series_ticker}/markets/{ref}/candlesticks"
                    f"?start_ts={day - 365 * 86400}&end_ts={day + 86400}&period_interval=1440"
                )
                dates, values = parse_kalshi_candles(run.fetcher.json(url, ttl=3 * 3600, pause=0.4, retries=2))
        except RuntimeError as error:
            print(f"[markets] {doc['id']}: no history for {outcome['label']!r} ({error})", flush=True)
            continue
        if len(dates) < 2:
            continue
        # Close the line on the probability the card shows.
        today = run.fetched_at[:10]
        if dates[-1] == today:
            values[-1] = outcome["probability"]
        elif dates[-1] < today:
            dates.append(today)
            values.append(outcome["probability"])
        series.append({"label": outcome["label"], "dates": dates, "values": values})
    return series


COLLECTORS: dict[str, Callable[[Run], None]] = {
    "index": collect_indices,
    "etf": collect_etfs,
    "rate": collect_rates,
    "commodity": collect_commodities,
    "fx": collect_fx,
    "crypto": collect_crypto,
    "option": collect_options,
    "prediction": collect_predictions,
}

_ALIASES = {
    "indices": "index",
    "indexes": "index",
    "etfs": "etf",
    "rates": "rate",
    "commodities": "commodity",
    "currencies": "fx",
    "options": "option",
    "crypto-assets": "crypto",
    "predictions": "prediction",
}

REFRESH_NOTES = [
    {"source": "yahoo", "covers": "indices, ETFs, commodity futures, FX", "refresh": "every 15 minutes in market hours"},
    {"source": "treasury", "covers": "Treasury yields and the 2s10s spread", "refresh": "once a day after 4pm ET"},
    {"source": "coingecko", "covers": "crypto", "refresh": "every 15 minutes, all week"},
    {"source": "cboe", "covers": "implied volatility by horizon and put/call ratios", "refresh": "once a day after the close"},
    {"source": "kalshi", "covers": "prediction markets", "refresh": "every 30 minutes"},
    {"source": "polymarket", "covers": "prediction markets", "refresh": "every 30 minutes"},
]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run_job(
    classes: list[str], *, dry_run: bool = False, use_cache: bool = True, store: DocStore | None = None
) -> dict[str, Any]:
    run = Run(Fetcher(use_cache=use_cache))
    for asset_class in classes:
        print(f"[markets] collecting {asset_class}", flush=True)
        try:
            COLLECTORS[asset_class](run)
        except Exception as error:  # one class failing must not lose the others
            run.fail(asset_class, asset_class, f"{type(error).__name__}: {error}")

    counts = {asset_class: 0 for asset_class in CLASSES}
    for asset in run.assets.values():
        counts[asset["class"]] += 1
    counts["prediction"] = len(run.predictions)

    summary: dict[str, Any] = {
        "as_of": run.fetched_at,
        "classes_run": classes,
        "counts": counts,
        "failures": run.failures,
        "written": 0,
        "dry_run": dry_run,
    }
    if dry_run:
        return summary

    store = store or DocStore.from_env()
    previous = store.get(f"{META_COLLECTION}/latest") or {}

    # Ids the app should show: everything written now, plus assets of a class
    # that was skipped or failed this run and still has a doc from an earlier one
    # (the page shows its own, older, as-of time).
    asset_ids = list(run.assets)
    carried = [
        asset_id
        for asset_id in previous.get("asset_ids") or []
        if asset_id not in run.assets and isinstance(asset_id, str)
    ]
    configured = {asset_id for ids in run.expected.values() for asset_id in ids}
    known = _all_configured_ids()
    carried = [asset_id for asset_id in carried if asset_id in known]
    stale_kept = [asset_id for asset_id in carried if asset_id in configured]
    asset_ids.extend(carried)

    if "prediction" in classes and run.predictions:
        prediction_ids = list(run.predictions)
    else:
        prediction_ids = [pid for pid in previous.get("prediction_ids") or [] if isinstance(pid, str)]

    docs: Docs = []
    docs.extend((f"{ASSETS_COLLECTION}/{asset_id}", asset) for asset_id, asset in run.assets.items())
    docs.extend((f"{SERIES_COLLECTION}/{asset_id}", series) for asset_id, series in run.series.items())
    docs.extend((f"{PREDICTION_COLLECTION}/{pid}", doc) for pid, doc in run.predictions.items())
    docs.extend(run.other)

    previous_counts = previous.get("counts") if isinstance(previous.get("counts"), dict) else {}
    merged_counts = {
        asset_class: counts[asset_class] if asset_class in classes else int(previous_counts.get(asset_class) or 0)
        for asset_class in CLASSES
    }
    meta = {
        "as_of": run.fetched_at,
        "asset_ids": asset_ids,
        "prediction_ids": prediction_ids,
        "counts": merged_counts,
        "last_run": {
            "at": run.fetched_at,
            "classes": classes,
            "counts": {asset_class: counts[asset_class] for asset_class in classes},
            "failures": run.failures,
            "stale_kept": stale_kept,
        },
        "sources": [{**SOURCES[note["source"]], **note} for note in REFRESH_NOTES],
    }
    docs.append((f"{META_COLLECTION}/latest", meta))
    summary["written"] = store.set_many(docs)
    summary["stale_kept"] = stale_kept
    summary["store"] = store.mode
    return summary


def _all_configured_ids() -> set[str]:
    ids = {row[0] for row in INDICES} | {row[0].lower() for row in ETFS} | {row[0] for row in COMMODITIES}
    ids |= {row[0] for row in FX} | {row[0] for row in CRYPTO} | {"us2s10s"}
    ids |= {row[1] for row in TREASURY_TENORS if row[1]}
    ids |= {row[0] for row in CBOE_INDICES} | {row[0] for row in CBOE_PUT_CALL}
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh multi-asset market coverage in the document store.")
    parser.add_argument("--only", default="", help="comma-separated classes: " + ", ".join(CLASSES))
    parser.add_argument("--dry-run", action="store_true", help="fetch and report, write nothing")
    parser.add_argument("--no-cache", action="store_true", help="ignore the on-disk HTTP cache")
    args = parser.parse_args()

    classes = list(CLASSES)
    if args.only.strip():
        classes = []
        for raw in args.only.split(","):
            name = _ALIASES.get(raw.strip().lower(), raw.strip().lower())
            if name not in COLLECTORS:
                parser.error(f"unknown class {raw!r}; choose from {', '.join(CLASSES)}")
            if name not in classes:
                classes.append(name)

    summary = run_job(classes, dry_run=args.dry_run, use_cache=not args.no_cache)
    print("[markets] counts: " + ", ".join(f"{name}={summary['counts'][name]}" for name in classes), flush=True)
    if summary["failures"]:
        print(f"[markets] {len(summary['failures'])} failed:", flush=True)
        for failure in summary["failures"]:
            print(f"  - {failure['item']} ({failure['source']}): {failure['reason']}", flush=True)
    else:
        print("[markets] no failures", flush=True)
    if args.dry_run:
        print("[markets] dry run: nothing written", flush=True)
    else:
        print(f"[markets] wrote {summary['written']} documents ({summary.get('store')})", flush=True)
    # A partial run is still useful; only a run that produced nothing is an error.
    return 0 if sum(summary["counts"].values()) > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
