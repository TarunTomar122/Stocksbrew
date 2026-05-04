"""Build daily fear/greed-style sentiment gauge from market breadth."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from backend.landing_metrics import build_sentiment_gauge_doc
from backend.storage import TraceMoneyStore


def _resolve_universe(store: TraceMoneyStore, market: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    active = store.get_active_price_universe(market)
    if active:
        return active
    raise ValueError(
        f"No active price universe configured for {market}. "
        "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build sentiment gauge")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (defaults to active price universe)")
    parser.add_argument("--as-of-date", default=None, help="Override date (YYYY-MM-DD)")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    as_of_date = args.as_of_date or datetime.now(timezone.utc).date().isoformat()
    universe_id = _resolve_universe(store, args.market, args.universe)

    breadth_doc = store.get_market_breadth_doc(args.market, as_of_date)
    if not breadth_doc:
        raise ValueError(
            f"No breadth doc for {args.market} {as_of_date}. "
            "Run build_market_breadth first."
        )

    payload = build_sentiment_gauge_doc(
        market=args.market,
        universe_id=universe_id,
        as_of_date=as_of_date,
        breadth_doc=breadth_doc,
    )
    store.save_sentiment_gauge_doc(args.market, as_of_date, payload)

    if args.print_json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"Saved sentiment gauge for {args.market} / {universe_id} ({as_of_date}).")


if __name__ == "__main__":
    main()
