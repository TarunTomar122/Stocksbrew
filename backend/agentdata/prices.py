"""Multi-year daily price history, shared by follow performance and backtests.

Source: Yahoo's public chart endpoint (the same data yfinance wraps), fetched
with the standard library. Closes are adjusted for splits and dividends, so a
series is a total-return series.

Storage: one document per symbol in ``tm_price_history_daily/{SYMBOL}``::

    {symbol, currency, first_date, last_date, count, dates: [...], closes: [...],
     source: "yahoo_chart", fetched_at}

A local file cache under ``backend/.cache/prices`` keeps repeat runs polite.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .store import DocStore

COLLECTION = "tm_price_history_daily"
_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "prices"
_CACHE_TTL_SECONDS = 20 * 3600
# Yahoo rate-limits full browser user agents on this endpoint; the short form is accepted.
_USER_AGENT = "Mozilla/5.0"


# Mirrors SESSION_DONE_UTC in lib/backtest/index.ts.
_SESSION_DONE_UTC = "21:10"


def yahoo_symbol(symbol: str) -> str:
    """BRK.B style tickers are BRK-B on Yahoo."""
    return symbol.strip().upper().replace(".", "-").replace("/", "-")


def doc_id(symbol: str) -> str:
    """Document ids cannot contain a slash; keep the caret for index symbols."""
    return symbol.strip().upper().replace("/", "-")


def _cache_path(symbol: str, years: int) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-_.^=" else "_" for ch in symbol.upper())
    return _CACHE_DIR / f"{safe}__{years}y.json"


def _fetch_chart(symbol: str, years: int) -> dict[str, Any] | None:
    # period1/period2 instead of range: Yahoo only accepts a fixed set of range values.
    now = int(time.time())
    query = urllib.parse.urlencode(
        {
            "period1": now - int(years * 365.25 * 86400),
            "period2": now + 86400,
            "interval": "1d",
            "events": "div,splits",
            "includeAdjustedClose": "true",
        }
    )
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(yahoo_symbol(symbol))}?{query}"
    for attempt in range(4):
        request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            results = (payload.get("chart") or {}).get("result") or []
            return results[0] if results else None
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (429, 500, 502, 503):
                time.sleep(2.0 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(1.5 * (attempt + 1))
    return None


def _cache_is_fresh(written: float, now: float) -> bool:
    """A cached series is reusable while it is recent and no close has happened since.

    Age alone is not enough: a file written at 19:40 UTC (before the US close)
    is "recent" at 22:30 the same day, but it is missing that day's close, and
    the after-close jobs would compute on yesterday's prices.
    """
    if now - written >= _CACHE_TTL_SECONDS:
        return False
    moment = datetime.fromtimestamp(now, tz=timezone.utc)
    hour, minute = (int(part) for part in _SESSION_DONE_UTC.split(":"))
    last_close = moment.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if moment < last_close:
        last_close -= timedelta(days=1)
    # Weekend closes do not exist; step back to Friday's.
    while last_close.weekday() >= 5:
        last_close -= timedelta(days=1)
    return written >= last_close.timestamp()


def fetch_daily(symbol: str, years: int = 12, *, use_cache: bool = True) -> dict[str, Any] | None:
    """Adjusted daily closes for ``symbol``. Returns None when Yahoo has no series."""
    cache = _cache_path(symbol, years)
    if use_cache and cache.exists() and _cache_is_fresh(cache.stat().st_mtime, time.time()):
        try:
            return json.loads(cache.read_text())
        except json.JSONDecodeError:
            pass

    result = _fetch_chart(symbol, years)
    if not result:
        return None
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    adjusted = ((indicators.get("adjclose") or [{}])[0] or {}).get("adjclose") or []
    raw = ((indicators.get("quote") or [{}])[0] or {}).get("close") or []
    series = adjusted if len(adjusted) == len(timestamps) else raw

    dates: list[str] = []
    closes: list[float] = []
    for stamp, close in zip(timestamps, series):
        if close is None or not isinstance(close, (int, float)) or close <= 0:
            continue
        day = datetime.fromtimestamp(int(stamp), tz=timezone.utc).strftime("%Y-%m-%d")
        if dates and dates[-1] == day:
            closes[-1] = round(float(close), 4)
            continue
        dates.append(day)
        closes.append(round(float(close), 4))
    # A bar dated today, fetched while the US session is still open, is a price
    # from the middle of the day and not a close. Storing it would put a wrong
    # last point on every chart and backtest that reads this document. US
    # markets close at 20:00 or 21:00 UTC depending on daylight saving.
    now = datetime.now(timezone.utc)
    if dates and dates[-1] == now.strftime("%Y-%m-%d") and now.strftime("%H:%M") < _SESSION_DONE_UTC:
        dates.pop()
        closes.pop()
    if len(dates) < 2:
        return None

    meta = result.get("meta") or {}
    document = {
        "symbol": symbol.strip().upper(),
        "currency": meta.get("currency"),
        "exchange": meta.get("exchangeName"),
        "instrument_type": meta.get("instrumentType"),
        "first_date": dates[0],
        "last_date": dates[-1],
        "count": len(dates),
        "dates": dates,
        "closes": closes,
        "adjusted": series is adjusted,
        "source": "yahoo_chart",
        "fetched_at": now.isoformat(),
    }
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(document, separators=(",", ":")))
    return document


def load_many(
    symbols: list[str],
    years: int = 12,
    *,
    store: DocStore | None = None,
    pause: float = 0.25,
    log: bool = True,
) -> dict[str, dict[str, Any]]:
    """Fetch each symbol (cached), optionally writing it to the document store."""
    out: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    pending: list[tuple[str, dict[str, Any]]] = []
    unique = list(dict.fromkeys(symbol.strip().upper() for symbol in symbols if symbol and symbol.strip()))
    for index, symbol in enumerate(unique, start=1):
        cached_before = _cache_path(symbol, years).exists()
        document = fetch_daily(symbol, years)
        if document is None:
            missing.append(symbol)
        else:
            out[symbol] = document
            if store is not None:
                pending.append((f"{COLLECTION}/{doc_id(symbol)}", document))
                if len(pending) >= 25:
                    store.set_many(pending)
                    pending = []
        if not cached_before:
            time.sleep(pause)
        if log and index % 50 == 0:
            print(f"[prices] {index}/{len(unique)} fetched, {len(missing)} missing", flush=True)
    if store is not None and pending:
        store.set_many(pending)
    if log:
        print(f"[prices] done: {len(out)} series, {len(missing)} missing {missing[:12]}", flush=True)
    return out


def closes_by_date(document: dict[str, Any]) -> dict[str, float]:
    return dict(zip(document.get("dates") or [], document.get("closes") or []))


def close_on_or_after(document: dict[str, Any], day: str) -> tuple[str, float] | None:
    """First session on or after ``day``: the price a follower could actually get."""
    dates = document.get("dates") or []
    closes = document.get("closes") or []
    low, high = 0, len(dates)
    while low < high:
        mid = (low + high) // 2
        if dates[mid] < day:
            low = mid + 1
        else:
            high = mid
    if low >= len(dates):
        return None
    return dates[low], closes[low]


def close_on_or_before(document: dict[str, Any], day: str) -> tuple[str, float] | None:
    dates = document.get("dates") or []
    closes = document.get("closes") or []
    low, high = 0, len(dates)
    while low < high:
        mid = (low + high) // 2
        if dates[mid] <= day:
            low = mid + 1
        else:
            high = mid
    if low == 0:
        return None
    return dates[low - 1], closes[low - 1]
