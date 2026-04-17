from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any

import requests

from backend.env import load_backend_env

load_backend_env()


DEFAULT_SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://localhost:8888").rstrip("/")


@dataclass
class SearchHit:
    title: str
    url: str
    content: str
    engine: str
    published_date: str | None = None


def _to_hit(item: dict[str, Any]) -> SearchHit:
    published = item.get("publishedDate") or item.get("published_date")
    engines = item.get("engines") or []
    engine = ""
    if isinstance(engines, list) and engines:
        engine = str(engines[0])
    return SearchHit(
        title=str(item.get("title", "")).strip(),
        url=str(item.get("url", "")).strip(),
        content=str(item.get("content", "")).strip(),
        engine=engine,
        published_date=str(published).strip() if published else None,
    )


class SearXNGClient:
    def __init__(self, base_url: str | None = None, timeout: int = 20) -> None:
        self.base_url = (base_url or DEFAULT_SEARXNG_BASE_URL).rstrip("/")
        self.timeout = timeout

    def search(
        self,
        query: str,
        limit: int = 5,
        *,
        categories: str | None = None,
        time_range: str | None = None,
    ) -> list[SearchHit]:
        response = requests.get(
            f"{self.base_url}/search",
            params={
                "q": query,
                "format": "json",
                "language": "en",
                "safesearch": 0,
                **({"categories": categories} if categories else {}),
                **({"time_range": time_range} if time_range else {}),
            },
            headers={"user-agent": "tikrr-pipeline/0.1"},
            timeout=self.timeout,
        )
        if response.status_code == 403:
            raise RuntimeError(
                "SearXNG returned 403. The default container usually has JSON search disabled. "
                "Enable `search.formats: [html, json]` in /etc/searxng/settings.yml and restart the container."
            )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", [])
        if not isinstance(results, list):
            return []
        hits: list[SearchHit] = []
        seen_urls: set[str] = set()
        for item in results:
            if not isinstance(item, dict):
                continue
            hit = _to_hit(item)
            if not hit.url or hit.url in seen_urls:
                continue
            seen_urls.add(hit.url)
            hits.append(hit)
            if len(hits) >= limit:
                break
        return hits


def build_stock_queries(symbol: str, market: str, stock_name: str | None = None) -> list[tuple[str, str, dict[str, str]]]:
    name = stock_name or symbol
    market_name = "India" if market.upper() == "IN" else "US"
    clean_name = name.replace(",", "")
    return [
        ("price", f"{symbol} {clean_name} stock price today {market_name}", {}),
        ("price", f"{symbol} {clean_name} previous close 52 week range {market_name}", {}),
        (
            "news",
            f"{symbol} {clean_name} stock news {market_name} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "day"},
        ),
        (
            "news",
            f"{symbol} {clean_name} latest company news {market_name} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "week"},
        ),
        (
            "analyst",
            f"{symbol} {clean_name} analyst rating target price {market_name} -quote -history -overview",
            {"categories": "news", "time_range": "month"},
        ),
        (
            "analyst",
            f"{symbol} {clean_name} consensus price target analysts {market_name} -quote -history -overview",
            {},
        ),
    ]


def build_market_queries(market: str) -> list[tuple[str, str, dict[str, str]]]:
    market_name = "Indian" if market.upper() == "IN" else "US"
    market_terms = "Nifty Sensex RBI earnings rupee" if market.upper() == "IN" else "S&P 500 Nasdaq Dow Fed yields inflation"
    return [
        (
            "market",
            f"{market_name} stock market news today {market_terms} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "day"},
        ),
        (
            "market",
            f"{market_name} markets today sector movers macro headlines {market_terms} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "day"},
        ),
    ]


def build_sector_queries(market: str, sector_name: str, symbols: list[str] | None = None) -> list[tuple[str, str, dict[str, str]]]:
    market_name = "India" if market.upper() == "IN" else "US"
    stock_hint = " ".join((symbols or [])[:4])
    return [
        (
            "sector",
            f"{market_name} {sector_name} sector news today {stock_hint} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "day"},
        ),
        (
            "sector",
            f"{market_name} {sector_name} stocks today analyst earnings regulation {stock_hint} -quote -history -forecast -overview",
            {"categories": "news", "time_range": "day"},
        ),
    ]
