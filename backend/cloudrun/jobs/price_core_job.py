from __future__ import annotations

import argparse
from typing import Any

from backend.price_pipeline_contract import require_price_batch_coverage
from backend.scripts.materialize_views import materialize_views
from backend.scripts.sync_price_snapshots import sync_price_snapshots
from backend.storage import TraceMoneyStore


def _parse_ids(value: str) -> list[str]:
    return [item.strip().upper() for item in value.split(",") if item.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Price core shard worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="price_core")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--shard-id", required=True)
    parser.add_argument("--instrument-ids", required=True)
    parser.add_argument("--session-phase", default="manual")
    parser.add_argument("--max-workers", type=int, default=6)
    args = parser.parse_args()

    ids = _parse_ids(args.instrument_ids)
    if not ids:
        raise ValueError("No instrument ids provided")

    store = TraceMoneyStore()

    price_result = sync_price_snapshots(
        market=args.market,
        universe_id=args.universe,
        session_phase=args.session_phase,
        max_workers=args.max_workers,
        instrument_ids=ids,
        activate=False,
        merge_market_snapshot=True,
        store=store,
    )
    require_price_batch_coverage(
        price_result,
        minimum_coverage=0.98,
        context=f"{args.market} {args.session_phase} price batch",
    )
    materialize_result = materialize_views(
        market=args.market,
        universe_id=args.universe,
        instrument_ids=ids,
        activate=False,
        allow_missing_context=True,
        skip_sector_scrape=True,
        skip_dashboard=True,
        store=store,
    )

    out: dict[str, Any] = {
        "run_id": args.run_id,
        "lane": args.lane,
        "market": args.market,
        "universe_id": args.universe,
        "shard_id": args.shard_id,
        "instrument_count": len(ids),
        "price": price_result,
        "materialize": materialize_result,
    }
    print(out)


if __name__ == "__main__":
    main()
