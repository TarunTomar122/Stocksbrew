"""Sentiment flip detection signal.

Flags stocks where news coverage has reversed direction: a name that carried
consistently negative (or positive) coverage for the past 10 days has flipped
sharply in the last 3 days. This is an early-warning signal - the price often
hasn't moved yet.

Data source: same enrichment runs as divergence. No extra Firestore reads.
Output:      tm_sentiment_flip/{market}
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore

# Import shared helpers from divergence to avoid duplication.
from backend.divergence import (
    _instrument_ids_for_article,
    _parse_date,
    _safe_float,
)


# ─── Tuneable thresholds ─────────────────────────────────────────────────────

WINDOW_DAYS = 14        # total lookback window
RECENT_DAYS = 3         # "new signal" window
PRIOR_DAYS = WINDOW_DAYS - RECENT_DAYS  # "old baseline" window

MIN_PRIOR_ARTICLES = 3  # need a real baseline
MIN_RECENT_ARTICLES = 2  # at least two articles to trust the flip
MIN_PRIOR_SENTIMENT = 0.20   # prior window must be clearly directional
MIN_RECENT_SENTIMENT = 0.20  # recent window must be clearly directional the other way
MIN_DELTA = 0.30             # minimum sentiment shift to count as a flip


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _headline(ticker: str, direction: str) -> str:
    if direction == "bearish_to_bullish":
        return f"{ticker} coverage is turning bullish after sustained negative news"
    return f"{ticker} coverage is turning bearish after a sustained positive run"


def _reason(
    ticker: str,
    prior_sentiment: float,
    recent_sentiment: float,
    prior_count: int,
    recent_count: int,
    direction: str,
) -> str:
    prior_dir = "bullish" if prior_sentiment > 0 else "bearish"
    recent_dir = "bullish" if recent_sentiment > 0 else "bearish"
    return (
        f"Over the previous {PRIOR_DAYS} days {ticker} had {prior_count} articles "
        f"averaging {prior_dir} sentiment ({prior_sentiment:+.2f}). "
        f"The past {RECENT_DAYS} days brought {recent_count} articles "
        f"averaging {recent_dir} ({recent_sentiment:+.2f})."
    )


def _confidence(
    prior_sentiment: float,
    recent_sentiment: float,
    prior_count: int,
    recent_count: int,
) -> float:
    delta = abs(recent_sentiment - prior_sentiment)
    return min(
        95.0,
        25.0
        + min(20.0, abs(prior_sentiment) * 50.0)   # how directional the old trend was
        + min(20.0, abs(recent_sentiment) * 50.0)  # how directional the new signal is
        + min(15.0, delta * 25.0)                  # size of the flip
        + min(10.0, prior_count * 1.5)             # data depth in baseline
        + min(10.0, recent_count * 4.0),           # recency coverage
    )


# ─── Main builder ─────────────────────────────────────────────────────────────

def build_sentiment_flip_list(
    store: TraceMoneyStore,
    market: str,
    *,
    ai_universe_id: str,
    price_universe_id: str,
    limit: int = 25,
    window_days: int = WINDOW_DAYS,
    recent_days: int = RECENT_DAYS,
) -> dict[str, Any]:
    """Build a ranked sentiment-flip payload for one market."""
    market = market.upper()
    today = datetime.now(timezone.utc).date()
    window_cutoff = (today - timedelta(days=window_days)).isoformat()
    recent_cutoff = (today - timedelta(days=recent_days)).isoformat()

    enrichments = store.list_article_enrichments(market, ai_universe_id)

    # per instrument: separate buckets for prior and recent windows.
    prior: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"sentiment_sum": 0.0, "n": 0, "articles": []}
    )
    recent: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"sentiment_sum": 0.0, "n": 0, "articles": []}
    )

    for article in enrichments:
        published_date = _parse_date(article.get("published_at"))
        if not published_date or published_date < window_cutoff:
            continue

        in_recent = published_date >= recent_cutoff

        for instrument_id, sentiment in _instrument_ids_for_article(article, market):
            if not instrument_id.startswith(f"{market}_"):
                continue

            bucket = recent[instrument_id] if in_recent else prior[instrument_id]
            bucket["sentiment_sum"] += sentiment
            bucket["n"] += 1

            # Keep the 3 most recent articles for the lead-read section.
            if in_recent and len(bucket["articles"]) < 3:
                source_name = str(article.get("source_name") or "").strip()
                bucket["articles"].append({
                    "title": str(article.get("title") or "").strip(),
                    "url": str(article.get("url") or "").strip(),
                    "source_name": source_name,
                    "published_at": str(article.get("published_at") or ""),
                    "sentiment_score": round(sentiment, 3),
                })

    # Gather all instruments that appear in both windows.
    all_ids = set(prior) | set(recent)
    if not all_ids:
        return _empty_payload(market, ai_universe_id, price_universe_id, window_days, recent_days)

    instruments = {
        row["instrument_id"]: row
        for row in list_instruments(market, price_universe_id)
        if row.get("instrument_id") in all_ids
    }

    rows: list[dict[str, Any]] = []
    for instrument_id in all_ids:
        p = prior.get(instrument_id, {})
        r = recent.get(instrument_id, {})

        prior_count = int(p.get("n", 0))
        recent_count = int(r.get("n", 0))

        if prior_count < MIN_PRIOR_ARTICLES or recent_count < MIN_RECENT_ARTICLES:
            continue

        prior_sentiment = float(p["sentiment_sum"]) / prior_count
        recent_sentiment = float(r["sentiment_sum"]) / recent_count

        # Both must be clearly directional and in opposite directions.
        if abs(prior_sentiment) < MIN_PRIOR_SENTIMENT:
            continue
        if abs(recent_sentiment) < MIN_RECENT_SENTIMENT:
            continue
        if math.copysign(1, prior_sentiment) == math.copysign(1, recent_sentiment):
            continue  # same direction → not a flip
        if abs(recent_sentiment - prior_sentiment) < MIN_DELTA:
            continue

        direction = (
            "bearish_to_bullish"
            if prior_sentiment < 0 and recent_sentiment > 0
            else "bullish_to_bearish"
        )

        instrument = instruments.get(instrument_id, {})
        ticker = str(instrument.get("ticker") or instrument_id.split("_", 1)[-1])
        conf = _confidence(prior_sentiment, recent_sentiment, prior_count, recent_count)

        rows.append({
            "type": "sentiment_flip",
            "instrument_id": instrument_id,
            "ticker": ticker,
            "name": instrument.get("name") or ticker,
            "sector": instrument.get("sector"),
            "industry": instrument.get("industry"),
            "direction": direction,
            "headline": _headline(ticker, direction),
            "reason": _reason(
                ticker, prior_sentiment, recent_sentiment,
                prior_count, recent_count, direction,
            ),
            "prior_sentiment": round(prior_sentiment, 3),
            "recent_sentiment": round(recent_sentiment, 3),
            "sentiment_delta": round(abs(recent_sentiment - prior_sentiment), 3),
            "prior_article_count": prior_count,
            "recent_article_count": recent_count,
            "confidence": round(conf, 1),
            "articles": r.get("articles", []),
        })

    rows.sort(
        key=lambda row: (
            float(row["confidence"]),
            float(row["sentiment_delta"]),
        ),
        reverse=True,
    )
    rows = rows[:limit]

    return {
        "market": market,
        "ai_universe_id": ai_universe_id,
        "price_universe_id": price_universe_id,
        "window_days": window_days,
        "recent_days": recent_days,
        "min_prior_articles": MIN_PRIOR_ARTICLES,
        "min_recent_articles": MIN_RECENT_ARTICLES,
        "min_delta": MIN_DELTA,
        "rows": rows,
        "row_count": len(rows),
    }


def _empty_payload(
    market: str,
    ai_universe_id: str,
    price_universe_id: str,
    window_days: int,
    recent_days: int,
) -> dict[str, Any]:
    return {
        "market": market,
        "ai_universe_id": ai_universe_id,
        "price_universe_id": price_universe_id,
        "window_days": window_days,
        "recent_days": recent_days,
        "min_prior_articles": MIN_PRIOR_ARTICLES,
        "min_recent_articles": MIN_RECENT_ARTICLES,
        "min_delta": MIN_DELTA,
        "rows": [],
        "row_count": 0,
    }
