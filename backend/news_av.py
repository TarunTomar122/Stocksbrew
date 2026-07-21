"""Alpha Vantage NEWS_SENTIMENT fetcher.

Converts AV articles to our Article dataclass so they slot into the existing
pipeline alongside RSS-sourced articles.  Does NOT run LLM enrichment — AV
provides sentiment scores pre-computed, which is the whole point.

Usage (single market-wide request, filtered locally to the requested tickers):
    articles = fetch_av_news_for_tickers(["AAPL", "NVDA", "MSFT"])

Alpha Vantage treats comma-separated ``tickers`` as an AND filter: returned
articles must mention every requested symbol. That makes provider-side ticker
batching unsuitable for a mover list. We instead fetch the latest market-wide
feed once and filter its entity tags locally.
"""
from __future__ import annotations

import hashlib
import logging
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from backend.models import Article
from backend.sentiment import label_sentiment

logger = logging.getLogger(__name__)

AV_NEWS_URL = "https://www.alphavantage.co/query"
SOURCE_ID = "alphavantage"
SOURCE_NAME = "Alpha Vantage"
DEFAULT_BATCH_SIZE = 25

# Pool of free-tier keys (25 calls/day each → 125/day combined).
# A random key is picked per batch call to spread quota evenly.
_AV_KEY_POOL: list[str] = [
    "FEUTCJVUAQYQZW48",
    "A3N97ADPLLL1N7Y6",
    "ZHAGPLUAD94HUA1B",
    "E1O9WUQ6K4D6AK0D",
    "U6U2A5DPK22TQCC5",
]


def _pick_key(override: str | None = None) -> str:
    """Return a key: override → ALPHA_VANTAGE_API_KEY env var → random pool key."""
    if override:
        return override
    env_key = os.environ.get("ALPHA_VANTAGE_API_KEY") or ""
    if env_key:
        return env_key
    return random.choice(_AV_KEY_POOL)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _av_time_to_iso(ts: str) -> str:
    """Convert AV timestamp '20260527T100803' to ISO-8601 UTC string."""
    try:
        dt = datetime.strptime(ts, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).isoformat()


def _article_id(url: str) -> str:
    return "av_" + hashlib.sha1(url.encode()).hexdigest()[:16]


def _av_label_to_ours(av_label: str) -> str:
    """Map AV sentiment labels to our internal label vocabulary."""
    mapping = {
        "Bullish": "bullish",
        "Somewhat-Bullish": "constructive",
        "Neutral": "mixed",
        "Somewhat-Bearish": "cautious",
        "Bearish": "bearish",
    }
    return mapping.get(av_label, "mixed")


# ---------------------------------------------------------------------------
# Raw API call
# ---------------------------------------------------------------------------

