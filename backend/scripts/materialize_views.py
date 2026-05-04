"""Materialize low-fidelity dashboard and instrument view docs."""
from __future__ import annotations

import argparse

from backend.instrument_universe import list_instruments
from backend.sector_scraper import sector_tiles_for_market
from backend.storage import TraceMoneyStore
from backend.view_materializer import build_dashboard_view, build_instrument_view


def _history_from_latest(latest_price: dict | None, limit: int = 12) -> list[dict]:
    if not latest_price:
        return []
    window = list(latest_price.get("history_window") or [])
    if limit > 0 and len(window) > limit:
        window = window[-limit:]
    return window


def _assert_namespace_ready(store: TraceMoneyStore, market: str, universe_id: str) -> None:
    stock_docs = store.list_stock_intelligence_docs(market, universe_id)
    sector_docs = store.list_sector_context_docs(market, universe_id)
    if not stock_docs:
        raise ValueError(
            f"No stock intelligence docs found for {market} / {universe_id}. "
            "Run ingest_news -> enrich_articles -> build_stock_intelligence -> build_context_intelligence first."
        )
    if not sector_docs:
        raise ValueError(
            f"Sector context missing for {market} / {universe_id}. "
            "Run build_context_intelligence before materializing views."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize low-fi dashboard and instrument views")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_test_5")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active price/display universe")
    parser.add_argument(
        "--allow-missing-context",
        action="store_true",
        help="Allow materialization even if stock/market/sector context docs are missing.",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )

    instruments = list_instruments(args.market, universe_id)
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]

    latest_prices = store.get_latest_prices(instrument_ids)
    if not latest_prices:
        raise ValueError(f"No latest prices found for {args.market} / {universe_id}")

    # Load the macro-cues universe (indices + commodities) for the top tile
    # strip. Missing is fine — the dashboard degrades to sector-only tiles.
    _macro_universe_map = {"US": "us_macro_cues", "IN": "in_macro_cues"}
    macro_universe_id = _macro_universe_map.get(args.market)
    macro_instruments: list = []
    macro_prices: dict = {}
    macro_history: dict = {}
    if macro_universe_id:
        try:
            macro_instruments = list_instruments(args.market, macro_universe_id)
        except ValueError:
            macro_instruments = []
        if macro_instruments:
            macro_ids = [m["instrument_id"] for m in macro_instruments]
            macro_prices = store.get_latest_prices(macro_ids)
            macro_history = {
                mid: _history_from_latest(macro_prices.get(mid))
                for mid in macro_ids
            }

    # Sector tiles — scraped live from Finviz (sector + industry performance
    # tables) so we don't have to maintain a broad instrument universe or
    # normalize messy GICS/Yahoo taxonomy just to compute day-change averages.
    try:
        scraped_tiles = sector_tiles_for_market(args.market)
    except Exception as exc:
        print(f"[materialize_views] sector scrape failed: {exc}")
        scraped_tiles = []
    sector_tiles_input = [
        {"label": tile.label, "change_pct": tile.change_pct, "source": tile.source}
        for tile in scraped_tiles
    ]

    if not args.allow_missing_context:
        _assert_namespace_ready(store, args.market, universe_id)

    stock_intelligence_docs = {
        doc["instrument_id"]: doc
        for doc in store.list_stock_intelligence_docs(args.market, universe_id)
        if doc.get("instrument_id")
    }
    market_context: dict = {}  # market-level brief now lives in tm_market_brief via sync_market_brief
    sector_context_docs = store.list_sector_context_docs(args.market, universe_id)
    sector_context_by_id = {doc.get("sector_id"): doc for doc in sector_context_docs if doc.get("sector_id")}
    price_history = {
        instrument_id: _history_from_latest(latest_prices.get(instrument_id))
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
        macro_instruments=macro_instruments,
        macro_prices=macro_prices,
        macro_history=macro_history,
        sector_tiles_input=sector_tiles_input,
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
        store.save_active_price_universe(args.market, universe_id)

    print(
        f"Materialized dashboard view {args.market} / {universe_id} and "
        f"{saved_count} instrument views."
    )


if __name__ == "__main__":
    main()
