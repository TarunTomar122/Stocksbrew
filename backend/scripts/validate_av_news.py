"""Validate Alpha Vantage NEWS_SENTIMENT integration.

Makes EXACTLY ONE API call using the first batch of real tracked tickers.
Prints a human-readable report.  Writes nothing to Firestore.

Usage:
    python3 -m backend.scripts.validate_av_news [--tickers AAPL,NVDA,...] [--dry-run]

--tickers : comma-separated override (skips Firestore lookup)
--dry-run  : print the plan without making any API call (zero calls consumed)
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone

from backend.env import load_backend_env

load_backend_env()

from backend.news_av import fetch_av_news_batch, av_feed_to_articles, DEFAULT_BATCH_SIZE, _AV_KEY_POOL


def _age_str(published_at: str) -> str:
    try:
        pub = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        age_s = (datetime.now(timezone.utc) - pub).total_seconds()
        if age_s < 3600:
            return f"{int(age_s/60)}m ago"
        return f"{int(age_s/3600)}h ago"
    except Exception:
        return "?"


def _get_tracked_tickers(limit: int = DEFAULT_BATCH_SIZE) -> list[str]:
    """Pull real tracked tickers from Firestore (subscribed users only)."""
    from backend.storage import TraceMoneyStore
    store = TraceMoneyStore()
    seen: set[str] = set()
    tickers: list[str] = []
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        for instrument_id in (user.get("tracked_stocks") or []):
            iid = str(instrument_id or "").strip().upper()
            if not iid.startswith("US_"):
                continue
            ticker = iid.removeprefix("US_")
            if ticker and ticker not in seen:
                seen.add(ticker)
                tickers.append(ticker)
            if len(tickers) >= limit:
                return tickers
    return tickers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tickers", help="Comma-separated ticker override (skips Firestore)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan, no API call")
    args = parser.parse_args()

    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY") or ""

    if args.tickers:
        tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    else:
        print("Fetching tracked tickers from Firestore...")
        tickers = _get_tracked_tickers(limit=DEFAULT_BATCH_SIZE)

    print(f"\n{'='*60}")
    print(f"ALPHA VANTAGE NEWS VALIDATION")
    print(f"{'='*60}")
    print(f"Tickers ({len(tickers)}): {', '.join(tickers)}")
    print(f"Key pool size: {len(_AV_KEY_POOL)} keys ({len(_AV_KEY_POOL) * 25} calls/day combined)")
    print(f"API calls this will consume: 1")

    if args.dry_run:
        print("\n[DRY RUN] No API call made.")
        return

    print("\nFetching market-wide news from Alpha Vantage... (1 call, filtered locally)")
    time_from = (datetime.now(timezone.utc) - timedelta(hours=72)).strftime("%Y%m%dT%H%M")
    feed = fetch_av_news_batch(
        [],
        api_key=api_key or None,
        limit=1000,
        time_from=time_from,
    )

    if not feed:
        print("\nERROR: No articles returned.")
        print("  Possible causes:")
        print("  1. Daily quota exhausted (25 calls/day — check your usage)")
        print("  2. Per-minute rate limit hit (5 calls/min — wait 60s and retry)")
        print("  3. API key invalid")
        print("\n  Debug: run this to see the raw response:")
        print("  Check the NEWS_SENTIMENT market-wide response and account quota.")
        return

    print(f"\nRaw articles returned: {len(feed)}")

    # Convert to Article objects with our thresholds
    articles = av_feed_to_articles(feed, target_tickers=set(tickers), min_relevance=0.3)
    articles_high = av_feed_to_articles(feed, target_tickers=set(tickers), min_relevance=0.6)

    print(f"After relevance filter (>= 0.3): {len(articles)} articles")
    print(f"After relevance filter (>= 0.6): {len(articles_high)} articles (high-signal)")

    # Per-ticker coverage
    print(f"\n{'─'*60}")
    print("COVERAGE PER TICKER")
    print(f"{'─'*60}")
    coverage: dict[str, list] = {t: [] for t in tickers}
    for article in articles:
        for em in article.entity_mentions:
            t = str(em.get("ticker") or "").upper()
            if t in coverage:
                coverage[t].append({
                    "relevance": em.get("relevance"),
                    "sentiment": em.get("sentiment_label"),
                    "title": article.title[:80],
                    "age": _age_str(article.published_at),
                    "source": article.source_name,
                })
    covered = 0
    for ticker in tickers:
        items = coverage[ticker]
        if items:
            covered += 1
            top = sorted(items, key=lambda x: -(x["relevance"] or 0))[:2]
            print(f"\n  {ticker}: {len(items)} article(s)")
            for item in top:
                print(f"    [{item['age']}] {item['source']} | rel={item['relevance']:.2f} | {item['sentiment']}")
                print(f"    \"{item['title']}\"")
        else:
            print(f"\n  {ticker}: no coverage")

    print(f"\n{'─'*60}")
    print(f"SUMMARY")
    print(f"{'─'*60}")
    print(f"  Tickers queried  : {len(tickers)}")
    print(f"  Tickers covered  : {covered}/{len(tickers)}")
    print(f"  Raw articles     : {len(feed)}")
    print(f"  Relevant (>=0.3) : {len(articles)}")
    print(f"  High-signal(>=0.6): {len(articles_high)}")

    # Freshness
    ages_h = []
    for article in articles:
        try:
            pub = datetime.fromisoformat(article.published_at.replace("Z", "+00:00"))
            ages_h.append((datetime.now(timezone.utc) - pub).total_seconds() / 3600)
        except Exception:
            pass
    if ages_h:
        print(f"  Freshest article : {min(ages_h):.1f}h ago")
        print(f"  Oldest article   : {max(ages_h):.1f}h ago")
        print(f"  Median age       : {sorted(ages_h)[len(ages_h)//2]:.1f}h ago")

    # Sentiment distribution
    labels = [a.sentiment_label for a in articles]
    from collections import Counter
    dist = Counter(labels)
    print(f"  Sentiment mix    : {dict(dist)}")

    # Sources
    sources = Counter(a.source_name for a in articles)
    print(f"  Top sources      : {dict(sources.most_common(5))}")

    print(f"\n{'='*60}")
    print("Validation complete. API calls consumed: 1")
    print("="*60)


if __name__ == "__main__":
    main()
