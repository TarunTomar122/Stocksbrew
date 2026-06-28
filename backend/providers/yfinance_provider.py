"""Yahoo Finance market-data helpers for Trace Money."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import math
import time
from typing import Any

import yfinance as yf


def _to_float(value: Any, default: float = 0.0) -> float:
    if value in (None, "", "null"):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    if value in (None, "", "null"):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default


def _finite_positive(value: Any) -> float | None:
    num = _to_float(value, default=float("nan"))
    if not math.isfinite(num) or num <= 0:
        return None
    return num


def _fast_info_get(fast_info: Any, key: str) -> Any:
    if fast_info is None:
        return None
    getter = getattr(fast_info, "get", None)
    if callable(getter):
        return getter(key)
    return getattr(fast_info, key, None)


def _resolve_quote_fields(
    *,
    info: dict[str, Any],
    fast_info: Any,
    history_current: float,
    history_previous_close: float,
    history_open: float,
    history_high: float,
    history_low: float,
    history_volume: float,
    history_captured_at: str,
) -> tuple[float, float, float, float, float, float, float, float, str]:
    """Prefer Yahoo live market fields over incomplete daily history bars."""
    current = (
        _finite_positive(info.get("regularMarketPrice"))
        or _finite_positive(info.get("currentPrice"))
        or _finite_positive(info.get("postMarketPrice"))
        or _finite_positive(_fast_info_get(fast_info, "lastPrice"))
        or _finite_positive(history_current)
    )
    previous_close = (
        _finite_positive(info.get("regularMarketPreviousClose"))
        or _finite_positive(info.get("previousClose"))
        or _finite_positive(_fast_info_get(fast_info, "previousClose"))
        or _finite_positive(history_previous_close)
    )
    current = current or 0.0
    previous_close = previous_close or 0.0

    pct_raw = info.get("regularMarketChangePercent")
    if pct_raw not in (None, "", "null"):
        day_change_pct = _to_float(pct_raw, default=float("nan"))
        if math.isfinite(day_change_pct):
            day_change_abs = _to_float(info.get("regularMarketChange"), default=float("nan"))
            if not math.isfinite(day_change_abs):
                day_change_abs = current - previous_close
        else:
            day_change_abs = current - previous_close
            day_change_pct = ((day_change_abs / previous_close) * 100.0) if previous_close else 0.0
    else:
        day_change_abs = current - previous_close
        day_change_pct = ((day_change_abs / previous_close) * 100.0) if previous_close else 0.0

    open_price = _finite_positive(info.get("regularMarketOpen")) or _finite_positive(history_open) or 0.0
    high = _finite_positive(info.get("regularMarketDayHigh")) or _finite_positive(history_high) or 0.0
    low = _finite_positive(info.get("regularMarketDayLow")) or _finite_positive(history_low) or 0.0
    volume = _to_float(info.get("regularMarketVolume")) or history_volume

    using_live = bool(
        _finite_positive(info.get("regularMarketPrice"))
        or _finite_positive(info.get("currentPrice"))
        or _finite_positive(_fast_info_get(fast_info, "lastPrice"))
    )
    captured_at = datetime.now(timezone.utc).isoformat() if using_live else history_captured_at
    return current, previous_close, open_price, high, low, volume, day_change_abs, day_change_pct, captured_at


def yahoo_symbol_for(instrument: dict[str, Any]) -> str:
    explicit = str(instrument.get("quote_symbol_yahoo", "")).strip()
    if explicit:
        return explicit
    symbol = str(instrument.get("quote_symbol", instrument.get("ticker", ""))).strip().upper()
    # Block Inc. migrated ticker from SQ -> XYZ. Keep backward compatibility
    # for legacy instrument IDs/tickers until the universe is fully renamed.
    if instrument.get("market") == "US" and symbol == "SQ":
        return "XYZ"
    exchange = str(instrument.get("quote_exchange", instrument.get("exchange", ""))).strip().upper()
    if instrument.get("market") == "IN":
        if exchange == "BSE":
            return f"{symbol}.BO"
        return f"{symbol}.NS"
    return symbol


def _history_metrics(history) -> tuple[float, float, float, float, float, float, str]:
    if history is None or getattr(history, "empty", True):
        return 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, datetime.now(timezone.utc).isoformat()
    latest = history.iloc[-1]
    previous_close = float(history.iloc[-2]["Close"]) if len(history) > 1 else _to_float(latest.get("Open"))
    open_price = _to_float(latest.get("Open"))
    high = _to_float(latest.get("High"))
    low = _to_float(latest.get("Low"))
    current = _to_float(latest.get("Close"))
    if not math.isfinite(current):
        for fallback in (high, open_price, previous_close):
            if math.isfinite(fallback) and fallback > 0:
                current = fallback
                break
    volume = _to_float(latest.get("Volume"))
    captured_at = getattr(latest.name, "to_pydatetime", lambda: datetime.now(timezone.utc))()
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=timezone.utc)
    return current, previous_close, open_price, high, low, volume, captured_at.astimezone(timezone.utc).isoformat()


def _consensus_label(info: dict[str, Any]) -> str:
    key = str(info.get("recommendationKey", "")).strip().replace("_", " ")
    if key:
        return key.title()
    target_mean = _to_float(info.get("targetMeanPrice"))
    current_price = _to_float(info.get("currentPrice"))
    if current_price and target_mean:
        if target_mean >= current_price * 1.1:
            return "Buy"
        if target_mean <= current_price * 0.95:
            return "Sell"
        return "Hold"
    return ""


class YFinanceClient:
    def __init__(self, max_workers: int = 6, max_retries: int = 2, retry_backoff_s: float = 0.5) -> None:
        self.max_workers = max(1, max_workers)
        self.max_retries = max(0, max_retries)
        self.retry_backoff_s = max(0.0, retry_backoff_s)

    def _fetch_one_with_retry(self, instrument: dict[str, Any]) -> dict[str, Any]:
        last_exc: Exception | None = None
        attempts = self.max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                return self._fetch_one(instrument)
            except Exception as exc:
                last_exc = exc
                if attempt < attempts:
                    time.sleep(self.retry_backoff_s * attempt)
        if last_exc is None:
            raise RuntimeError("unknown yfinance fetch failure")
        raise last_exc

    def _fetch_one(self, instrument: dict[str, Any]) -> dict[str, Any]:
        yahoo_symbol = yahoo_symbol_for(instrument)
        ticker = yf.Ticker(yahoo_symbol)
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        hist_current, hist_prev, hist_open, hist_high, hist_low, hist_volume, hist_captured_at = _history_metrics(history)
        fast_info = getattr(ticker, "fast_info", None)
        info = ticker.info or {}

        current, previous_close, open_price, high, low, volume, day_change_abs, day_change_pct, captured_at = _resolve_quote_fields(
            info=info,
            fast_info=fast_info,
            history_current=hist_current,
            history_previous_close=hist_prev,
            history_open=hist_open,
            history_high=hist_high,
            history_low=hist_low,
            history_volume=hist_volume,
            history_captured_at=hist_captured_at,
        )

        market_cap = _to_float(info.get("marketCap")) or _to_float(getattr(fast_info, "get", lambda _key, _default=None: None)("marketCap"))
        pe_ttm = _to_float(info.get("trailingPE"))
        dividend_yield_raw = info.get("dividendYield")
        dividend_yield = _to_float(dividend_yield_raw)
        if dividend_yield > 1:
            dividend_yield = dividend_yield / 100.0
        annual_dividend = _to_float(info.get("dividendRate"))
        week_52_high = _to_float(info.get("fiftyTwoWeekHigh")) or _to_float(getattr(fast_info, "get", lambda _key, _default=None: None)("yearHigh"))
        week_52_low = _to_float(info.get("fiftyTwoWeekLow")) or _to_float(getattr(fast_info, "get", lambda _key, _default=None: None)("yearLow"))
        target_price = _to_float(info.get("targetMeanPrice"))
        consensus_label = _consensus_label(info)
        # Trend signals - Yahoo pre-computes 50D/200D moving averages, so we
        # don't need to stockpile >200 sessions of history on our side just to
        # show a "price vs SMA" card. `beta` comes along for free from the
        # same `.info` payload. All three can be None/absent for illiquid
        # tickers; the builder / UI already guards for missing values.
        fifty_day_avg = _to_float(info.get("fiftyDayAverage"))
        two_hundred_day_avg = _to_float(info.get("twoHundredDayAverage"))
        beta_raw = info.get("beta")
        beta: float | None
        if beta_raw in (None, "", "null"):
            beta = None
        else:
            try:
                beta = round(float(beta_raw), 2)
            except (TypeError, ValueError):
                beta = None

        return {
            "symbol": str(instrument.get("ticker", yahoo_symbol)),
            "yahoo_symbol": yahoo_symbol,
            "name": info.get("shortName") or instrument.get("name", ""),
            "exchange": instrument.get("exchange", ""),
            "currency": info.get("currency") or instrument.get("currency", "USD"),
            "captured_at": captured_at,
            "quote": {
                "current": current,
                "day_change_abs": day_change_abs,
                "day_change_pct": day_change_pct,
                "open": open_price,
                "high": high,
                "low": low,
                "previous_close": previous_close,
                "volume": volume,
            },
            "fundamentals": {
                "market_cap": market_cap,
                "pe_ttm": pe_ttm,
                "dividend_yield": dividend_yield,
                "annual_dividend": annual_dividend,
                "week_52_low": week_52_low,
                "week_52_high": week_52_high,
                # Trend card + risk-surfacing fields (see above).
                "fifty_day_average": fifty_day_avg or None,
                "two_hundred_day_average": two_hundred_day_avg or None,
                "beta": beta,
            },
            "analyst_consensus": {
                "label": consensus_label,
                "target_price": target_price,
                "buy": _to_int(info.get("numberOfAnalystOpinions")),
                "hold": 0,
                "sell": 0,
            },
        }

    def fetch_quotes(self, instruments: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        if not instruments:
            return {}
        rows: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(instruments))) as executor:
            futures = {executor.submit(self._fetch_one_with_retry, instrument): instrument for instrument in instruments}
            for future in as_completed(futures):
                instrument = futures[future]
                try:
                    rows[instrument["instrument_id"]] = future.result()
                except Exception as exc:
                    print(
                        f"yfinance fetch failed for {instrument.get('instrument_id')} "
                        f"after {self.max_retries + 1} attempts: {exc}"
                    )
        return rows


def fetch_yfinance_scorecard_metrics(ticker_symbol: str, market: str) -> dict[str, float]:
    """Scorecard-only fundamentals pulled from Yahoo: Forward P/E, PEG,
    analyst mean target, and an analyst buy % derived from `recommendationMean`.

    Screener.in and Tickertape don't publish forward consensus for IN stocks,
    so these fields used to render as "-" on the scorecard. Yahoo aggregates
    them for most NSE tickers. Returns a dict with only the keys that parsed
    cleanly - callers should treat absence as "not available", same as every
    other scraper.
    """
    if market == "IN":
        yahoo_symbol = f"{ticker_symbol.upper()}.NS"
    else:
        yahoo_symbol = ticker_symbol.upper()

    try:
        info = yf.Ticker(yahoo_symbol).info or {}
    except Exception as exc:  # yfinance raises on transient network hiccups
        print(f"  [yfinance fail] {ticker_symbol}: {exc}")
        return {}

    out: dict[str, float] = {}

    def _set(canonical: str, raw: Any) -> None:
        if raw in (None, "", "null"):
            return
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return
        if value <= 0:
            return
        out.setdefault(canonical, value)

    _set("fwd_pe", info.get("forwardPE"))
    _set("peg", info.get("trailingPegRatio"))
    _set("peg", info.get("pegRatio"))  # fallback if trailingPeg missing
    _set("target_price", info.get("targetMeanPrice"))
    # Trend card inputs - Yahoo pre-computes the 50D / 200D moving averages
    # so we don't have to carry >200 sessions of price history per instrument.
    # We also grab beta for the same cheap-`.info`-read reason.
    _set("fifty_day_average", info.get("fiftyDayAverage"))
    _set("two_hundred_day_average", info.get("twoHundredDayAverage"))
    # Beta can legitimately be negative (inverse ETFs, hedges) or near zero
    # (stable utilities), so we don't use `_set` - it would drop those.
    beta_raw = info.get("beta")
    if beta_raw not in (None, "", "null"):
        try:
            out["beta"] = round(float(beta_raw), 2)
        except (TypeError, ValueError):
            pass

    # Yahoo's `recommendationMean` is 1=strong buy, 5=strong sell. Linearly
    # map 1 → 100 and 5 → 0 so the momentum pillar's `analyst_buy_pct` curve
    # (already defined in stock_scoring.py) gets a usable value for IN stocks.
    mean = info.get("recommendationMean")
    if mean not in (None, "", "null"):
        try:
            m = float(mean)
            if 1.0 <= m <= 5.0:
                out["analyst_buy_pct"] = round(max(0.0, (5.0 - m) / 4.0 * 100.0), 1)
        except (TypeError, ValueError):
            pass

    return out


def fetch_premarket_quotes(
    instruments: list[dict[str, Any]],
    *,
    max_workers: int = 6,
) -> dict[str, dict[str, Any]]:
    """Fetch pre-market quotes for a focused set of instruments.

    Yahoo's `.info` payload carries pre-market fields during the pre-market
    session (marketState == "PRE"). Outside that window, or for illiquid names
    with no pre-market print, preMarketPrice is None and the name is skipped.

    Returns {instrument_id: {ticker, pre_market_price, previous_close,
    pre_market_change_pct, market_state, captured_at}} for names that actually
    have a pre-market quote.
    """
    if not instruments:
        return {}

    def _one(instrument: dict[str, Any]) -> dict[str, Any] | None:
        yahoo_symbol = yahoo_symbol_for(instrument)
        try:
            info = yf.Ticker(yahoo_symbol).info or {}
        except Exception:
            return None
        state = str(info.get("marketState") or "")
        pre = _to_float(info.get("preMarketPrice"), default=0.0)
        if pre <= 0:
            return None
        prev_close = _to_float(info.get("regularMarketPreviousClose")) or _to_float(
            info.get("previousClose")
        )
        if prev_close <= 0:
            return None
        # Prefer Yahoo's own pct, fall back to computing the gap ourselves.
        pct = info.get("preMarketChangePercent")
        try:
            pct = float(pct)
        except (TypeError, ValueError):
            pct = ((pre - prev_close) / prev_close) * 100.0
        return {
            "ticker": str(instrument.get("ticker", yahoo_symbol)),
            "pre_market_price": round(pre, 4),
            "previous_close": round(prev_close, 4),
            "pre_market_change_pct": round(pct, 2),
            "market_state": state,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }

    rows: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(max_workers, len(instruments))) as executor:
        futures = {executor.submit(_one, inst): inst for inst in instruments}
        for future in as_completed(futures):
            inst = futures[future]
            try:
                result = future.result()
            except Exception:
                result = None
            if result:
                rows[inst["instrument_id"]] = result
    return rows


def _weekly_change_from_history(history: Any) -> tuple[float, float, float] | None:
    if history is None or getattr(history, "empty", True):
        return None
    frame = history.iloc[-5:] if len(history) >= 5 else history
    if len(frame) < 2:
        return None
    week_start = _to_float(frame.iloc[0]["Close"])
    week_end = _to_float(frame.iloc[-1]["Close"])
    if week_start <= 0 or week_end <= 0:
        return None
    pct = ((week_end - week_start) / week_start) * 100.0
    return week_end, week_start, round(pct, 2)


def fetch_weekly_quotes(
    instruments: list[dict[str, Any]],
    *,
    max_workers: int = 6,
) -> dict[str, dict[str, Any]]:
    """Fetch trailing 5-session weekly change for a focused instrument set."""
    if not instruments:
        return {}

    def _one(instrument: dict[str, Any]) -> dict[str, Any] | None:
        yahoo_symbol = yahoo_symbol_for(instrument)
        try:
            history = yf.Ticker(yahoo_symbol).history(period="10d", interval="1d", auto_adjust=False)
        except Exception:
            return None
        metrics = _weekly_change_from_history(history)
        if metrics is None:
            return None
        price, week_start, pct = metrics
        return {
            "ticker": str(instrument.get("ticker", yahoo_symbol)).strip().upper(),
            "price": round(price, 4),
            "week_start_price": round(week_start, 4),
            "week_change_pct": pct,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }

    rows: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(max_workers, len(instruments))) as executor:
        futures = {executor.submit(_one, inst): inst for inst in instruments}
        for future in as_completed(futures):
            inst = futures[future]
            try:
                result = future.result()
            except Exception:
                result = None
            if result:
                rows[inst["instrument_id"]] = result
    return rows
