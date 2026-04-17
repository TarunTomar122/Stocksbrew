"""Canonical helpers for Trace Money entity normalization."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.preferences import sector_label_map


CONFIG_DIR = Path(__file__).resolve().parent / "config"
STOCK_UNIVERSE_FILE = CONFIG_DIR / "stock_universe.json"

MARKET_BUCKETS = {
    "general-market-updates": "General market updates",
    "indices-and-breadth": "Indices and breadth",
    "rates-and-currency": "Rates and currency",
    "oil-and-commodities": "Oil and commodities",
    "regulatory-and-exchange-updates": "Regulatory and exchange updates",
    "corporate-actions": "Corporate actions",
    "ipo-watch": "IPO Watch",
}


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower().strip().replace("&", " and ")))


def _normalize_matchable_text(value: str) -> str:
    normalized = value.lower().replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return f" {normalized} " if normalized else " "


def normalize_matchable_value(value: str) -> str:
    return _normalize_matchable_text(value).strip()


@lru_cache(maxsize=1)
def load_stock_universe() -> dict[str, list[dict[str, Any]]]:
    with STOCK_UNIVERSE_FILE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload.get("markets", {})


@lru_cache(maxsize=None)
def stock_lookup(market: str) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for stock in load_stock_universe().get(market, []):
        keys = [stock.get("ticker", ""), stock.get("display_name", ""), *stock.get("aliases", [])]
        for key in keys:
            normalized = normalize_matchable_value(str(key))
            if normalized:
                lookup[normalized] = stock
    return lookup


INDEX_OR_COMMODITY_STOCK_TERMS = (
    "s and p 500",
    "dow",
    "dow jones",
    "dow jones industrial average",
    "nasdaq",
    "sensex",
    "nifty",
    "gift nifty",
    "bank nifty",
    "gold",
    "silver",
    "crude",
    "brent",
    "wti",
    "rupee",
    "dollar",
)


def looks_like_non_stock_entity(value: str) -> bool:
    normalized = normalize_matchable_value(value)
    return any(term in normalized for term in INDEX_OR_COMMODITY_STOCK_TERMS)


def resolve_stock_reference(market: str, canonical_name: str, ticker: str) -> dict[str, Any] | None:
    lookup = stock_lookup(market)
    normalized_ticker = normalize_matchable_value(ticker)
    if normalized_ticker and normalized_ticker in lookup:
        return lookup[normalized_ticker]

    normalized_name = normalize_matchable_value(canonical_name)
    if normalized_name and normalized_name in lookup:
        return lookup[normalized_name]

    return None


def market_bucket_map() -> dict[str, str]:
    return dict(MARKET_BUCKETS)


def resolve_market_bucket(market_id: str) -> dict[str, str] | None:
    label = MARKET_BUCKETS.get(market_id)
    if not label:
        return None
    return {
        "key": f"market:{market_id}",
        "label": label,
        "kind": "market",
    }


def resolve_sector_label(market: str, sector_id: str, fallback_label: str = "") -> str:
    labels = sector_label_map().get(market, {})
    return labels.get(sector_id, fallback_label or sector_id.replace("-", " ").title())
