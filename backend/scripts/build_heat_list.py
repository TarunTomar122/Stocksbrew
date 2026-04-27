"""Rebuild the heat list doc for a market.

Reads current enrichments to roll today's bucket into tm_mention_stats,
then scores every stock in the price universe and writes the top ranked
rows to tm_heat_list/{market}.
"""
from __future__ import annotations

import argparse
import time

from backend.heat_list import build_heat_list
from backend.instrument_universe import get_default_universe_id
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild heat list for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument(
        "--ai-universe",
        default=None,
        help="AI universe id whose enrichments feed mention velocity (e.g. us_test_10)",
    )
    parser.add_argument(
        "--price-universe",
        default=None,
        help="Price/scoring universe id (e.g. us_core_155). Defaults to ai-universe.",
    )
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    t0 = time.time()
    print(f"\n{'='*55}")
    print(f"  build_heat_list  market={args.market}")
    print(f"{'='*55}")

    store = TraceMoneyStore()
    ai_universe = args.ai_universe or get_default_universe_id(args.market)
    price_universe = (
        args.price_universe
        or store.get_active_price_universe(args.market)
        or ai_universe
    )
    print(f"  ai universe   : {ai_universe}")
    print(f"  price universe: {price_universe}")
    print(f"  limit         : {args.limit} rows")
    print()

    payload = build_heat_list(
        store,
        args.market,
        ai_universe_id=ai_universe,
        price_universe_id=price_universe,
        limit=args.limit,
    )

    print()
    print(f"  Saving tm_heat_list/{args.market} ...")
    store.save_heat_list(args.market, payload)

    elapsed = time.time() - t0
    row_count = payload["row_count"]
    print()
    print(f"{'='*55}")
    print(f"  Done in {elapsed:.1f}s  ·  {row_count} rows written")
    print(f"{'='*55}\n")

    if row_count == 0:
        print("  ⚠  No rows scored above the minimum threshold.")
        print("     Check that tm_stock_intel_pro has docs for this universe.")
    else:
        print("  Top 10 (with RSI — check this to confirm RSI is being resolved):")
        rsi_ok = 0
        rsi_null = 0
        for i, row in enumerate(payload["rows"][:10], 1):
            ticker = row.get("ticker", "?")
            score = row.get("heat_score", 0)
            rsi = row.get("rsi_14")
            rsi_state = row.get("rsi_14_state") or ""
            rsi_str = f"RSI {rsi:.1f} ({rsi_state})" if rsi is not None else "RSI —  ← missing!"
            reasons = ", ".join(row.get("reasons", [])[:2]) or "—"
            print(f"    {i:2}. {ticker:<8}  heat={score:5.1f}  {rsi_str:<28}  {reasons}")
            if rsi is not None:
                rsi_ok += 1
            else:
                rsi_null += 1
        print()
        if rsi_null > 0:
            print(f"  ⚠  RSI is null for {rsi_null}/{row_count} rows.")
            print("     → Run build_stock_technicals.py first, then retry.")
            print("       If that still shows null, check that tm_latest_prices")
            print("       docs have a `history_window` with ≥15 price points.")
        else:
            print(f"  ✓  RSI resolved for all {rsi_ok} rows.")
    print()


if __name__ == "__main__":
    main()
