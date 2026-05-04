"""Rebuild price-news divergence signals for a market."""
from __future__ import annotations

import argparse
import time

from backend.divergence import build_divergence_list
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Build price-news divergence signals")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--ai-universe", default=None, help="Universe whose enrichments feed sentiment")
    parser.add_argument("--price-universe", default=None, help="Universe whose prices validate the signal")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--recent-days", type=int, default=3)
    args = parser.parse_args()

    t0 = time.time()
    store = TraceMoneyStore()
    ai_universe = args.ai_universe or store.get_active_ai_universe(args.market)
    price_universe = args.price_universe or store.get_active_price_universe(args.market)
    if not ai_universe or not price_universe:
        raise ValueError(
            f"Missing active universe config for {args.market}. "
            "Set both <MARKET>_ai_universe and <MARKET>_price_universe, or pass --ai-universe and --price-universe."
        )

    print(f"\n{'='*55}")
    print(f"  build_divergence  market={args.market}")
    print(f"{'='*55}")
    print(f"  ai universe   : {ai_universe}")
    print(f"  price universe: {price_universe}")
    print(f"  window        : {args.recent_days} days")
    print(f"  limit         : {args.limit} rows")
    print()

    payload = build_divergence_list(
        store,
        args.market,
        ai_universe_id=ai_universe,
        price_universe_id=price_universe,
        limit=args.limit,
        recent_days=args.recent_days,
    )

    print(f"  Saving tm_divergence/{args.market} ...")
    store.save_divergence_list(args.market, payload)

    elapsed = time.time() - t0
    row_count = payload["row_count"]
    print()
    print(f"{'='*55}")
    print(f"  Done in {elapsed:.1f}s  ·  {row_count} divergences written")
    print(f"{'='*55}\n")

    if row_count == 0:
        print("  No qualifying price-news divergences found.")
    else:
        print("  Top 5:")
        for index, row in enumerate(payload["rows"][:5], 1):
            print(
                f"    {index:2}. {row.get('ticker', '?'):<8} "
                f"{row.get('price_change_pct', 0):>6}%  "
                f"sent={row.get('sentiment_score', 0):>5}  "
                f"conf={row.get('confidence', 0):>5}"
            )
    print()


if __name__ == "__main__":
    main()
