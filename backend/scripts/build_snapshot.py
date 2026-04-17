"""Build and persist a market snapshot."""
from __future__ import annotations

import argparse
import json

from backend.pipeline import build_market_snapshot
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Trace Money market snapshot")
    parser.add_argument("--market", choices=["IN", "US"], default="US")
    parser.add_argument("--include-review-sources", action="store_true")
    parser.add_argument("--source-ids", default="", help="Comma-separated source ids to include")
    parser.add_argument("--max-articles", type=int, default=None, help="Maximum number of freshest articles to process")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    source_ids = [item.strip() for item in args.source_ids.split(",") if item.strip()]

    snapshot = build_market_snapshot(
        market=args.market,
        include_review_sources=args.include_review_sources,
        use_llm=True,
        source_ids=source_ids or None,
        max_articles=args.max_articles,
    )
    store = TraceMoneyStore()
    store.save_snapshot(dict(snapshot))

    if args.print_json:
        print(json.dumps(snapshot, indent=2))
    else:
        print(
            f"Saved snapshot {snapshot['snapshot_id']} with "
            f"{snapshot['stats']['bucket_count']} buckets and {snapshot['stats']['article_count']} articles."
        )


if __name__ == "__main__":
    main()
