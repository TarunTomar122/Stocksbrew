"""Enrich stored raw articles with the LLM and save article intelligence."""
from __future__ import annotations

import argparse
import json

from backend.llm_enrichment import OpenAIArticleEnricher
from backend.models import Article
from backend.storage import TraceMoneyStore


def _coerce_article(payload: dict) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich Trace Money articles")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    raw_articles = [_coerce_article(payload) for payload in store.list_news_articles(args.market, args.universe)]
    if not raw_articles:
        raise ValueError(f"No raw articles found for {args.market} / {args.universe}")

    enricher = OpenAIArticleEnricher(store=store)
    enriched_articles = enricher.enrich_articles(raw_articles)
    payload = [article.to_dict() for article in enriched_articles]
    store.save_article_enrichments(args.market, args.universe, payload)

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": args.universe,
            "article_count": len(payload),
            "articles": payload,
        }, indent=2))
    else:
        print(f"Saved {len(payload)} enriched articles for {args.market} / {args.universe}.")


if __name__ == "__main__":
    main()
