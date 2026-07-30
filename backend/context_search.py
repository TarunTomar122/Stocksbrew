"""Context search acquisition for stock-news coverage gaps.

This module only discovers URLs and wraps successfully scraped pages as normal
Article objects. Enrichment, entity extraction, storage, and stock-intelligence
synthesis stay in the existing pipeline.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlparse

import requests

from backend.env import load_backend_env
from backend.models import Article

load_backend_env()

SOURCE_ID = "context_fallback"
DEFAULT_LOOKBACK_HOURS = 24
DEFAULT_LIMIT = 5
DEFAULT_API_URL = "https://api.context.dev/v1/web/search"


@dataclass(slots=True)
class ContextSearchResult:
    title: str
    url: str
    snippet: str = ""
    source_name: str = ""
    published_at: str = ""


def context_search_enabled() -> bool:
    return bool(_api_key() and _api_url())


def _api_key() -> str:
    return (
        os.getenv("CONTEXT_DEV_API_KEY", "").strip()
        or os.getenv("CONTEXT_API_KEY", "").strip()
    )


def _api_url() -> str:
    return (
        os.getenv("CONTEXT_API_URL", "").strip()
        or os.getenv("CONTEXT_SEARCH_URL", "").strip()
        or DEFAULT_API_URL
    )


def _freshness_for_lookback(lookback_hours: int) -> str:
    if lookback_hours <= 24:
        return "last_24_hours"
    if lookback_hours <= 24 * 7:
        return "last_week"
    if lookback_hours <= 24 * 31:
        return "last_month"
    return "last_year"


def _publisher_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _article_id(url: str) -> str:
    return "ctx_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _coerce_results(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []

    candidates: list[Any] = [
        payload.get("results"),
        payload.get("items"),
        payload.get("data"),
        payload.get("search_results"),
    ]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.extend([data.get("results"), data.get("items")])

    for candidate in candidates:
        if isinstance(candidate, list):
            return [row for row in candidate if isinstance(row, dict)]
    return []


def _result_from_row(row: dict[str, Any]) -> ContextSearchResult | None:
    url = str(
        row.get("url")
        or row.get("link")
        or row.get("href")
        or row.get("source_url")
        or ""
    ).strip()
    if not url.startswith(("http://", "https://")):
        return None
    title = str(row.get("title") or row.get("name") or "").strip()
    snippet = str(
        row.get("snippet")
        or row.get("description")
        or row.get("content")
        or row.get("text")
        or ""
    ).strip()
    source_name = str(row.get("source") or row.get("source_name") or "").strip()
    published_at = str(row.get("published_at") or row.get("date") or "").strip()
    return ContextSearchResult(
        title=title,
        url=url,
        snippet=snippet,
        source_name=source_name,
        published_at=published_at,
    )


def search_context(
    query: str,
    *,
    limit: int = DEFAULT_LIMIT,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    post_func: Callable[..., Any] = requests.post,
) -> list[ContextSearchResult]:
    key = _api_key()
    url = _api_url()
    if not key or not url:
        return []

    response = post_func(
        url,
        headers={
            "Authorization": f"Bearer {key}",
            "X-API-Key": key,
            "Content-Type": "application/json",
        },
        json={
            "query": query,
            "numResults": max(10, min(100, limit)),
            "freshness": _freshness_for_lookback(lookback_hours),
            "country": "us",
            "queryFanout": True,
            "excludeDomains": ["wikipedia.org", "reddit.com"],
            "markdownOptions": {"enabled": False},
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()

    results: list[ContextSearchResult] = []
    seen: set[str] = set()
    for row in _coerce_results(payload):
        result = _result_from_row(row)
        if not result or result.url in seen:
            continue
        seen.add(result.url)
        results.append(result)
        if len(results) >= limit:
            break
    return results


def search_context_articles_for_ticker(
    instrument: dict[str, Any],
    *,
    market: str,
    limit: int = DEFAULT_LIMIT,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    post_func: Callable[..., Any] = requests.post,
    extract_func: Callable[..., Any] | None = None,
) -> tuple[list[Article], dict[str, Any]]:
    ticker = str(instrument.get("ticker") or "").strip().upper()
    name = str(instrument.get("name") or ticker).strip()
    if not ticker:
        return [], {"source_id": SOURCE_ID, "ok": False, "article_count": 0, "error": "missing ticker"}

    query = (
        f"{ticker} {name} stock news latest earnings guidance analyst "
        f"contract partnership revenue last {lookback_hours} hours"
    )
    try:
        results = search_context(
            query,
            limit=limit,
            lookback_hours=lookback_hours,
            post_func=post_func,
        )
    except Exception as exc:
        return [], {"source_id": SOURCE_ID, "ok": False, "article_count": 0, "error": str(exc)}

    if extract_func is None:
        from backend.curated_fetcher import extract_urls
        extracted_rows = extract_urls([result.url for result in results])
    else:
        extracted_rows = [extract_func(result.url) for result in results]

    articles: list[Article] = []
    for result, extracted in zip(results, extracted_rows, strict=False):
        if getattr(extracted, "status", "") != "ok":
            continue

        title = str(getattr(extracted, "title", "") or result.title).strip()
        body_text = str(getattr(extracted, "body_text", "") or "").strip()
        if not title or not body_text:
            continue

        summary = str(getattr(extracted, "summary", "") or result.snippet).strip()
        # A page without a publication time cannot be tied to today's price
        # move. Do not make it look current by stamping the crawl time on it.
        published_at = str(getattr(extracted, "published_at", "") or result.published_at).strip()
        if not published_at:
            continue
        source_name = str(getattr(extracted, "publisher", "") or result.source_name or _publisher_from_url(result.url)).strip()

        articles.append(
            Article(
                id=_article_id(result.url),
                source_id=SOURCE_ID,
                source_name=source_name or SOURCE_ID,
                source_kind="publisher",
                market=market,
                title=title,
                url=result.url,
                summary=summary,
                article_overview="",
                article_key_points=[],
                published_at=published_at,
                topic_key="financial_markets",
                topic_label="Financial Markets",
                topic_kind="market_news",
                tags=["context_fallback"],
                sector_tags=[],
                stock_candidates=[ticker],
                stock_tickers=[ticker],
                signal_types=["market_news"],
                bucket_keys=[],
                bucket_labels=[],
                bucket_kinds=[],
                entity_mentions=[],
                sentiment_score=0.0,
                sentiment_label="unscored",
                enrichment_source="raw",
                source_lane="core",
                focus_ticker=ticker,
                body_text=body_text,
                source_coverage_modes=["stock"],
                coverage_mode="stock",
            )
        )

    return articles, {
        "source_id": SOURCE_ID,
        "source_name": "Context Search",
        "ok": True,
        "article_count": len(articles),
        "attempt_count": len(results),
        "error": "",
    }


def search_context_evidence_for_ticker(
    instrument: dict[str, Any],
    *,
    market: str,
    limit: int = DEFAULT_LIMIT,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    post_func: Callable[..., Any] = requests.post,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return dated search evidence without crawling every result page.

    The anomaly lane needs a fast second opinion for at most 30 movers. Search
    titles/snippets are enough for the explainer model to decide whether a
    result plausibly matches the move; crawling five pages per ticker turned
    one upstream timeout into a 10-15 minute critical-path delay. Full-page
    extraction remains available to the broader news pipeline.
    """
    ticker = str(instrument.get("ticker") or "").strip().upper()
    name = str(instrument.get("name") or ticker).strip()
    if not ticker:
        return [], {
            "source_id": SOURCE_ID,
            "ok": False,
            "article_count": 0,
            "error": "missing ticker",
        }
    query = (
        f"{ticker} {name} stock why moving today latest news earnings guidance "
        f"analyst contract partnership last {lookback_hours} hours"
    )
    try:
        results = search_context(
            query,
            limit=limit,
            lookback_hours=lookback_hours,
            post_func=post_func,
        )
    except Exception as exc:
        return [], {
            "source_id": SOURCE_ID,
            "ok": False,
            "article_count": 0,
            "error": str(exc),
        }

    evidence = [
        {
            "date": result.published_at,
            "source": result.source_name or _publisher_from_url(result.url),
            "title": result.title,
            "summary": result.snippet,
            "url": result.url,
        }
        for result in results
        if result.title and result.published_at
    ]
    return evidence, {
        "source_id": SOURCE_ID,
        "source_name": "Context Search",
        "ok": True,
        "article_count": len(evidence),
        "attempt_count": len(results),
        "error": "",
    }
