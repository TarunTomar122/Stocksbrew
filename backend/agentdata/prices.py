"""Multi-year daily price history, shared by follow performance and backtests.

Source: Yahoo's public chart endpoint (the same data yfinance wraps), fetched
with the standard library. Closes are adjusted for splits and dividends, so a
series is a total-return series.

Storage: one document per symbol in ``tm_price_history_daily/{SYMBOL}``::

    {symbol, currency, first_date, last_date, count, dates: [...], closes: [...],
     source: "yahoo_chart", fetched_at}

A local file cache under ``backend/.cache/prices`` keeps repeat runs polite.

Every write of a history also writes its tail, ``tm_price_tail/{SYMBOL}``: the
last ``TAIL_POINTS`` entries of ``dates`` and ``closes`` and the store hash of
the history doc they were cut from (``tail_doc``). Pages that only need the
last two years or so read the ~14 KB tail instead of the ~60 KB history, and use it
only while that hash is still the history's (lib/price-tail.ts); otherwise they
read the history itself.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .store import DocStore

COLLECTION = "tm_price_history_daily"
TAIL_COLLECTION = "tm_price_tail"
# Entries kept in a tail (~2.5 years). The portfolio series and the recent screener series need the last 400
# (lib/portfolio-data.ts, lib/screener-series.ts); the earnings planner needs the session before each of the last 8
# reports, about two years and a quarter back (lib/earnings-season-data.ts).
TAIL_POINTS = 640
# Bump with lib/price-tail.ts PRICE_TAIL_VERSION when the layout changes.
TAIL_VERSION = 2
_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "prices"
_CACHE_TTL_SECONDS = 20 * 3600
# Yahoo rate-limits full browser user agents on this endpoint; the short form is accepted.
_USER_AGENT = "Mozilla/5.0"
# Parallel chart requests in load_many. Each worker still pauses after every network fetch,
# so three of them stay near 4 requests a second; a 429 is retried with backoff.
FETCH_WORKERS = 3

# How often Yahoo answered 429 (slow down) since the process started; load_many reports it.
_rate_limited = 0
_rate_limited_lock = threading.Lock()


def rate_limited_count() -> int:
    return _rate_limited


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
                if error.code == 429:
                    global _rate_limited
                    with _rate_limited_lock:
                        _rate_limited += 1
                time.sleep(2.0 * (attempt + 1))
                continue
            return None
        # URLError, timeouts and dropped connections (ConnectionResetError, RemoteDisconnected)
        # are all OSError; a truncated body is an http.client.IncompleteRead.
        except (OSError, http.client.HTTPException, json.JSONDecodeError):
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


def _has_fresh_cache(symbol: str, years: int) -> bool:
    cache = _cache_path(symbol, years)
    try:
        return _cache_is_fresh(cache.stat().st_mtime, time.time())
    except FileNotFoundError:
        return False


def fetch_daily(symbol: str, years: int = 12, *, use_cache: bool = True) -> dict[str, Any] | None:
    """Adjusted daily closes for ``symbol``. Returns None when Yahoo has no series."""
    cache = _cache_path(symbol, years)
    if use_cache and _has_fresh_cache(symbol, years):
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
    workers: int = FETCH_WORKERS,
) -> dict[str, dict[str, Any]]:
    """Fetch each symbol (cached), optionally writing it to the document store.

    Up to ``workers`` requests run at once; results come back, and are stored, in
    the order the symbols were given. A symbol whose fetch raises counts as missing
    (and is named in the log) instead of failing every other symbol with it.
    """
    out: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    errors: list[str] = []
    pending: list[tuple[str, dict[str, Any]]] = []
    unique = list(dict.fromkeys(symbol.strip().upper() for symbol in symbols if symbol and symbol.strip()))
    limited_before = rate_limited_count()
    done = 0
    done_lock = threading.Lock()

    def fetch(symbol: str) -> dict[str, Any] | None:
        nonlocal done
        from_network = not _has_fresh_cache(symbol, years)
        try:
            document = fetch_daily(symbol, years)
        except Exception as error:  # one bad reply must not cost the other symbols
            with done_lock:
                errors.append(f"{symbol}: {type(error).__name__}")
            document = None
        if from_network:
            time.sleep(pause)
        with done_lock:
            done += 1
            count = done
        if log and count % 50 == 0:
            print(f"[prices] {count}/{len(unique)} fetched", flush=True)
        return document

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        results = list(pool.map(fetch, unique))
    for symbol, document in zip(unique, results):
        if document is None:
            missing.append(symbol)
        else:
            out[symbol] = document
            if store is not None:
                pending.append((f"{COLLECTION}/{doc_id(symbol)}", document))
                if len(pending) >= 25:
                    store.set_many(with_tails(pending))
                    pending = []
    if store is not None and pending:
        store.set_many(with_tails(pending))
    # Always said, even with log=False: dropped symbols and a slow-down from Yahoo are what
    # explain a thin or late price refresh.
    limited = rate_limited_count() - limited_before
    if errors or limited:
        print(f"[prices] {len(errors)} fetches failed {errors[:12]}, Yahoo asked to slow down {limited} times", flush=True)
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


# -- tails ---------------------------------------------------------------------


def tail_doc(path: str, document: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """The tail of the history ``document`` stored at ``path``, as (tail path, tail data).

    Entries are cut by index, not by date, from the first ``n`` of both arrays (``n`` the shorter length), so entry
    ``pt_from + i`` of the history is entry ``i`` of the tail. ``pt_src`` is the store's hash of exactly this
    document (``backend/localdb/codec.py stable_document_hash``, the hash the store records on a write), which is
    how a reader proves the tail is current. ``pt_ordered`` says every date in the history is a string later than
    the one before it, so a filter-and-sort of the tail is the tail of the same filter-and-sort of the history.
    The arrays sit one level down (``pt_data``) so the store does not index them as array fields.
    None when the document has no arrays to cut.
    """
    from backend.localdb.codec import stable_document_hash

    dates = document.get("dates")
    closes = document.get("closes")
    if not isinstance(dates, list) or not isinstance(closes, list) or "/" not in path:
        return None
    count = min(len(dates), len(closes))
    start = max(0, count - TAIL_POINTS)
    head = dates[:count]
    ordered = all(isinstance(day, str) for day in head) and all(head[i] < head[i + 1] for i in range(count - 1))
    return (
        f"{TAIL_COLLECTION}/{path.split('/', 1)[1]}",
        {
            "pt_v": TAIL_VERSION,
            "pt_src": stable_document_hash(path, document),
            "pt_n": count,
            "pt_from": start,
            "pt_ordered": ordered,
            "pt_source": document.get("source"),
            "pt_fetched_at": document.get("fetched_at"),
            "pt_instrument_type": document.get("instrument_type"),
            "pt_built_at": datetime.now(timezone.utc).isoformat(),
            "pt_data": {"dates": dates[start:count], "closes": closes[start:count]},
        },
    )


def with_tails(docs: list[tuple[str, dict[str, Any]]]) -> list[tuple[str, dict[str, Any]]]:
    """``docs`` followed by the tail of each history among them, for one write: a tail never lands before its history."""
    tails = [tail for path, data in docs if path.startswith(f"{COLLECTION}/") for tail in [tail_doc(path, data)] if tail]
    return list(docs) + tails


def stale_tails(store: DocStore, stored: dict[str, dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    """Tails to write for histories already in the store (``{history path: data}``) whose tail is missing or old.

    Only for a history the store still holds exactly as ``stored`` has it: its store hash (read now, in the same
    read as the tails) must be the hash of ``stored``. A history written since (another job), or one whose read-back
    copy hashes differently from what the store recorded (a typed value read back as a string), is left alone, so a
    repair never puts an older or unprovable tail over a good one; ``python3 -m backend.agentdata.price_tails`` cuts
    those from one read of body and hash.
    """
    wanted = {path: tail for path, data in stored.items() for tail in [tail_doc(path, data)] if tail}
    if not wanted:
        return []
    rows = store.read_with_hashes([*wanted, *(tail_path for tail_path, _ in wanted.values())], ["pt_v", "pt_src"])
    out = []
    for path, (tail_path, tail) in wanted.items():
        if (rows.get(path) or {}).get("hash") != tail["pt_src"]:
            continue
        current = (rows.get(tail_path) or {}).get("data") or {}
        if current.get("pt_v") != TAIL_VERSION or current.get("pt_src") != tail["pt_src"]:
            out.append((tail_path, tail))
    return out
