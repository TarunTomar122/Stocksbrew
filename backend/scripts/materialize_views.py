"""Materialize low-fidelity dashboard and instrument view docs."""
from __future__ import annotations

import argparse

from backend.instrument_universe import list_instruments
from backend.sector_scraper import sector_tiles_for_market
from backend.storage import TraceMoneyStore
from backend.view_materializer import build_dashboard_view, build_instrument_view


def _parse_instrument_ids(value: str | None) -> list[str] | None:
    if not value:
        return None
    ids = [item.strip().upper() for item in value.split(",") if item.strip()]
    return ids or None


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


def _paid_tracked_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            instrument_id = str(raw or "").strip().upper()
            if not instrument_id or not instrument_id.startswith(prefix) or instrument_id in seen:
                continue
            seen.add(instrument_id)
            out.append(instrument_id)
    return out


def materialize_views(
    *,
    market: str,
    universe_id: str,
    instrument_ids: list[str] | None = None,
    activate: bool = False,
    allow_missing_context: bool = False,
    skip_sector_scrape: bool = False,
    skip_dashboard: bool = False,
    store: TraceMoneyStore | None = None,
) -> dict:
    store = store or TraceMoneyStore()
    instruments = list_instruments(market, universe_id)
    all_instrument_ids = [instrument["instrument_id"] for instrument in instruments]
    selected_ids = set(instrument_ids or all_instrument_ids)
    selected_ids = {instrument_id.strip().upper() for instrument_id in selected_ids if instrument_id.strip()}
    selected_instruments = [
        instrument for instrument in instruments
        if str(instrument.get("instrument_id", "")).upper() in selected_ids
    ]

    data_ids = all_instrument_ids if not skip_dashboard else [instrument["instrument_id"] for instrument in selected_instruments]
    latest_prices = store.get_latest_prices(data_ids)
    if not latest_prices:
        raise ValueError(f"No latest prices found for {market} / {universe_id}")

    _macro_universe_map = {"US": "us_macro_cues", "IN": "in_macro_cues"}
    macro_universe_id = _macro_universe_map.get(market)
    macro_instruments: list = []
    macro_prices: dict = {}
    macro_history: dict = {}
    if macro_universe_id:
        try:
            macro_instruments = list_instruments(market, macro_universe_id)
        except ValueError:
            macro_instruments = []
        if macro_instruments:
            macro_ids = [m["instrument_id"] for m in macro_instruments]
            macro_prices = store.get_latest_prices(macro_ids)
            macro_history = {
                mid: _history_from_latest(macro_prices.get(mid))
                for mid in macro_ids
            }

    scraped_tiles = []
    if not skip_sector_scrape:
        try:
            scraped_tiles = sector_tiles_for_market(market)
        except Exception as exc:
            print(f"[materialize_views] sector scrape failed: {exc}")
            scraped_tiles = []
    sector_tiles_input = [
        {"label": tile.label, "change_pct": tile.change_pct, "source": tile.source}
        for tile in scraped_tiles
    ]

    if not allow_missing_context:
        _assert_namespace_ready(store, market, universe_id)

    stock_intelligence_docs = store.get_stock_intelligence_docs_batch(market, universe_id, data_ids)
    market_context: dict = {}
    sector_context_docs = store.list_sector_context_docs(market, universe_id)
    sector_context_by_id = {doc.get("sector_id"): doc for doc in sector_context_docs if doc.get("sector_id")}
    price_history = {instrument_id: _history_from_latest(latest_prices.get(instrument_id)) for instrument_id in data_ids}
    rows_by_id: dict[str, dict] = {}
    dashboard_rows = 0
    if not skip_dashboard:
        dashboard_view = build_dashboard_view(
            market,
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
        store.save_dashboard_view(market, universe_id, dashboard_view)
        try:
            ai_universe = store.get_active_ai_universe(market) or universe_id
            store.save_home_view(market, {
                "market": market,
                "universe_id": universe_id,
                "ai_universe_id": ai_universe,
                "dashboard": dashboard_view,
                "market_snapshot_rows": store.get_market_price_snapshot(market),
                "thematic_screens": store.get_thematic_screens(market),
                "news": store.get_news_home_feed(market, ai_universe, limit=30),
            })
        except Exception as exc:
            print(f"[materialize_views] home view save skipped: {exc}")
        rows_by_id = {row["instrument_id"]: row for row in dashboard_view["watchlist_rows"]}
        dashboard_rows = len(dashboard_view.get("watchlist_rows", []))
    instruments_by_id = {instrument["instrument_id"]: instrument for instrument in instruments}
    instrument_views = []
    for instrument in selected_instruments:
        instrument_id = instrument["instrument_id"]
        latest_price = latest_prices.get(instrument_id)
        if latest_price is None:
            continue
        related_rows = []
        if rows_by_id:
            related_rows = [
                rows_by_id[peer_id]
                for peer_id in instrument.get("peer_ids", [])
                if peer_id in rows_by_id and peer_id in instruments_by_id
            ]
        stock_doc = stock_intelligence_docs.get(instrument_id) or {}
        sector_id = str((stock_doc.get("sector_context") or {}).get("sector_id", "")).strip()
        instrument_views.append(build_instrument_view(
            instrument,
            latest_price,
            related_rows,
            price_history.get(instrument_id, []),
            stock_doc,
            market_context,
            sector_context_by_id.get(sector_id, {}),
        ))
    saved_count = store.save_instrument_views_bulk(universe_id, instrument_views)

    if activate:
        store.save_active_price_universe(market, universe_id)

    return {
        "market": market,
        "universe_id": universe_id,
        "dashboard_rows": dashboard_rows,
        "selected_count": len(selected_instruments),
        "saved_instrument_views": saved_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize low-fi dashboard and instrument views")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_core_155")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active price/display universe")
    parser.add_argument(
        "--allow-missing-context",
        action="store_true",
        help="Allow materialization even if stock/market/sector context docs are missing.",
    )
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids for subset view materialization")
    parser.add_argument("--paid-only", action="store_true", help="Materialize views only for paid users' tracked stocks")
    parser.add_argument("--skip-sector-scrape", action="store_true", help="Skip live sector scrape for fast cohort materialization")
    parser.add_argument("--skip-dashboard", action="store_true", help="Skip dashboard rebuild (materialize selected instrument views only)")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.US_universe (US) or pass --universe."
        )

    explicit_ids = _parse_instrument_ids(args.instrument_ids)
    paid_ids = _paid_tracked_ids(store, args.market) if args.paid_only else None
    selected_ids = explicit_ids if explicit_ids is not None else paid_ids

    result = materialize_views(
        market=args.market,
        universe_id=universe_id,
        instrument_ids=selected_ids,
        activate=args.activate,
        allow_missing_context=args.allow_missing_context,
        skip_sector_scrape=args.skip_sector_scrape,
        skip_dashboard=args.skip_dashboard,
        store=store,
    )

    print(
        f"Materialized dashboard view {args.market} / {universe_id} and "
        f"{result['saved_instrument_views']} instrument views."
    )


if __name__ == "__main__":
    main()
