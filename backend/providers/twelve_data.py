"""Twelve Data quote client."""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Callable

import requests

from backend.env import load_backend_env

load_backend_env()


QUOTE_URL = "https://api.twelvedata.com/quote"


def _to_float(value: Any, *, default: float = 0.0) -> float:
    if value in (None, "", "null"):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_timestamp(value: Any, fallback: str) -> str:
    if not value:
        return fallback
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
    text = str(value).strip()
    if not text:
        return fallback
    normalized = text.replace(" ", "T")
    if normalized.endswith("Z"):
        return normalized
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def normalize_batch_quote_payload(payload: Any, symbols: list[str]) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, dict):
        raise ValueError("Unexpected Twelve Data payload type")

    if payload.get("status") == "error":
        raise ValueError(payload.get("message") or "Twelve Data quote request failed")

    if "symbol" in payload:
        symbol = str(payload.get("symbol") or (symbols[0] if symbols else "")).upper()
        return {symbol: payload}

    rows: dict[str, dict[str, Any]] = {}
    for symbol, value in payload.items():
        if not isinstance(value, dict):
            continue
        rows[str(symbol).upper()] = value

    if not rows:
        raise ValueError("Unexpected Twelve Data batch quote payload")

    return rows


class TwelveDataClient:
    def __init__(
        self,
        api_key: str | None = None,
        requester: Callable[..., Any] | None = None,
        quote_url: str = QUOTE_URL,
        batch_size: int = 25,
        max_workers: int = 6,
    ) -> None:
        self.api_key = (api_key or os.getenv("TWELVE_DATA_API_KEY", "")).strip()
        if not self.api_key:
            raise ValueError("Set TWELVE_DATA_API_KEY")
        self.requester = requester or requests.get
        self.quote_url = quote_url
        self.batch_size = max(1, batch_size)
        self.max_workers = max(1, max_workers)

    def _fetch_quote_batch(
        self,
        symbols: list[str],
        *,
        exchange: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        params = {
            "symbol": ",".join(symbols),
            "apikey": self.api_key,
        }
        if exchange:
            params["exchange"] = exchange
        response = self.requester(
            self.quote_url,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        raw_rows = normalize_batch_quote_payload(payload, symbols)
        fetched_at = datetime.now(timezone.utc).isoformat()

        quotes: dict[str, dict[str, Any]] = {}
        for symbol in symbols:
            upper_symbol = symbol.upper()
            row = raw_rows.get(upper_symbol)
            if row is None:
                raise ValueError(f"Missing Twelve Data quote for {upper_symbol}")
            if row.get("status") == "error" or row.get("code"):
                raise ValueError(row.get("message") or f"Twelve Data quote error for {upper_symbol}")

            current = _to_float(row.get("close"))
            if current == 0.0:
                current = _to_float(row.get("price"))
            quotes[upper_symbol] = {
                "symbol": upper_symbol,
                "name": row.get("name", ""),
                "exchange": row.get("exchange", ""),
                "currency": row.get("currency", "USD") or "USD",
                "captured_at": _normalize_timestamp(
                    row.get("last_update_at") or row.get("datetime") or row.get("timestamp"),
                    fetched_at,
                ),
                "quote": {
                    "current": current,
                    "day_change_abs": _to_float(row.get("change")),
                    "day_change_pct": _to_float(row.get("percent_change")),
                    "open": _to_float(row.get("open")),
                    "high": _to_float(row.get("high")),
                    "low": _to_float(row.get("low")),
                    "previous_close": _to_float(row.get("previous_close")),
                    "volume": _to_float(row.get("volume")),
                },
            }
        return quotes

    def fetch_quotes(self, symbols: list[str], *, exchange: str | None = None) -> dict[str, dict[str, Any]]:
        if not symbols:
            return {}
        normalized = [symbol.upper().strip() for symbol in symbols if symbol.strip()]
        if len(normalized) <= self.batch_size:
            return self._fetch_quote_batch(normalized, exchange=exchange)

        batches = [normalized[index:index + self.batch_size] for index in range(0, len(normalized), self.batch_size)]
        quotes: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=min(self.max_workers, len(batches))) as executor:
            future_map = {
                executor.submit(self._fetch_quote_batch, batch, exchange=exchange): batch
                for batch in batches
            }
            for future in as_completed(future_map):
                quotes.update(future.result())
        return quotes
