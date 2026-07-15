"""Yahoo Finance market-data helpers for Trace Money."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
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
    if instrument.get("market") == "US":
        # Yahoo encodes US share classes with a dash (BF-B, BRK-B), while
        # exchange/display symbols commonly use a dot.
        symbol = symbol.replace(".", "-")
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
    previous_close = (
        _finite_positive(history.iloc[-2]["Close"])
        if len(history) > 1
        else _finite_positive(latest.get("Open"))
    ) or 0.0
    open_price = _finite_positive(latest.get("Open")) or 0.0
    high = _finite_positive(latest.get("High")) or 0.0
    low = _finite_positive(latest.get("Low")) or 0.0
    current = _finite_positive(latest.get("Close")) or high or open_price or previous_close
    raw_volume = _to_float(latest.get("Volume"), default=float("nan"))
    volume = raw_volume if math.isfinite(raw_volume) and raw_volume >= 0 else 0.0
    captured_at = getattr(latest.name, "to_pydatetime", lambda: datetime.now(timezone.utc))()
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=timezone.utc)
    return current, previous_close, open_price, high, low, volume, captured_at.astimezone(timezone.utc).isoformat()


def _row_datetime(row: Any) -> datetime:
    captured = getattr(row.name, "to_pydatetime", lambda: datetime.now(timezone.utc))()
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    return captured.astimezone(timezone.utc)


def _row_date(row: Any) -> Any:
    captured = getattr(row.name, "to_pydatetime", lambda: datetime.now(timezone.utc))()
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    return captured.date()


def _latest_daily_close(history: Any) -> float:
    if history is None or getattr(history, "empty", True):
        return 0.0
    try:
        for value in reversed(history["Close"].tolist()):
            close = _finite_positive(value)
            if close is not None:
                return close
    except (KeyError, IndexError, TypeError, AttributeError):
        pass
    return 0.0


def _previous_daily_close(history: Any) -> float:
    if history is None or getattr(history, "empty", True):
        return 0.0
    try:
        closes = [
            close
            for value in history["Close"].tolist()
            if (close := _finite_positive(value)) is not None
        ]
        if len(closes) > 1:
            return closes[-2]
        if closes:
            return _finite_positive(history.iloc[-1].get("Open")) or closes[-1]
    except (KeyError, IndexError, TypeError, AttributeError):
        pass
    return 0.0


def _previous_close_for_intraday(history: Any, captured_at: datetime, captured_date: Any | None = None) -> float:
    """Pick the close that an intraday print should be compared against.

    Yahoo daily bars may or may not include the current trading day while the
    market is open. If the latest daily bar is older than the intraday print,
    its close is the prior close. If it is the same date, the latest daily bar
    is today's developing bar, so the prior row is the previous close.
    """
    if history is None or getattr(history, "empty", True):
        return 0.0
    latest = history.iloc[-1]
    latest_date = _row_date(latest)
    intraday_date = captured_date or captured_at.date()
    if latest_date < intraday_date:
        return _latest_daily_close(history)
    return _previous_daily_close(history)


def _previous_weekday(value: date) -> date:
    candidate = value - timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def _missing_previous_session_bar(history: Any, captured_date: date) -> bool:
    """Detect when Yahoo's daily frame skipped the prior weekday session.

    Yahoo can publish today's developing daily bar while omitting yesterday's
    completed bar. In that case blindly using the second-to-last row compares
    today's quote with a two-day-old close. Holiday false positives are safe:
    the metadata endpoint returns the same valid previous close.
    """
    if history is None or getattr(history, "empty", True):
        return False
    try:
        dates = [_row_date(history.iloc[index]) for index in range(len(history))]
    except (IndexError, TypeError, AttributeError):
        return False
    eligible = [value for value in dates if value <= captured_date]
    if not eligible:
        return False
    latest_date = eligible[-1]
    if latest_date == captured_date:
        if len(eligible) < 2:
            return True
        comparison_date = eligible[-2]
    else:
        comparison_date = latest_date
    return comparison_date < _previous_weekday(captured_date)


def _metadata_previous_close(symbol: str) -> float | None:
    try:
        metadata = yf.Ticker(symbol).history_metadata or {}
    except Exception as exc:
        print(f"[yfinance metadata previous-close failed] {symbol}: {exc}")
        return None
    return _finite_positive(metadata.get("previousClose"))


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


def _download_symbol_frame(frame: Any, symbol: str, *, single: bool) -> Any:
    try:
        return frame.xs(symbol, level="Ticker", axis=1)
    except (KeyError, TypeError, ValueError):
        pass
    try:
        return frame[symbol]
    except (KeyError, TypeError):
        pass
    if not single:
        return None

    columns = getattr(frame, "columns", None)
    if getattr(columns, "nlevels", 1) <= 1:
        return frame
    for level in range(columns.nlevels):
        try:
            values = set(str(value).upper() for value in columns.get_level_values(level))
        except (AttributeError, IndexError, TypeError):
            continue
        if values == {symbol.upper()}:
            return frame.droplevel(level, axis=1)
    return frame


def _batch_download_frames(symbols: list[str], *, period: str, interval: str, prepost: bool = False) -> dict[str, Any]:
    if not symbols:
        return {}
    try:
        frame = yf.download(
            tickers=symbols,
            period=period,
            interval=interval,
            auto_adjust=False,
            group_by="ticker",
            threads=True,
            progress=False,
            prepost=prepost,
        )
    except Exception as exc:
        print(f"[yfinance batch download failed] {period}/{interval}: {exc}")
        return {}

    single = len(symbols) == 1
    out: dict[str, Any] = {}
    for symbol in symbols:
        symbol_frame = _download_symbol_frame(frame, symbol, single=single)
        if symbol_frame is None or getattr(symbol_frame, "empty", True):
            continue
        try:
            valid_close = symbol_frame["Close"].map(lambda value: _finite_positive(value) is not None)
            symbol_frame = symbol_frame.loc[valid_close]
        except (KeyError, TypeError, AttributeError):
            pass
        if not getattr(symbol_frame, "empty", True):
            out[symbol] = symbol_frame
    return out


def _batch_download_quote_only(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Cheap live-ish quote rows without Yahoo .info."""
    daily_by_symbol = _batch_download_frames(symbols, period="5d", interval="1d")
    intraday_by_symbol = _batch_download_frames(symbols, period="1d", interval="1m")
    rows: dict[str, dict[str, Any]] = {}
    metadata_symbols: list[str] = []

    for symbol in symbols:
        daily = daily_by_symbol.get(symbol)
        if daily is None:
            continue
        hist_current, prev_close, open_price, high, low, volume, daily_at = _history_metrics(daily)
        current = hist_current
        captured_at = daily_at

        intraday = intraday_by_symbol.get(symbol)
        if intraday is not None and not getattr(intraday, "empty", True):
            latest = intraday.iloc[-1]
            intraday_current = _finite_positive(latest.get("Close"))
            if intraday_current:
                current = intraday_current
                captured = _row_datetime(latest)
                captured_at = captured.isoformat()
                prev_close = _previous_close_for_intraday(daily, captured, captured_date=_row_date(latest))
                if _missing_previous_session_bar(daily, _row_date(latest)):
                    metadata_symbols.append(symbol)

        day_change_abs = current - prev_close if prev_close else 0.0
        day_change_pct = ((day_change_abs / prev_close) * 100.0) if prev_close else 0.0
        rows[symbol] = {
            "current": current,
            "day_change_abs": round(day_change_abs, 4),
            "day_change_pct": round(day_change_pct, 2),
            "open": open_price,
            "high": high,
            "low": low,
            "previous_close": prev_close,
            "volume": volume,
            "captured_at": captured_at,
        }

    if metadata_symbols:
        repaired: dict[str, float] = {}
        with ThreadPoolExecutor(max_workers=min(8, len(metadata_symbols))) as executor:
            futures = {
                executor.submit(_metadata_previous_close, symbol): symbol
                for symbol in metadata_symbols
            }
            for future in as_completed(futures):
                symbol = futures[future]
                previous_close = future.result()
                if previous_close is not None:
                    repaired[symbol] = previous_close
        for symbol, previous_close in repaired.items():
            row = rows.get(symbol)
            if not row:
                continue
            current = float(row["current"])
            day_change_abs = current - previous_close
            row["previous_close"] = previous_close
            row["day_change_abs"] = round(day_change_abs, 4)
            row["day_change_pct"] = round((day_change_abs / previous_close) * 100.0, 2)
        print(
            f"[yfinance previous-close metadata repair] "
            f"requested={len(metadata_symbols)} repaired={len(repaired)}"
        )
    return rows


