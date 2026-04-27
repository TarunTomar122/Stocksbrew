"""Tiered market ingest strategy and dynamic ticker feed generation."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from backend.models import SourceDefinition


CONFIG_DIR = Path(__file__).resolve().parent / "config"
MARKET_STRATEGY_FILE = CONFIG_DIR / "market_strategy.json"

PROVIDER_TEMPLATES = {
    "nasdaq": {
        "kind": "publisher",
        "name": "Nasdaq",
        "homepage_url": "https://www.nasdaq.com/market-activity/stocks/{ticker_lc}",
        "feed_url": "https://www.nasdaq.com/feed/rssoutbound?symbol={ticker}",
        "verification_url": "https://www.nasdaq.com/nasdaq-RSS-Feeds",
        "signal_types": ["market_news", "earnings", "ratings"],
    },
    "seekingalpha": {
        "kind": "publisher",
        "name": "Seeking Alpha",
        "homepage_url": "https://seekingalpha.com/symbol/{ticker}",
        "feed_url": "https://seekingalpha.com/api/sa/combined/{ticker}.xml",
        "verification_url": "https://about.seekingalpha.com/feeds",
        "signal_types": ["market_news", "earnings", "ratings"],
    },
    "google_news": {
        "kind": "publisher",
        "name": "Google News",
        "homepage_url": "https://news.google.com/",
        "verification_url": "https://news.google.com/rss",
        "signal_types": ["market_news", "earnings", "ratings", "macro"],
    },
    "google_news_price": {
        "kind": "publisher",
        "name": "Google News (Price Action)",
        "homepage_url": "https://news.google.com/",
        "verification_url": "https://news.google.com/rss",
        "signal_types": ["market_news", "price_move", "ratings"],
    },
}

LANE_RANK_BOOST = {
    "broad": 0,
    "core": 100,
    "promoted": 140,
}


@lru_cache(maxsize=1)
def load_market_strategy() -> dict[str, Any]:
    with MARKET_STRATEGY_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def market_strategy_for(market: str) -> dict[str, Any]:
    return load_market_strategy().get("markets", {}).get(market, {})


def default_llm_model() -> str:
    return os.getenv("TRACE_MONEY_LLM_MODEL", "").strip() or load_market_strategy().get("default_llm_model", "gpt-5-nano")


def default_llm_concurrency() -> int:
    configured = os.getenv("TRACE_MONEY_LLM_CONCURRENCY", "").strip()
    if configured.isdigit():
        return max(1, int(configured))
    return max(1, int(load_market_strategy().get("default_llm_concurrency", 8)))


def lane_budgets_for(market: str, total_cap: int | None = None) -> dict[str, int]:
    raw = market_strategy_for(market).get("lane_budgets", {})
    budgets = {
        "broad": int(raw.get("broad", 0)),
        "core": int(raw.get("core", 0)),
        "promoted": int(raw.get("promoted", 0)),
    }
    default_total = sum(budgets.values())
    if total_cap is None or total_cap <= 0 or default_total <= 0 or total_cap >= default_total:
        return budgets

    scaled = {}
    remainders: list[tuple[float, str]] = []
    assigned = 0
    for lane, value in budgets.items():
        exact = (value / default_total) * total_cap
        whole = int(exact)
        scaled[lane] = whole
        assigned += whole
        remainders.append((exact - whole, lane))
    for _, lane in sorted(remainders, reverse=True):
        if assigned >= total_cap:
            break
        scaled[lane] += 1
        assigned += 1
    return scaled


def core_tickers_for(market: str) -> list[dict[str, Any]]:
    return list(market_strategy_for(market).get("core_tickers", []))


def normalize_ticker_entry(entry: dict[str, Any], lane: str) -> dict[str, Any]:
    ticker = str(entry.get("ticker", "")).upper().strip()
    if not ticker:
        raise ValueError("Ticker entries require ticker")
    display_name = str(entry.get("display_name", "")).strip() or ticker
    aliases = [str(alias).strip() for alias in entry.get("aliases", []) if str(alias).strip()]
    providers = [str(provider).strip() for provider in entry.get("providers", ["nasdaq"]) if str(provider).strip() in PROVIDER_TEMPLATES]
    if not providers:
        providers = ["nasdaq"]
    return {
        "ticker": ticker,
        "display_name": display_name,
        "aliases": aliases,
        "sector_tags": [str(tag).strip() for tag in entry.get("sector_tags", []) if str(tag).strip()],
        "providers": providers,
        "lane": lane,
        "max_items_per_source": int(entry.get("max_items_per_source", 2 if lane != "broad" else 1)),
        "max_age_hours": int(entry.get("max_age_hours", 48)),
    }


def _provider_urls(
    provider: str,
    market: str,
    ticker: str,
    display_name: str,
    aliases: list[str] | None = None,
) -> tuple[str, str]:
    template = PROVIDER_TEMPLATES[provider]
    if provider == "google_news":
        query_terms = [display_name, ticker]
        for alias in aliases or []:
            alias = alias.strip()
            if alias and alias not in query_terms:
                query_terms.append(alias)
        query = " OR ".join(
            f'"{term}"' if " " in term else term
            for term in query_terms[:4]
        )
        locale = ("en-US", "US", "US:en")
        finance_terms = '(stock OR shares OR earnings OR analyst OR guidance OR "price target")'
        if market == "IN":
            locale = ("en-IN", "IN", "IN:en")
            finance_terms = '(stock OR shares OR earnings OR result OR target OR brokerage OR analyst)'
            query = (
                f"({query}) {finance_terms} "
                '(NSE OR BSE OR India) '
                "when:3d -podcast -video -celebrity -crypto"
            )
        else:
            query = (
                f"({query}) {finance_terms} "
                "when:3d -podcast -video -celebrity -crypto"
            )
        feed_url = (
            "https://news.google.com/rss/search?q="
            f"{quote_plus(query)}&hl={locale[0]}&gl={locale[1]}&ceid={locale[2]}"
        )
        return str(template["homepage_url"]), feed_url
    if provider == "google_news_price":
        # Tight identifier match: the ticker must appear as a cashtag, in
        # parens, or as an exchange-prefix, or the company name must be quoted.
        # Combined with price-action phrasing, this complements the earnings/
        # analyst-angle google_news feed with daily share-price narratives.
        ident_parts = [
            f'"{display_name}"',
            f'"${ticker}"',
            f'"({ticker})"',
            f'"NASDAQ:{ticker}"',
            f'"NYSE:{ticker}"',
        ]
        ident = " OR ".join(ident_parts)
        price_terms = (
            '("share price" OR "stock price" OR "shares jumped" OR "shares fell" '
            'OR rallied OR tumbled OR surged OR slumped OR "52-week high" '
            'OR "52-week low" OR "price target")'
        )
        locale = ("en-US", "US", "US:en")
        if market == "IN":
            locale = ("en-IN", "IN", "IN:en")
            query = f"({ident}) {price_terms} (NSE OR BSE OR India) when:2d -podcast -video"
        else:
            query = f"({ident}) {price_terms} when:2d -podcast -video"
        feed_url = (
            "https://news.google.com/rss/search?q="
            f"{quote_plus(query)}&hl={locale[0]}&gl={locale[1]}&ceid={locale[2]}"
        )
        return str(template["homepage_url"]), feed_url
    return (
        str(template["homepage_url"]).format(ticker=ticker, ticker_lc=ticker.lower()),
        str(template["feed_url"]).format(ticker=ticker, ticker_lc=ticker.lower()),
    )


def build_ticker_sources(market: str, entries: list[dict[str, Any]], lane: str) -> list[SourceDefinition]:
    sources: list[SourceDefinition] = []
    for raw_entry in entries:
        entry = normalize_ticker_entry(raw_entry, lane)
        for provider in entry["providers"]:
            template = PROVIDER_TEMPLATES[provider]
            ticker = entry["ticker"]
            display_name = entry["display_name"]
            homepage_url, feed_url = _provider_urls(provider, market, ticker, display_name, entry["aliases"])
            sources.append(SourceDefinition(
                id=f"{lane}-{provider}-{ticker.lower()}",
                name=f"{display_name} via {template['name']}",
                kind=str(template["kind"]),
                market_codes=[market],
                homepage_url=homepage_url,
                feed_url=feed_url,
                verification_url=str(template["verification_url"]),
                verified_at=load_market_strategy().get("version", ""),
                usage_status="enabled",
                enabled_by_default=True,
                licensing_notes=f"{lane.title()} ticker feed for {display_name}.",
                coverage_modes=["stock"],
                sector_tags=list(entry["sector_tags"]),
                signal_types=list(template["signal_types"]),
                source_tier=f"{lane}_ticker",
                max_items=entry["max_items_per_source"],
                max_age_hours=entry["max_age_hours"],
                lane=lane,
                focus_ticker=ticker,
                rank_boost=LANE_RANK_BOOST.get(lane, 0),
            ))
    return sources
