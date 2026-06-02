from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys

from backend.tikrr_pipeline.article_fetcher import fetch_article_evidence
from backend.tikrr_pipeline.client import TikrrAPIClient
from backend.tikrr_pipeline.facts import curate_hits, extract_facts, merge_extracted_facts
from backend.tikrr_pipeline.openai_client import OpenAIJSONClient
from backend.tikrr_pipeline.prompting import SYSTEM_PROMPT, build_user_prompt
from backend.tikrr_pipeline.searxng import SearXNGClient, build_stock_queries


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a minimal Tikrr stock pipeline test")
    parser.add_argument("--market", required=True, choices=["US", "IN"])
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--name")
    parser.add_argument("--run-type", default="market_open", choices=["pre_market", "market_open", "midday", "market_close"])
    parser.add_argument("--limit", type=int, default=5, help="Max hits per query")
    parser.add_argument("--push", action="store_true", help="POST the generated payload to Tikrr")
    parser.add_argument("--output", help="Optional file path to save JSON")
    args = parser.parse_args()

    try:
        searxng = SearXNGClient()
        llm = OpenAIJSONClient()

        queries = build_stock_queries(args.symbol.upper(), args.market.upper(), args.name)
        hit_map = defaultdict(list)
        for label, query, options in queries:
            hit_map[label].extend(searxng.search(query, limit=args.limit, **options))

        stock_name = args.name or args.symbol.upper()
        curated = {
            "price": curate_hits("price", hit_map["price"], args.symbol.upper(), stock_name, limit=args.limit),
            "news": curate_hits("news", hit_map["news"], args.symbol.upper(), stock_name, limit=args.limit),
            "analyst": curate_hits("analyst", hit_map["analyst"], args.symbol.upper(), stock_name, limit=args.limit),
        }
        full_news_articles = fetch_article_evidence(
            curated["news"],
            label="news",
            symbol=args.symbol.upper(),
            stock_name=stock_name,
            limit=min(3, args.limit),
        )
        full_analyst_articles = fetch_article_evidence(
            curated["analyst"],
            label="analyst",
            symbol=args.symbol.upper(),
            stock_name=stock_name,
            limit=min(2, args.limit),
        )

        prompt = build_user_prompt(
            symbol=args.symbol.upper(),
            market=args.market.upper(),
            stock_name=stock_name,
            run_type=args.run_type,
            price_hits=curated["price"],
            news_hits=curated["news"],
            analyst_hits=curated["analyst"],
            full_news_articles=full_news_articles,
            full_analyst_articles=full_analyst_articles,
        )
        payload = llm.generate_stock_payload(SYSTEM_PROMPT, prompt)
        facts = extract_facts(
            symbol=args.symbol.upper(),
            stock_name=stock_name,
            price_hits=curated["price"],
            news_hits=curated["news"],
            analyst_hits=curated["analyst"],
        )
        payload = merge_extracted_facts(payload, facts)
    except Exception as exc:  # pragma: no cover - operator-facing CLI
        print(f"Pipeline test failed: {exc}", file=sys.stderr)
        print(
            "Check that SearXNG is reachable at SEARXNG_BASE_URL and OPENAI_API_KEY is set.",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

    output_text = json.dumps(payload, indent=2)
    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.write_text(output_text + "\n", encoding="utf-8")
    print(output_text)

    if args.push:
        client = TikrrAPIClient()
        result = client.push_stock(args.market.upper(), args.symbol.upper(), payload)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
