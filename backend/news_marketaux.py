"""Marketaux news API fetcher.

Fetches stock-tagged news from Marketaux (100 req/day free tier).
Each article comes with entity-level sentiment scores and match scores
so we skip LLM enrichment — same pattern as news_av.py.

Usage:
    articles = fetch_marketaux_news_for_tickers(["AAPL", "NVDA", "TSLA"])

Batches up to batch_size tickers per API call to stay within 100 req/day.
"""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from backend.models import Article

logger = logging.getLogger(__name__)

MARKETAUX_URL = "https://api.marketaux.com/v1/news/all"
SOURCE_ID = "marketaux"
_API_KEY = "rY0pNf5KxsSDPsDqctXSxzmPJw4lEaXBCI98U6Hm"
DEFAULT_BATCH_SIZE = 50


def _article_id(url: str) -> str:
    return "mx_" + hashlib.sha1(url.encode()).hexdigest()[:16]


def _mx_label(score: float) -> str:
    """Map Marketaux sentiment_score (−1 to 1) to our label vocabulary."""
    if score >= 0.35:
        return "bullish"
    if score >= 0.1:
        return "constructive"
    if score > -0.1:
        return "mixed"
    if score > -0.35:
        return "cautious"
    return "bearish"


def fetch_marketaux_batch(
    tickers: list[str],
    *,
    api_key: str,
    published_after: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Single Marketaux API call for a batch of tickers.  Returns raw article list."""
    if not tickers:
        return []
    try:
        resp = requests.get(
            MARKETAUX_URL,
            params={
                "symbols": ",".join(t.upper() for t in tickers),
                "filter_entities": "true",
                "language": "en",
                "published_after": published_after,
                "limit": min(limit, 100),
                "api_token": api_key,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("marketaux_fetch_error tickers=%s error=%s", tickers[:5], exc)
        return []

    if "error" in data:
        logger.warning("marketaux_api_error: %s", str(data)[:200])
        return []

    articles = data.get("data") or []
    meta = data.get("meta") or {}
    logger.info(
        "marketaux_fetched tickers=%d articles=%d total_found=%s",
        len(tickers), len(articles), meta.get("found", "?"),
    )
    return articles


def _raw_to_articles(
    raw: dict[str, Any],
    target_tickers: set[str],
    market: str,
    min_match_score: float,
) -> list[Article]:
    """Convert one Marketaux article to zero or more Article objects.

    Returns one Article per relevant ticker entity (focus ticker = highest match).
    Usually this is a single article per raw entry.
    """
    url = str(raw.get("url") or "").strip()
    if not url:
        return []

    entities: list[dict[str, Any]] = raw.get("entities") or []
    relevant = [
        e for e in entities
        if str(e.get("symbol") or "").upper() in target_tickers
        and float(e.get("match_score") or 0) >= min_match_score
        and str(e.get("type") or "").lower() == "equity"
    ]
    if not relevant:
        return []

    focus = max(relevant, key=lambda e: float(e.get("match_score") or 0))
    focus_ticker = str(focus.get("symbol") or "").upper()
    focus_score = float(focus.get("sentiment_score") or 0.0)
    focus_label = _mx_label(focus_score)

    all_relevant_tickers = [str(e.get("symbol") or "").upper() for e in relevant]

    entity_mentions: list[dict[str, Any]] = [
        {
            "ticker": str(e.get("symbol") or "").upper(),
            "sentiment_score": float(e.get("sentiment_score") or 0.0),
            "sentiment_label": _mx_label(float(e.get("sentiment_score") or 0.0)),
            "relevance": min(1.0, float(e.get("match_score") or 0) / 100.0),
            "mention_role": "primary" if float(e.get("match_score") or 0) >= 50 else "secondary",
            "type": "stock",
        }
        for e in entities
        if str(e.get("type") or "").lower() == "equity"
    ]

    title = str(raw.get("title") or "").strip()
    snippet = str(raw.get("snippet") or raw.get("description") or "").strip()
    source_name = str(raw.get("source") or SOURCE_ID).strip()
    published_at = str(raw.get("published_at") or datetime.now(timezone.utc).isoformat())

    return [Article(
        id=_article_id(url),
        source_id=SOURCE_ID,
        source_name=source_name,
        source_kind="publisher",
        market=market,
        title=title,
        url=url,
        summary=snippet,
        article_overview=snippet,
        article_key_points=[],
        published_at=published_at,
        topic_key="financial_markets",
        topic_label="Financial Markets",
        topic_kind="market_news",
        tags=[],
        sector_tags=[],
        stock_candidates=all_relevant_tickers,
        stock_tickers=all_relevant_tickers,
        signal_types=[],
        bucket_keys=[],
        bucket_labels=[],
        bucket_kinds=[],
        entity_mentions=entity_mentions,
        sentiment_score=focus_score,
        sentiment_label=focus_label,
        enrichment_source="marketaux",
        source_lane="core" if float(focus.get("match_score") or 0) >= 50 else "broad",
        focus_ticker=focus_ticker,
        body_text="",
    )]


def fetch_marketaux_news_for_tickers(
    all_tickers: list[str],
    *,
    api_key: str | None = None,
    lookback_hours: int = 72,
    market: str = "US",
    min_match_score: float = 10.0,
    sleep_between_calls: float = 0.5,
) -> list[Article]:
    """Fetch Marketaux news per ticker (one call per ticker).

    Free tier returns 3 articles per API call regardless of limit param.
    Per-ticker calls ensure each stock gets its own 3 articles rather than
    sharing a 3-article pool across the entire batch.
    Uses ~1 req/ticker of the 100 req/day quota.
    """
    key = api_key or _API_KEY
    published_after = (
        datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    ).strftime("%Y-%m-%dT%H:%M")

    deduped = list(dict.fromkeys(t.upper() for t in all_tickers if t))
    logger.info("marketaux_plan tickers=%d calls=%d", len(deduped), len(deduped))

    seen_urls: set[str] = set()
    articles: list[Article] = []

    for idx, ticker in enumerate(deduped):
        if idx > 0 and sleep_between_calls > 0:
            time.sleep(sleep_between_calls)

        raw_list = fetch_marketaux_batch(
            [ticker], api_key=key, published_after=published_after
        )
        target_set = {ticker}
        for raw in raw_list:
            url = str(raw.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            converted = _raw_to_articles(raw, target_set, market, min_match_score)
            for article in converted:
                if article.url not in seen_urls:
                    seen_urls.add(article.url)
                    articles.append(article)

    logger.info("marketaux_total articles=%d", len(articles))
    return articles
