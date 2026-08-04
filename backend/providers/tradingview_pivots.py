"""Batched monthly classic pivot levels from TradingView's US scanner.

The scanner returns the same named pivot table shown on TradingView's public
technical-analysis pages. We request all likely US exchange prefixes in one
call because the local instrument catalog's exchange label is not always the
listing exchange. Missing symbols simply stay without levels.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import requests


SCANNER_URL = "https://scanner.tradingview.com/america/scan"
EXCHANGES = ("NASDAQ", "NYSE", "AMEX", "CBOE")
PIVOT_COLUMNS = (
    "close",
    "Pivot.M.Classic.Middle",
    "Pivot.M.Classic.S1",
    "Pivot.M.Classic.S2",
    "Pivot.M.Classic.S3",
    "Pivot.M.Classic.R1",
    "Pivot.M.Classic.R2",
    "Pivot.M.Classic.R3",
)
PIVOT_LABELS = ("Close", "Pivot", "S1", "S2", "S3", "R1", "R2", "R3")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Stocksbrew/1.0; +https://www.stocksbrew.online)",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
}


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _nearest_levels(values: list[Any], current_price: float) -> dict[str, Any] | None:
    named = [
        (label, number)
        for label, raw in zip(PIVOT_LABELS[1:], values[1:])
        if (number := _finite(raw)) is not None
    ]
    if not named or current_price <= 0:
        return None

    below = sorted(((label, value) for label, value in named if value < current_price), key=lambda row: row[1], reverse=True)
    above = sorted(((label, value) for label, value in named if value > current_price), key=lambda row: row[1])
    if not below and not above:
        return None

    support = below[0] if below else None
    resistance = above[0] if above else None
    return {
        "support": round(support[1], 4) if support else None,
        "support_label": support[0] if support else None,
        "resistance": round(resistance[1], 4) if resistance else None,
        "resistance_label": resistance[0] if resistance else None,
        "method": "classic_monthly_pivots",
        "source": "TradingView monthly pivots",
    }


def normalize_scanner_payload(
    payload: Any,
    current_prices: dict[str, float],
    *,
    as_of: str,
) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("Unexpected TradingView scanner payload")

    out: dict[str, dict[str, Any]] = {}
    for row in payload["data"]:
        if not isinstance(row, dict) or not isinstance(row.get("d"), list):
            continue
        symbol = str(row.get("s") or "")
        ticker = symbol.split(":", 1)[-1].upper()
        current = _finite(current_prices.get(ticker)) or _finite(row["d"][0] if row["d"] else None)
        if not ticker or current is None:
            continue
        levels = _nearest_levels(row["d"], current)
        if levels is None:
            continue
        levels.update({"as_of": as_of, "provider_symbol": symbol})
        out[ticker] = levels
    return out


def fetch_tradingview_pivots_batch(
    tickers: list[str],
    current_prices: dict[str, float],
    *,
    requester: Callable[..., Any] | None = None,
    timeout: float = 30.0,
    as_of: str | None = None,
) -> dict[str, dict[str, Any]]:
    normalized = sorted({ticker.strip().upper() for ticker in tickers if ticker and ticker.strip()})
    if not normalized:
        return {}

    symbols = [f"{exchange}:{ticker}" for ticker in normalized for exchange in EXCHANGES]
    response = (requester or requests.post)(
        SCANNER_URL,
        json={
            "symbols": {"tickers": symbols, "query": {"types": []}},
            "columns": list(PIVOT_COLUMNS),
        },
        headers=HEADERS,
        timeout=timeout,
    )
    response.raise_for_status()
    return normalize_scanner_payload(
        response.json(),
        current_prices,
        as_of=as_of or datetime.now(timezone.utc).date().isoformat(),
    )