class YFinanceClient:
    def __init__(self, max_workers: int = 6, max_retries: int = 2, retry_backoff_s: float = 0.5) -> None:
        self.max_workers = max(1, max_workers)
        self.max_retries = max(0, max_retries)
        self.retry_backoff_s = max(0.0, retry_backoff_s)

    def _fetch_one_with_retry(self, instrument: dict[str, Any], history: Any | None = None) -> dict[str, Any]:
        last_exc: Exception | None = None
        attempts = self.max_retries + 1
        for attempt in range(1, attempts + 1):
            try:
                return self._fetch_one(instrument, history)
            except Exception as exc:
                last_exc = exc
                if attempt < attempts:
                    time.sleep(self.retry_backoff_s * attempt)
        if last_exc is None:
            raise RuntimeError("unknown yfinance fetch failure")
        raise last_exc

    def _fetch_one(self, instrument: dict[str, Any], history: Any | None = None) -> dict[str, Any]:
        yahoo_symbol = yahoo_symbol_for(instrument)
        ticker = yf.Ticker(yahoo_symbol)
        if history is None:
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

    def fetch_quotes(
        self,
        instruments: list[dict[str, Any]],
        *,
        include_fundamentals: bool = True,
    ) -> dict[str, dict[str, Any]]:
        if not instruments:
            return {}
        if not include_fundamentals:
            symbol_to_instrument = {yahoo_symbol_for(instrument): instrument for instrument in instruments}
            quote_rows = _batch_download_quote_only(list(symbol_to_instrument.keys()))
            rows: dict[str, dict[str, Any]] = {}
            for yahoo_symbol, instrument in symbol_to_instrument.items():
                quote = quote_rows.get(yahoo_symbol)
                if quote is None:
                    try:
                        payload = self._fetch_one_with_retry(instrument)
                    except Exception as exc:
                        print(f"yfinance fallback fetch failed for {instrument.get('instrument_id')}: {exc}")
                        continue
                    payload.pop("fundamentals", None)
                    payload.pop("analyst_consensus", None)
                    rows[instrument["instrument_id"]] = payload
                    continue
                rows[instrument["instrument_id"]] = {
                    "symbol": str(instrument.get("ticker", yahoo_symbol)),
                    "yahoo_symbol": yahoo_symbol,
                    "name": instrument.get("name", ""),
                    "exchange": instrument.get("exchange", ""),
                    "currency": instrument.get("currency", "USD"),
                    "captured_at": quote["captured_at"],
                    "quote": quote,
                }
            return rows

        history_by_symbol = _batch_download_frames(
            [yahoo_symbol_for(instrument) for instrument in instruments],
            period="5d",
            interval="1d",
        )
        rows: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(instruments))) as executor:
            futures = {}
            for instrument in instruments:
                yahoo_symbol = yahoo_symbol_for(instrument)
                history = history_by_symbol.get(yahoo_symbol)
                futures[executor.submit(self._fetch_one_with_retry, instrument, history)] = instrument
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


