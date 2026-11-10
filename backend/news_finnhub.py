"""Finnhub company-news fetcher.

Fetches ticker-specific news from Finnhub's company-news endpoint (60 req/min
free tier).  Returns Article objects that slot into the existing pipeline.
Sentiment is computed locally from headline+summary since Finnhub does not
provide pre-computed sentiment.

Usage:
    articles = fetch_finnhub_news_for_tickers(["AAPL", "NVDA"])

One API call per ticker.  Only call this for the tracked-stocks subset (30-40
tickers) — not the full 500-stock universe — to stay within rate limits.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from backend.models import Article
from backend.sentiment import score_sentiment, label_sentiment

logger = logging.getLogger(__name__)

FINNHUB_URL = "https://finnhub.io/api/v1/company-news"
SOURCE_ID = "finnhub"

# Free tier: 60 req/min.  Sleep this many seconds between per-ticker calls.
_SLEEP_BETWEEN_CALLS = 1.1


def _api_key() -> str:
    """Read the finnhub key from the environment (FINNHUB_API_KEY); empty when unset."""
    return os.environ.get("FINNHUB_API_KEY", "").strip()


def _article_id(url: str) -> str:
    return "fh_" + hashlib.sha1(url.encode()).hexdigest()[:16]


def _fetch_ticker(
    ticker: str,
    *,
    api_key: str,
    from_date: str,
    to_date: str,
) -> list[dict[str, Any]]:
    """One Finnhub API call for a single ticker.  Returns raw article list."""
    try:
        resp = requests.get(
            FINNHUB_URL,
            params={"symbol": ticker, "from": from_date, "to": to_date, "token": api_key},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("finnhub_fetch_error ticker=%s error=%s", ticker, exc)
        return []

    if isinstance(data, dict) and data.get("error"):
        logger.warning("finnhub_api_error ticker=%s error=%s", ticker, data["error"])
        return []

    articles = data if isinstance(data, list) else []
    logger.debug("finnhub_fetched ticker=%s articles=%d", ticker, len(articles))
    return articles


def _raw_to_article(raw: dict[str, Any], focus_ticker: str, market: str) -> Article | None:
    url = str(raw.get("url") or "").strip()
    if not url:
        return None

    headline = str(raw.get("headline") or "").strip()
    summary = str(raw.get("summary") or "").strip()
    source_name = str(raw.get("source") or "Finnhub").strip()

    ts = raw.get("datetime")
    try:
        published_at = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OSError):
        published_at = datetime.now(timezone.utc).isoformat()

    text_for_sentiment = f"{headline} {summary}"
    score = score_sentiment(text_for_sentiment)
    s_label = label_sentiment(score)

    entity_mention = {
        "ticker": focus_ticker.upper(),
        "sentiment_score": score,
        "sentiment_label": s_label,
        "relevance": 0.85,
        "mention_role": "primary",
        "type": "stock",
    }

    return Article(
        id=_article_id(url),
        source_id=SOURCE_ID,
        source_name=source_name,
        source_kind="publisher",
        market=market,
        title=headline,
        url=url,
        summary=summary,
        article_overview=summary,
        article_key_points=[],
        published_at=published_at,
        topic_key="financial_markets",
        topic_label="Financial Markets",
        topic_kind="market_news",
        tags=[],
        sector_tags=[],
        stock_candidates=[focus_ticker.upper()],
        stock_tickers=[focus_ticker.upper()],
        signal_types=[],
        bucket_keys=[],
        bucket_labels=[],
        bucket_kinds=[],
        entity_mentions=[entity_mention],
        sentiment_score=score,
        sentiment_label=s_label,
        enrichment_source="finnhub",
        source_lane="core",
        focus_ticker=focus_ticker.upper(),
        body_text="",
    )


def fetch_finnhub_news_for_tickers(
    tickers: list[str],
    *,
    api_key: str | None = None,
    lookback_days: int = 3,
    market: str = "US",
    max_per_ticker: int = 10,
    sleep_between: float = _SLEEP_BETWEEN_CALLS,
) -> list[Article]:
    """Fetch Finnhub company news for a list of tickers.

    Makes one API call per ticker.  Intended for tracked-stocks subset only
    (30-40 tickers) to respect the 60 req/min free-tier limit.
    Returns deduplicated Article list.
    """
    key = api_key or _api_key()
    if not key:
        logger.warning("finnhub_skipped reason=missing_api_key env=FINNHUB_API_KEY")
        return []
    today = datetime.now(timezone.utc)
    to_date = today.strftime("%Y-%m-%d")
    from_date = (today - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    seen_urls: set[str] = set()
    articles: list[Article] = []

    deduped = list(dict.fromkeys(t.upper() for t in tickers if t))
    logger.info("finnhub_plan tickers=%d from=%s to=%s", len(deduped), from_date, to_date)

    for idx, ticker in enumerate(deduped):
        if idx > 0 and sleep_between > 0:
            time.sleep(sleep_between)

        raw_list = _fetch_ticker(ticker, api_key=key, from_date=from_date, to_date=to_date)
        count = 0
        for raw in raw_list:
            if count >= max_per_ticker:
                break
            article = _raw_to_article(raw, ticker, market)
            if article and article.url not in seen_urls:
                seen_urls.add(article.url)
                articles.append(article)
                count += 1

    logger.info("finnhub_total articles=%d", len(articles))
    return articles
