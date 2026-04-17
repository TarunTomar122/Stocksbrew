"""Canonical onboarding schema and preference validation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CONFIG_DIR = Path(__file__).resolve().parent / "config"
PREFERENCES_FILE = CONFIG_DIR / "preferences_schema.json"


def load_preferences_schema() -> dict[str, Any]:
    with PREFERENCES_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_market_schema(market: str) -> dict[str, Any] | None:
    schema = load_preferences_schema()
    for market_schema in schema.get("markets", []):
        if market_schema["id"] == market:
            return market_schema
    return None


def sector_keyword_map() -> dict[str, dict[str, list[str]]]:
    schema = load_preferences_schema()
    mapping: dict[str, dict[str, list[str]]] = {}
    for market in schema.get("markets", []):
        mapping[market["id"]] = {
            sector["id"]: sector.get("keywords", [])
            for sector in market.get("sectors", [])
        }
    return mapping


def sector_label_map() -> dict[str, dict[str, str]]:
    schema = load_preferences_schema()
    mapping: dict[str, dict[str, str]] = {}
    for market in schema.get("markets", []):
        mapping[market["id"]] = {
            sector["id"]: sector["label"]
            for sector in market.get("sectors", [])
        }
    return mapping


def validate_user_preferences(payload: dict[str, Any]) -> dict[str, Any]:
    schema = load_preferences_schema()
    limits = schema.get("limits", {})

    requested_markets = payload.get("markets", [])
    if not isinstance(requested_markets, list) or not requested_markets:
        raise ValueError("Select at least one market")

    valid_markets = {market["id"] for market in schema.get("markets", [])}
    markets = [market for market in requested_markets if market in valid_markets]
    if len(markets) != len(requested_markets):
        raise ValueError("One or more selected markets are invalid")
    if len(markets) > limits.get("max_markets", 2):
        raise ValueError("Too many markets selected")

    sectors_input = payload.get("sectors", {}) or {}
    normalized_sectors: dict[str, list[str]] = {}
    for market in markets:
        market_schema = get_market_schema(market)
        valid_sector_ids = {sector["id"] for sector in (market_schema or {}).get("sectors", [])}
        requested = sectors_input.get(market, []) if isinstance(sectors_input, dict) else []
        if not isinstance(requested, list):
            raise ValueError(f"Sectors for {market} must be a list")
        deduped = []
        for sector in requested:
            if sector not in valid_sector_ids:
                raise ValueError(f"Invalid sector '{sector}' for market {market}")
            if sector not in deduped:
                deduped.append(sector)
        if len(deduped) > limits.get("max_sectors_per_market", 6):
            raise ValueError(f"Too many sectors selected for market {market}")
        normalized_sectors[market] = deduped

    stocks_input = payload.get("stocks", {}) or {}
    normalized_stocks: dict[str, list[dict[str, Any]]] = {}
    for market in markets:
        requested = stocks_input.get(market, []) if isinstance(stocks_input, dict) else []
        if not isinstance(requested, list):
            raise ValueError(f"Stocks for {market} must be a list")
        normalized: list[dict[str, Any]] = []
        for entry in requested:
            if not isinstance(entry, dict):
                raise ValueError(f"Each stock for {market} must be an object")
            ticker = str(entry.get("ticker", "")).upper().strip()
            if not ticker:
                raise ValueError(f"Every stock for {market} requires a ticker")
            aliases = entry.get("aliases", [])
            normalized.append({
                "ticker": ticker,
                "display_name": str(entry.get("display_name", "")).strip() or ticker,
                "aliases": [str(alias).strip() for alias in aliases if str(alias).strip()],
            })
        if len(normalized) > limits.get("max_stocks_per_market", 25):
            raise ValueError(f"Too many stocks selected for market {market}")
        normalized_stocks[market] = normalized

    valid_signal_types = {item["id"] for item in schema.get("signal_types", [])}
    requested_signals = payload.get("signal_types", [])
    if not isinstance(requested_signals, list):
        raise ValueError("Signal types must be a list")
    signal_types = []
    for signal_type in requested_signals:
        if signal_type not in valid_signal_types:
            raise ValueError(f"Invalid signal type '{signal_type}'")
        if signal_type not in signal_types:
            signal_types.append(signal_type)
    if len(signal_types) > limits.get("max_signal_types", 6):
        raise ValueError("Too many signal types selected")

    return {
        "markets": markets,
        "sectors": normalized_sectors,
        "stocks": normalized_stocks,
        "signal_types": signal_types,
    }
