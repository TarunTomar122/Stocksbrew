"""Yahoo Finance market-data helpers for Trace Money."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
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


def yahoo_symbol_for(instrument: dict[str, Any]) -> str:
    explicit = str(instrument.get("quote_symbol_yahoo", "")).strip()
    if explicit:
        return explicit
    symbol = str(instrument.get("quote_symbol", instrument.get("ticker", ""))).strip().upper()
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
    current = _to_float(latest.get("Close"))
    open_price = _to_float(latest.get("Open"))
    high = _to_float(latest.get("High"))
    low = _to_float(latest.get("Low"))
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
    def __init__(self, max_workers: int = 6) -> None:
        self.max_workers = max(1, max_workers)

    def _fetch_one(self, instrument: dict[str, Any]) -> dict[str, Any]:
        yahoo_symbol = yahoo_symbol_for(instrument)
        ticker = yf.Ticker(yahoo_symbol)
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        current, previous_close, open_price, high, low, volume, captured_at = _history_metrics(history)
        fast_info = getattr(ticker, "fast_info", None)
        info = ticker.info or {}

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

        day_change_abs = current - previous_close
        day_change_pct = ((day_change_abs / previous_close) * 100.0) if previous_close else 0.0

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
            futures = {executor.submit(self._fetch_one, instrument): instrument for instrument in instruments}
            for future in as_completed(futures):
                instrument = futures[future]
                try:
                    rows[instrument["instrument_id"]] = future.result()
                except Exception as exc:
                    print(f"yfinance fetch failed for {instrument.get('instrument_id')}: {exc}")
        return rows