def _scorecard_from_info(info: dict[str, Any]) -> dict[str, float]:
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
    _set("fifty_day_average", info.get("fiftyDayAverage"))
    _set("two_hundred_day_average", info.get("twoHundredDayAverage"))
    beta_raw = info.get("beta")
    if beta_raw not in (None, "", "null"):
        try:
            out["beta"] = round(float(beta_raw), 2)
        except (TypeError, ValueError):
            pass

    mean = info.get("recommendationMean")
    if mean not in (None, "", "null"):
        try:
            m = float(mean)
            if 1.0 <= m <= 5.0:
                out["analyst_buy_pct"] = round(max(0.0, (5.0 - m) / 4.0 * 100.0), 1)
        except (TypeError, ValueError):
            pass

    return out


def fetch_yfinance_scorecard_metrics(
    ticker_symbol: str,
    market: str,
    *,
    info: dict[str, Any] | None = None,
) -> dict[str, float]:
    """Scorecard-only fundamentals pulled from Yahoo: Forward P/E, PEG,
    analyst mean target, and an analyst buy % derived from `recommendationMean`.

    Screener.in and Tickertape don't publish forward consensus for IN stocks,
    so these fields used to render as "-" on the scorecard. Yahoo aggregates
    them for most NSE tickers. Returns a dict with only the keys that parsed
    cleanly - callers should treat absence as "not available", same as every
    other scraper.
    """
    if info is None:
        if market == "IN":
            yahoo_symbol = f"{ticker_symbol.upper()}.NS"
        else:
            yahoo_symbol = ticker_symbol.upper()
        try:
            info = yf.Ticker(yahoo_symbol).info or {}
        except Exception as exc:  # yfinance raises on transient network hiccups
            print(f"  [yfinance fail] {ticker_symbol}: {exc}")
            return {}

    return _scorecard_from_info(info)


