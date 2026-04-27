"""Price-news divergence signal.

Flags stocks where today's price move and recent news sentiment disagree:
price down with bullish news, or price up with bearish news. This is a pure
computed view over existing enrichments and latest price docs.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore


RECENT_DAYS = 3
MIN_ARTICLES = 2
MIN_ABS_PRICE_MOVE = 3.0
MIN_ABS_SENTIMENT = 0.25


def _parse_date(value: Any) -> str:
    if not value:
        return ""
    s = str(value)
    return s[:10] if len(s) >= 10 else ""


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _quote_field(price_doc: dict[str, Any] | None, field: str) -> float | None:
    quote = (price_doc or {}).get("quote") or {}
    return _safe_float(quote.get(field))


def _instrument_ids_for_article(article: dict[str, Any], market: str) -> list[tuple[str, float]]:
    """Return unique (instrument_id, sentiment_score) pairs for stock mentions."""
    seen: set[str] = set()
    out: list[tuple[str, float]] = []
    article_market = str(article.get("market") or market).upper()
    article_sentiment = _safe_float(article.get("sentiment_score")) or 0.0

    for mention in article.get("entity_mentions") or []:
        if str(mention.get("type", "")).lower() != "stock":
            continue
        if str(mention.get("mention_role", "")).lower() == "incidental":
            continue
        ticker = str(mention.get("ticker", "")).strip().upper()
        if not ticker:
            continue
        mention_market = str(mention.get("market") or article_market).upper()
        instrument_id = f"{mention_market}_{ticker}"
        if instrument_id in seen:
            continue
        seen.add(instrument_id)
        sentiment = _safe_float(mention.get("sentiment_score"))
        out.append((instrument_id, article_sentiment if sentiment is None else sentiment))

    if out:
        return out

    # Older enrichments may only have stock_tickers. Keep this fallback broad
    # but unique, because otherwise old runs never generate the signal.
    for ticker_raw in article.get("stock_tickers") or []:
        ticker = str(ticker_raw).strip().upper()
        if not ticker:
            continue
        instrument_id = f"{article_market}_{ticker}"
        if instrument_id in seen:
            continue
        seen.add(instrument_id)
        out.append((instrument_id, article_sentiment))

    return out


def _sentiment_label(score: float) -> str:
    if score >= MIN_ABS_SENTIMENT:
        return "bullish"
    if score <= -MIN_ABS_SENTIMENT:
        return "bearish"
    return "neutral"


def _headline(ticker: str, direction: str) -> str:
    if direction == "bullish_news_price_down":
        return f"{ticker} is selling off despite bullish coverage"
    return f"{ticker} is rallying while coverage turns bearish"


def _reason(
    ticker: str,
    price_change_pct: float,
    sentiment_score: float,
    article_count: int,
    direction: str,
) -> str:
    price_text = f"{price_change_pct:+.1f}%"
    sentiment_text = "bullish" if sentiment_score > 0 else "bearish"
    if direction == "bullish_news_price_down":
        return (
            f"{ticker} is down {price_text} today, but {article_count} recent "
            f"articles average {sentiment_text} sentiment."
        )
    return (
        f"{ticker} is up {price_text} today, but {article_count} recent "
        f"articles average {sentiment_text} sentiment."
    )


def build_divergence_list(
    store: TraceMoneyStore,
    market: str,
    *,
    ai_universe_id: str,
    price_universe_id: str,
    limit: int = 25,
    recent_days: int = RECENT_DAYS,
) -> dict[str, Any]:
    """Build a ranked price-news divergence payload for one market."""
    market = market.upper()
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=recent_days)).isoformat()

    enrichments = store.list_article_enrichments(market, ai_universe_id)
    aggregates: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "sentiment_sum": 0.0,
            "sentiment_n": 0,
            "articles": [],
            "sources": set(),
        }
    )

    for article in enrichments:
        published_date = _parse_date(article.get("published_at"))
        if not published_date or published_date < cutoff:
            continue
        for instrument_id, sentiment in _instrument_ids_for_article(article, market):
            if not instrument_id.startswith(f"{market}_"):
                continue
            bucket = aggregates[instrument_id]
            bucket["sentiment_sum"] += sentiment
            bucket["sentiment_n"] += 1
            source_name = str(article.get("source_name") or "").strip()
            if source_name:
                bucket["sources"].add(source_name)
            if len(bucket["articles"]) < 3:
                bucket["articles"].append({
                    "title": str(article.get("title") or "").strip(),
                    "url": str(article.get("url") or "").strip(),
                    "source_name": source_name,
                    "published_at": str(article.get("published_at") or ""),
                    "sentiment_score": round(sentiment, 3),
                })

    if not aggregates:
        return {
            "market": market,
            "ai_universe_id": ai_universe_id,
            "price_universe_id": price_universe_id,
            "window_days": recent_days,
            "min_articles": MIN_ARTICLES,
            "min_abs_price_move": MIN_ABS_PRICE_MOVE,
            "min_abs_sentiment": MIN_ABS_SENTIMENT,
            "rows": [],
            "row_count": 0,
        }

    instrument_ids = list(aggregates.keys())
    prices = store.get_latest_prices(instrument_ids)
    instruments = {
        row["instrument_id"]: row
        for row in list_instruments(market, price_universe_id)
        if row.get("instrument_id") in aggregates
    }

    rows: list[dict[str, Any]] = []
    for instrument_id, agg in aggregates.items():
        article_count = int(agg["sentiment_n"])
        if article_count < MIN_ARTICLES:
            continue
        price_doc = prices.get(instrument_id)
        price_change_pct = _quote_field(price_doc, "day_change_pct")
        if price_change_pct is None or abs(price_change_pct) < MIN_ABS_PRICE_MOVE:
            continue

        sentiment_score = float(agg["sentiment_sum"]) / max(1, article_count)
        if abs(sentiment_score) < MIN_ABS_SENTIMENT:
            continue

        direction = ""
        if price_change_pct <= -MIN_ABS_PRICE_MOVE and sentiment_score >= MIN_ABS_SENTIMENT:
            direction = "bullish_news_price_down"
        elif price_change_pct >= MIN_ABS_PRICE_MOVE and sentiment_score <= -MIN_ABS_SENTIMENT:
            direction = "bearish_news_price_up"
        if not direction:
            continue

        instrument = instruments.get(instrument_id, {})
        price_ticker = str((price_doc or {}).get("ticker") or "").strip()
        ticker = str(instrument.get("ticker") or price_ticker or instrument_id.split("_", 1)[1])
        confidence = min(
            95.0,
            35.0
            + min(35.0, abs(price_change_pct) * 4.0)
            + min(20.0, abs(sentiment_score) * 35.0)
            + min(10.0, article_count * 2.0),
        )
        rows.append({
            "type": "price_news_divergence",
            "instrument_id": instrument_id,
            "ticker": ticker,
            "name": instrument.get("name") or (price_doc or {}).get("provider_metadata", {}).get("name") or ticker,
            "sector": instrument.get("sector"),
            "industry": instrument.get("industry"),
            "price": _quote_field(price_doc, "current"),
            "price_change_pct": round(price_change_pct, 2),
            "sentiment_score": round(sentiment_score, 3),
            "sentiment_label": _sentiment_label(sentiment_score),
            "direction": direction,
            "headline": _headline(ticker, direction),
            "reason": _reason(ticker, price_change_pct, sentiment_score, article_count, direction),
            "article_count": article_count,
            "source_count": len(agg["sources"]),
            "confidence": round(confidence, 1),
            "articles": agg["articles"],
        })

    rows.sort(
        key=lambda row: (
            float(row["confidence"]),
            abs(float(row["price_change_pct"])),
            int(row["article_count"]),
        ),
        reverse=True,
    )
    rows = rows[:limit]
    return {
        "market": market,
        "ai_universe_id": ai_universe_id,
        "price_universe_id": price_universe_id,
        "window_days": recent_days,
        "min_articles": MIN_ARTICLES,
        "min_abs_price_move": MIN_ABS_PRICE_MOVE,
        "min_abs_sentiment": MIN_ABS_SENTIMENT,
        "rows": rows,
        "row_count": len(rows),
    }
