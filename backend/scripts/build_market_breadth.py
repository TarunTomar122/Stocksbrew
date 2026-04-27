"""Build market breadth dataset for landing experience."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.landing_metrics import build_market_breadth_doc, build_stock_technical_doc
from backend.storage import TraceMoneyStore


def _history_from_latest(latest_price: dict | None, limit: int) -> list[dict]:
    if not latest_price:
        return []
    window = list(latest_price.get("history_window") or [])
    if limit > 0 and len(window) > limit:
        window = window[-limit:]
    return window


def _resolve_universe(store: TraceMoneyStore, market: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    active = store.get_active_price_universe(market)
    if active:
        return active
    fallback = get_default_universe_id(market)
    if fallback:
        return fallback
    raise ValueError(f"No universe configured for {market}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build market breadth metrics")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (defaults to active price universe)")
    parser.add_argument("--history-limit", type=int, default=260)
    parser.add_argument("--as-of-date", default=None, help="Override date (YYYY-MM-DD)")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = _resolve_universe(store, args.market, args.universe)
    instruments = list_instruments(args.market, universe_id)
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]
    latest_prices = store.get_latest_prices(instrument_ids)
    as_of_date = args.as_of_date or datetime.now(timezone.utc).date().isoformat()

    technical_docs: dict[str, dict] = {}
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        latest_price = latest_prices.get(instrument_id)
        if not latest_price:
            continue
        history = _history_from_latest(latest_price, limit=max(30, args.history_limit))
        technical_docs[instrument_id] = build_stock_technical_doc(
            instrument=instrument,
            latest_price=latest_price,
            history_points=history,
            as_of_date=as_of_date,
        )

    breadth_doc = build_market_breadth_doc(
        market=args.market,
        universe_id=universe_id,
        as_of_date=as_of_date,
        latest_prices={key: value for key, value in latest_prices.items() if key in technical_docs},
        technical_docs=technical_docs,
    )
    store.save_market_breadth_doc(args.market, as_of_date, breadth_doc)

    if args.print_json:
        print(json.dumps(breadth_doc, indent=2))
    else:
        print(f"Saved market breadth for {args.market} / {universe_id} ({as_of_date}).")


if __name__ == "__main__":
    main()