def fetch_yfinance_scorecard_metrics_batch(
    instruments: list[dict[str, Any]],
    *,
    max_workers: int = 8,
) -> dict[str, dict[str, float]]:
    if not instruments:
        return {}

    def _one(instrument: dict[str, Any]) -> tuple[str, dict[str, float]]:
        instrument_id = instrument["instrument_id"]
        try:
            info = yf.Ticker(yahoo_symbol_for(instrument)).info or {}
        except Exception:
            return instrument_id, {}
        return instrument_id, _scorecard_from_info(info)

    rows: dict[str, dict[str, float]] = {}
    with ThreadPoolExecutor(max_workers=min(max_workers, len(instruments))) as executor:
        futures = {executor.submit(_one, instrument): instrument for instrument in instruments}
        for future in as_completed(futures):
            instrument = futures[future]
            try:
                instrument_id, metrics = future.result()
            except Exception as exc:
                print(f"  [yfinance fail] {instrument.get('ticker')}: {exc}")
                continue
            if metrics:
                rows[instrument_id] = metrics
    return rows


def fetch_premarket_quotes(
    instruments: list[dict[str, Any]],
    *,
    max_workers: int = 6,
) -> dict[str, dict[str, Any]]:
    """Fetch pre-market quotes for a focused set of instruments.

    Yahoo's pre/post intraday bars carry pre-market prints without one `.info`
    request per ticker.

    Returns {instrument_id: {ticker, pre_market_price, previous_close,
    pre_market_change_pct, market_state, captured_at}} for names that actually
    have a pre-market quote.
    """
    if not instruments:
        return {}

    symbol_to_instrument = {yahoo_symbol_for(instrument): instrument for instrument in instruments}
    symbols = list(symbol_to_instrument.keys())
    daily_by_symbol = _batch_download_frames(symbols, period="5d", interval="1d")
    intraday_by_symbol = _batch_download_frames(symbols, period="1d", interval="1m", prepost=True)
    rows: dict[str, dict[str, Any]] = {}
    now_iso = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).date()

    for symbol, instrument in symbol_to_instrument.items():
        daily = daily_by_symbol.get(symbol)
        intraday = intraday_by_symbol.get(symbol)
        if daily is None or intraday is None:
            continue
        prev_close = _latest_daily_close(daily)
        if prev_close <= 0:
            continue

        frame = intraday.dropna(subset=["Close"]) if "Close" in intraday else intraday
        if getattr(frame, "empty", True):
            continue
        latest = frame.iloc[-1]
        captured = getattr(latest.name, "to_pydatetime", lambda: datetime.now(timezone.utc))()
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=timezone.utc)
        captured_utc = captured.astimezone(timezone.utc)
        if captured_utc.date() != today:
            continue

        pre = _to_float(latest.get("Close"), default=0.0)
        if pre <= 0:
            continue
        pct = ((pre - prev_close) / prev_close) * 100.0
        rows[instrument["instrument_id"]] = {
            "ticker": str(instrument.get("ticker", symbol)),
            "pre_market_price": round(pre, 4),
            "previous_close": round(prev_close, 4),
            "pre_market_change_pct": round(pct, 2),
            "market_state": "PRE",
            "captured_at": now_iso,
        }
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

    symbol_to_instrument = {yahoo_symbol_for(instrument): instrument for instrument in instruments}
    history_by_symbol = _batch_download_frames(list(symbol_to_instrument.keys()), period="10d", interval="1d")
    rows: dict[str, dict[str, Any]] = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    for yahoo_symbol, instrument in symbol_to_instrument.items():
        metrics = _weekly_change_from_history(history_by_symbol.get(yahoo_symbol))
        if metrics is None:
            continue
        price, week_start, pct = metrics
        rows[instrument["instrument_id"]] = {
            "ticker": str(instrument.get("ticker", yahoo_symbol)).strip().upper(),
            "price": round(price, 4),
            "week_start_price": round(week_start, 4),
            "week_change_pct": pct,
            "captured_at": now_iso,
        }
    return rows
