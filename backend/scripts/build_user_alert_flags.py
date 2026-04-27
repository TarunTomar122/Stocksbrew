"""Build portfolio/watchlist red-flag docs."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.landing_metrics import (
    build_stock_technical_doc,
    build_user_alert_flags,
)
from backend.storage import TraceMoneyStore


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


def _normalize_watchlist(payload: dict[str, Any]) -> list[str]:
    raw = payload.get("instrument_ids") or payload.get("watchlist") or []
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        instrument_id = str(item).strip()
        if instrument_id:
            out.append(instrument_id)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Build user alert flags from watchlists")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id used for fallback watchlist and data fetch")
    parser.add_argument("--as-of-date", default=None, help="Override date (YYYY-MM-DD)")
    parser.add_argument("--history-limit", type=int, default=260)
    parser.add_argument("--user-id", default=None, help="Run for one user only")
    parser.add_argument(
        "--seed-user-if-missing",
        default=None,
        help="Create a watchlist for this user when none exists (for bootstrap/testing)",
    )
    parser.add_argument("--seed-limit", type=int, default=12, help="Instrument count for seeded watchlist")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = _resolve_universe(store, args.market, args.universe)
    as_of_date = args.as_of_date or datetime.now(timezone.utc).date().isoformat()

    if args.user_id:
        existing = store.get_user_watchlist(args.user_id)
        watchlists = [existing] if existing else []
    else:
        watchlists = store.list_user_watchlists(args.market)

    if not watchlists and args.seed_user_if_missing:
        instruments = list_instruments(args.market, universe_id)[:max(1, args.seed_limit)]
        seeded_ids = [instrument["instrument_id"] for instrument in instruments]
        seed_payload = {
            "market": args.market,
            "instrument_ids": seeded_ids,
            "source": "seeded_by_build_user_alert_flags",
        }
        store.save_user_watchlist(args.seed_user_if_missing, seed_payload)
        watchlists = [store.get_user_watchlist(args.seed_user_if_missing)]

    results: dict[str, Any] = {"market": args.market, "users": []}
    for watchlist in watchlists:
        if not watchlist:
            continue
        user_id = str(watchlist.get("user_id", "")).strip()
        if not user_id:
            continue
        instrument_ids = _normalize_watchlist(watchlist)
        if not instrument_ids:
            store.save_user_alert_flags(user_id, [])
            results["users"].append({"user_id": user_id, "alert_count": 0, "flags": []})
            continue

        latest_prices = store.get_latest_prices(instrument_ids)
        technical_docs: dict[str, dict[str, Any]] = {}
        price_histories: dict[str, list[dict[str, Any]]] = {}
        stock_intel: dict[str, dict[str, Any]] = {}
        ai_universe = store.get_active_ai_universe(args.market) or universe_id

        instruments_lookup = {
            item["instrument_id"]: item
            for item in list_instruments(args.market, universe_id)
            if item.get("instrument_id")
        }

        for instrument_id in instrument_ids:
            latest = latest_prices.get(instrument_id)
            if not latest:
                continue
            history = store.get_price_history(instrument_id, limit=max(30, args.history_limit))
            price_histories[instrument_id] = history
            instrument = instruments_lookup.get(instrument_id, {
                "instrument_id": instrument_id,
                "ticker": instrument_id.split("_", 1)[-1],
                "market": args.market,
            })
            technical_docs[instrument_id] = build_stock_technical_doc(
                instrument=instrument,
                latest_price=latest,
                history_points=history,
                as_of_date=as_of_date,
            )
            doc = store.get_stock_intelligence_doc(args.market, ai_universe, instrument_id)
            stock_intel[instrument_id] = doc or {}

        flags = build_user_alert_flags(
            user_id=user_id,
            market=args.market,
            instrument_ids=instrument_ids,
            as_of_date=as_of_date,
            latest_prices=latest_prices,
            stock_intelligence=stock_intel,
            technical_docs=technical_docs,
            price_histories=price_histories,
            thresholds=watchlist.get("thresholds") if isinstance(watchlist, dict) else None,
        )
        store.save_user_alert_flags(user_id, flags)
        results["users"].append({
            "user_id": user_id,
            "alert_count": len([row for row in flags if row.get("status") == "alert"]),
            "instrument_count": len(instrument_ids),
            "flags": flags,
        })

    if args.print_json:
        print(json.dumps(results, indent=2))
    else:
        user_count = len(results["users"])
        alert_docs = sum(len(item.get("flags", [])) for item in results["users"])
        print(f"Saved user alert flags for {user_count} users ({alert_docs} docs total) in {args.market}.")


if __name__ == "__main__":
    main()
