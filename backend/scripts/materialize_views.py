"""Materialize low-fidelity dashboard and instrument view docs."""
from __future__ import annotations

import argparse

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.storage import TraceMoneyStore
from backend.view_materializer import build_dashboard_view, build_instrument_view


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize low-fi dashboard and instrument views")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_test_5")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active frontend universe")
    args = parser.parse_args()

    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]

    store = TraceMoneyStore()
    latest_prices = store.get_latest_prices(instrument_ids)
    if not latest_prices:
        raise ValueError(f"No latest prices found for {args.market} / {universe_id}")

    stock_intelligence_docs = {
        doc["instrument_id"]: doc
        for doc in store.list_stock_intelligence_docs(args.market, universe_id)
        if doc.get("instrument_id")
    }
    market_context = store.get_market_context_doc(args.market, universe_id) or {}
    sector_context_docs = store.list_sector_context_docs(args.market, universe_id)
    sector_context_by_id = {doc.get("sector_id"): doc for doc in sector_context_docs if doc.get("sector_id")}
    price_history = {
        instrument_id: store.get_price_history(instrument_id)
        for instrument_id in instrument_ids
    }

    dashboard_view = build_dashboard_view(
        args.market,
        universe_id,
        instruments,
        latest_prices,
        price_history,
        stock_intelligence_docs,
        market_context,
        sector_context_docs,
    )
    store.save_dashboard_view(args.market, universe_id, dashboard_view)

    rows_by_id = {row["instrument_id"]: row for row in dashboard_view["watchlist_rows"]}
    instruments_by_id = {instrument["instrument_id"]: instrument for instrument in instruments}
    saved_count = 0
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        latest_price = latest_prices.get(instrument_id)
        if latest_price is None:
            continue
        related_rows = [
            rows_by_id[peer_id]
            for peer_id in instrument.get("peer_ids", [])
            if peer_id in rows_by_id and peer_id in instruments_by_id
        ]
        stock_doc = stock_intelligence_docs.get(instrument_id) or {}
        sector_id = str((stock_doc.get("sector_context") or {}).get("sector_id", "")).strip()
        instrument_view = build_instrument_view(
            instrument,
            latest_price,
            related_rows,
            price_history.get(instrument_id, []),
            stock_doc,
            market_context,
            sector_context_by_id.get(sector_id, {}),
        )
        store.save_instrument_view(instrument_id, universe_id, instrument_view)
        saved_count += 1

    if args.activate:
        store.save_active_universe(args.market, universe_id)

    print(
        f"Materialized dashboard view {args.market} / {universe_id} and "
        f"{saved_count} instrument views."
    )


if __name__ == "__main__":
    main()