def fetch_av_news_batch(
    tickers: list[str],
    *,
    api_key: str | None = None,
    limit: int = 50,
    time_from: str | None = None,
) -> list[dict[str, Any]]:
    """Make one Alpha Vantage NEWS_SENTIMENT call.

    When ``tickers`` is empty the request returns the market-wide feed. This is
    the correct mode for fetching news for any of several symbols because a
    comma-separated ticker filter requires articles to mention every symbol.
    Returns the raw feed list (articles). Empty list on error.
    api_key is optional — if omitted a random key from the pool is used.
    """
    key = _pick_key(api_key)
    params = {
        "function": "NEWS_SENTIMENT",
        "apikey": key,
        "limit": str(min(limit, 1000)),
        "sort": "LATEST",
    }
    if tickers:
        params["tickers"] = ",".join(t.upper() for t in tickers)
    if time_from:
        params["time_from"] = time_from
    try:
        resp = requests.get(AV_NEWS_URL, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("av_news_fetch_error tickers=%s error=%s", tickers[:5], exc)
        return []

    if "Information" in data:
        logger.warning("av_news_rate_limited: %s", str(data)[:200])
        return []
    if "Note" in data:
        logger.warning("av_news_note: %s", str(data)[:200])
        return []

    feed = data.get("feed") or []
    logger.info("av_news_fetched tickers=%d articles=%d", len(tickers), len(feed))
    return feed


# ---------------------------------------------------------------------------
# Conversion: AV feed → Article dataclass list
# ---------------------------------------------------------------------------

def av_feed_to_articles(
    feed: list[dict[str, Any]],
    *,
    target_tickers: set[str],
    market: str = "US",
    min_relevance: float = 0.3,
) -> list[Article]:
    """Convert raw AV feed entries to Article objects.

    Only returns articles that are actually relevant (relevance_score >= min_relevance)
    to at least one of our target tickers.  Articles that merely mention a ticker
    in passing (low relevance) are dropped.
    """
    articles: list[Article] = []
    target_upper = {t.upper() for t in target_tickers}

    for entry in feed:
        url = str(entry.get("url") or "").strip()
        if not url:
            continue

        ticker_sentiments: list[dict[str, Any]] = entry.get("ticker_sentiment") or []

        # Keep only entries relevant to our tracked tickers above threshold.
        relevant = [
            ts for ts in ticker_sentiments
            if str(ts.get("ticker") or "").upper() in target_upper
            and float(ts.get("relevance_score") or 0) >= min_relevance
        ]
        if not relevant:
            continue

        # Focus ticker = highest relevance among our tracked tickers.
        focus = max(relevant, key=lambda ts: float(ts.get("relevance_score") or 0))
        focus_ticker = str(focus.get("ticker") or "").upper()

        # Overall sentiment from AV.
        overall_score = float(entry.get("overall_sentiment_score") or 0.0)
        overall_label = _av_label_to_ours(str(entry.get("overall_sentiment_label") or "Neutral"))

        # Build entity_mentions so stock_intelligence.py can read per-ticker sentiment.
        entity_mentions: list[dict[str, Any]] = [
            {
                "ticker": str(ts.get("ticker") or "").upper(),
                "sentiment_score": float(ts.get("ticker_sentiment_score") or overall_score),
                "sentiment_label": _av_label_to_ours(str(ts.get("ticker_sentiment_label") or "Neutral")),
                "relevance": float(ts.get("relevance_score") or 0.0),
                "mention_role": "primary" if float(ts.get("relevance_score") or 0) >= 0.7 else "secondary",
                "type": "stock",
            }
            for ts in ticker_sentiments
        ]

        stock_tickers = [
            str(ts.get("ticker") or "").upper()
            for ts in ticker_sentiments
            if float(ts.get("relevance_score") or 0) >= min_relevance
        ]

        topics: list[dict[str, Any]] = entry.get("topics") or []
        topic_key = str(topics[0].get("topic") or "") if topics else "financial_markets"
        tags = [str(t.get("topic") or "") for t in topics if t.get("topic")]

        summary = str(entry.get("summary") or "").strip()
        title = str(entry.get("title") or "").strip()
        published_at = _av_time_to_iso(str(entry.get("time_published") or ""))
        source_name = str(entry.get("source") or SOURCE_NAME).strip()

        articles.append(
            Article(
                id=_article_id(url),
                source_id=SOURCE_ID,
                source_name=source_name,
                source_kind="publisher",
                market=market,
                title=title,
                url=url,
                summary=summary,
                article_overview=summary,
                article_key_points=[],
                published_at=published_at,
                topic_key=topic_key,
                topic_label=topic_key.replace("_", " ").title(),
                topic_kind="market_news",
                tags=tags,
                sector_tags=[],
                stock_candidates=stock_tickers,
                stock_tickers=stock_tickers,
                signal_types=[],
                bucket_keys=[],
                bucket_labels=[],
                bucket_kinds=[],
                entity_mentions=entity_mentions,
                sentiment_score=overall_score,
                sentiment_label=overall_label,
                enrichment_source="alphavantage",
                source_lane="core" if float(focus.get("relevance_score") or 0) >= 0.7 else "broad",
                focus_ticker=focus_ticker,
                body_text="",
            )
        )

    return articles


# ---------------------------------------------------------------------------
# Public entry point: batched fetch for a full ticker list
# ---------------------------------------------------------------------------

def fetch_av_news_for_tickers(
    all_tickers: list[str],
    *,
    api_key: str | None = None,
    min_relevance: float = 0.3,
    market: str = "US",
    lookback_hours: int = 72,
    limit: int = 1000,
) -> list[Article]:
    """Fetch one market-wide AV feed and filter locally to ``all_tickers``.

    Provider-side ticker lists are deliberately not used because Alpha Vantage
    applies them as an AND filter. This function consumes exactly one request,
    regardless of ticker count, and returns deduplicated matching articles.
    """
    deduped_tickers = list(dict.fromkeys(t.upper() for t in all_tickers if t))
    if not deduped_tickers:
        return []

    time_from = (
        datetime.now(timezone.utc) - timedelta(hours=max(1, lookback_hours))
    ).strftime("%Y%m%dT%H%M")
    logger.info("av_news_plan tickers=%d calls=1 mode=market_wide", len(deduped_tickers))
    feed = fetch_av_news_batch(
        [],
        api_key=api_key,
        limit=limit,
        time_from=time_from,
    )
    converted = av_feed_to_articles(
        feed,
        target_tickers=set(deduped_tickers),
        market=market,
        min_relevance=min_relevance,
    )
    seen_urls: set[str] = set()
    articles: list[Article] = []
    for article in converted:
        if article.url not in seen_urls:
            seen_urls.add(article.url)
            articles.append(article)

    logger.info("av_news_total_articles articles=%d", len(articles))
    return articles
