"""Fetch and store raw news articles for a small test universe."""
from __future__ import annotations

import argparse
import json

from backend.news_pipeline import collect_universe_articles
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Trace Money raw news articles")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--max-articles", type=int, default=20)
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    articles, source_health = collect_universe_articles(
        market=args.market,
        universe_id=args.universe,
        max_articles=args.max_articles,
    )
    payload = [article.to_dict() for article in articles]
    store = TraceMoneyStore()
    store.save_news_articles(args.market, args.universe, payload, source_health=source_health)

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": args.universe,
            "article_count": len(payload),
            "source_health": source_health,
            "articles": payload,
        }, indent=2))
    else:
        print(f"Saved {len(payload)} raw articles for {args.market} / {args.universe}.")


if __name__ == "__main__":
    main()
