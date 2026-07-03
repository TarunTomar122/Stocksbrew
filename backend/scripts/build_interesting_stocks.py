"""Rebuild the Pulse interesting-stocks list for a market."""
from __future__ import annotations

import argparse
import time

from backend.interesting_stocks import build_interesting_stocks
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_interesting_stocks for Pulse")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument(
        "--ai-universe",
        default=None,
        help="Universe for stock_intelligence lookup (defaults to active AI universe)",
    )
    parser.add_argument(
        "--price-universe",
        default=None,
        help="Universe for price snapshot (defaults to active price universe; accepted for job parity)",
    )
    args = parser.parse_args()

    t0 = time.time()
    print(f"\n{'='*55}")
    print(f"  build_interesting_stocks  market={args.market}")
    print(f"{'='*55}")

    store = TraceMoneyStore()
    ai_universe = args.ai_universe or store.get_active_ai_universe(args.market)
    if not ai_universe:
        raise ValueError(
            f"Missing active AI universe for {args.market}. "
            "Pass --ai-universe or set tm_config/active_universes."
        )
    print(f"  ai universe: {ai_universe}\n")

    payload = build_interesting_stocks(store, args.market, ai_universe_id=ai_universe)

    print(f"\n  Saving tm_interesting_stocks/{args.market} ...")
    store.save_interesting_stocks(args.market, payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_interesting_stocks",
        universe_id=ai_universe,
        expected_count=int(payload.get("scored_count") or 0),
        success_count=int(payload.get("row_count") or 0),
        error_count=max(0, int(payload.get("eligible_count") or 0) - int(payload.get("row_count") or 0)),
        metadata={"ai_universe": ai_universe},
    )

    elapsed = time.time() - t0
    print(f"\n{'='*55}")
    print(f"  Done in {elapsed:.1f}s  ·  {payload.get('row_count', 0)} rows written")
    print(f"{'='*55}\n")

    for i, row in enumerate(payload.get("rows") or [], 1):
        ticker = row.get("ticker", "?")
        score = row.get("interesting_score", 0)
        setup = row.get("setup_type", "?")
        reasons = ", ".join(row.get("reasons") or [])
        print(f"    {i:2}. {ticker:<8}  score={score:5.1f}  {setup:<16}  {reasons}")
    print()


if __name__ == "__main__":
    main()
