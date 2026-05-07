from __future__ import annotations

import argparse

from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_home_view from existing materialized docs.")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    args = parser.parse_args()

    store = TraceMoneyStore()
    price_universe = store.get_active_price_universe(args.market)
    if not price_universe:
        raise ValueError(f"No active price universe for {args.market}")
    ai_universe = store.get_active_ai_universe(args.market) or price_universe
    dashboard = store.get_dashboard_view(args.market, price_universe)
    if not dashboard:
        raise ValueError(f"No dashboard view for {args.market} / {price_universe}")

    store.save_home_view(args.market, {
        "market": args.market,
        "universe_id": price_universe,
        "ai_universe_id": ai_universe,
        "dashboard": dashboard,
        "market_snapshot_rows": store.get_market_price_snapshot(args.market),
        "thematic_screens": store.get_thematic_screens(args.market),
        "news": store.get_news_home_feed(args.market, ai_universe, limit=30),
    })
    print(f"Backfilled tm_home_view/{args.market}.")


if __name__ == "__main__":
    main()
