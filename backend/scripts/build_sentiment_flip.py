"""Rebuild the sentiment-flip signal doc for a market."""
from __future__ import annotations

import argparse
import time

from backend.sentiment_flip import build_sentiment_flip_list
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Build sentiment-flip signals for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--ai-universe", default=None, help="Universe whose enrichments feed sentiment")
    parser.add_argument("--price-universe", default=None, help="Universe for instrument metadata")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--window-days", type=int, default=14, help="Total lookback window (days)")
    parser.add_argument("--recent-days", type=int, default=3, help="Recent (flip) window (days)")
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
    print(f"  build_sentiment_flip  market={args.market}")
    print(f"{'='*55}")
    print(f"  ai universe   : {ai_universe}")
    print(f"  price universe: {price_universe}")
    print(f"  window        : {args.window_days} days  (recent={args.recent_days}d)")
    print(f"  limit         : {args.limit} rows")
    print()

    payload = build_sentiment_flip_list(
        store,
        args.market,
        ai_universe_id=ai_universe,
        price_universe_id=price_universe,
        limit=args.limit,
        window_days=args.window_days,
        recent_days=args.recent_days,
    )

    print(f"  Saving tm_sentiment_flip/{args.market} ...")
    store.save_sentiment_flip_list(args.market, payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_sentiment_flip",
        universe_id=price_universe,
        expected_count=int(payload.get("input_count", 0) or payload.get("row_count", 0)),
        success_count=int(payload.get("row_count", 0)),
        error_count=0,
        metadata={
            "ai_universe": ai_universe,
            "price_universe": price_universe,
            "window_days": int(args.window_days),
            "recent_days": int(args.recent_days),
            "limit": int(args.limit),
        },
    )

    elapsed = time.time() - t0
    row_count = payload["row_count"]

    print()
    print(f"{'='*55}")
    print(f"  Done in {elapsed:.1f}s  ·  {row_count} flips written")
    print(f"{'='*55}\n")

    if row_count == 0:
        print("  No qualifying sentiment flips found.")
        print("  Possible reasons: insufficient articles, no direction change,")
        print("  or thresholds need tuning (try --window-days 21 --recent-days 5).")
    else:
        print("  Top 5:")
        for i, row in enumerate(payload["rows"][:5], 1):
            ticker = row.get("ticker", "?")
            direction = row.get("direction", "?")
            conf = row.get("confidence", 0)
            delta = row.get("sentiment_delta", 0)
            print(
                f"    {i:2}. {ticker:<8}  {direction:<22}  "
                f"conf={conf:5.1f}  delta={delta:.2f}"
            )
    print()


if __name__ == "__main__":
    main()
