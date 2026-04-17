"""Run the small-universe news intelligence flow end to end."""
from __future__ import annotations

import argparse

from backend.scripts.build_stock_intelligence import main as build_stock_intelligence_main
from backend.scripts.build_context_intelligence import main as build_context_intelligence_main
from backend.scripts.enrich_articles import main as enrich_articles_main
from backend.scripts.ingest_news import main as ingest_news_main
from backend.scripts.materialize_views import main as materialize_views_main


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Trace Money news intelligence end to end")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--max-articles", type=int, default=20)
    parser.add_argument("--skip-materialize", action="store_true")
    args = parser.parse_args()

    import sys

    sys.argv = ["ingest_news", "--market", args.market, "--universe", args.universe, "--max-articles", str(args.max_articles)]
    ingest_news_main()
    sys.argv = ["enrich_articles", "--market", args.market, "--universe", args.universe]
    enrich_articles_main()
    sys.argv = ["build_stock_intelligence", "--market", args.market, "--universe", args.universe]
    build_stock_intelligence_main()
    sys.argv = ["build_context_intelligence", "--market", args.market, "--universe", args.universe]
    build_context_intelligence_main()
    if not args.skip_materialize:
        sys.argv = ["materialize_views", "--market", args.market, "--universe", args.universe]
        materialize_views_main()


if __name__ == "__main__":
    main()
