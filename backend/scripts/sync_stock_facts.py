"""Sync free-source stock facts for detail pages."""
from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from typing import Any

from backend.instrument_universe import (
    list_instruments,
)
from backend.providers.stock_facts_provider import fetch_stock_facts
from backend.storage import TraceMoneyStore


def _parse_instrument_ids(value: str | None) -> set[str] | None:
    if not value:
        return None
    ids = {item.strip().upper() for item in value.split(",") if item.strip()}
    return ids or None


def _resolve_instruments(
    store: TraceMoneyStore,
    market: str,
    universe_id: str,
    allowed_ids: set[str] | None,
) -> list[dict[str, Any]]:
    if not allowed_ids:
        return list_instruments(market, universe_id)
    market_catalog = list_instruments(market, None)
    by_id = {
        str(instrument.get("instrument_id", "")).upper(): instrument
        for instrument in market_catalog
    }
    resolved = [
        by_id[instrument_id]
        for instrument_id in sorted(allowed_ids)
        if instrument_id in by_id
    ]
    missing = [instrument_id for instrument_id in sorted(allowed_ids) if instrument_id not in by_id]
    if missing:
        refs = [store.db.collection("tm_instruments").document(instrument_id) for instrument_id in missing]
        for doc in store.db.get_all(refs):
            if not doc.exists:
                continue
            row = doc.to_dict() or {}
            if str(row.get("market") or "").upper() != market.upper():
                continue
            resolved.append(row)
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync stock facts")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--pause", type=float, default=0.5)
    parser.add_argument("--max-workers", type=int, default=1)
    parser.add_argument(
        "--include-price-core-overrides",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include tm_config/price_core_overrides tickers in addition to the base universe",
    )
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids for subset sync")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )

    allowed_ids = _parse_instrument_ids(args.instrument_ids)
    instruments = _resolve_instruments(store, args.market, universe_id, allowed_ids)
    if allowed_ids is None and args.include_price_core_overrides:
        all_instruments = list_instruments(args.market, None)
        by_id = {
            str(instrument.get("instrument_id") or "").upper(): instrument
            for instrument in all_instruments
            if str(instrument.get("instrument_id") or "").strip()
        }
        seen = {
            str(instrument.get("instrument_id") or "").upper()
            for instrument in instruments
            if str(instrument.get("instrument_id") or "").strip()
        }
        added = 0
        for instrument_id in store.get_price_core_overrides(args.market):
            key = str(instrument_id or "").strip().upper()
            if not key or key in seen:
                continue
            instrument = by_id.get(key)
            if not instrument:
                continue
            instruments.append(instrument)
            seen.add(key)
            added += 1
        if added > 0:
            print(f"Included {added} price-core override instruments for {args.market}.")
    if args.limit > 0:
        instruments = instruments[:args.limit]
    docs: list[dict] = []

    def fetch_one(instrument: dict) -> tuple[dict, dict | None, Exception | None]:
        try:
            return instrument, fetch_stock_facts(instrument), None
        except Exception as exc:
            return instrument, None, exc

    max_workers = max(1, args.max_workers)
    if max_workers == 1:
        work_items = []
        for instrument in instruments:
            work_items.append(fetch_one(instrument))
            if args.pause > 0 and len(work_items) < len(instruments):
                time.sleep(args.pause)
    else:
        work_items = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            for instrument in instruments:
                futures.append(executor.submit(fetch_one, instrument))
                if args.pause > 0:
                    time.sleep(args.pause)
            for future in as_completed(futures):
                work_items.append(future.result())

    for index, (instrument, doc, exc) in enumerate(work_items, start=1):
        ticker = instrument.get("ticker", "")
        if exc:
            print(f"  [fail] {ticker}: {exc}")
            continue
        if not doc:
            print(f"  [fail] {ticker}: empty facts doc")
            continue
        try:
            store.save_stock_facts(doc)
        except Exception as exc:
            print(f"  [fail] {ticker}: {exc}")
            continue
        docs.append(doc)
        errors = doc.get("source_status", {}).get("errors") or []
        suffix = f" ({len(errors)} source errors)" if errors else ""
        print(f"  [ok] {ticker} {index}/{len(instruments)}{suffix}")

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": universe_id,
            "count": len(docs),
            "docs": docs,
        }, indent=2))
    else:
        print(
            f"Saved {len(docs)} stock facts "
            f"for {args.market} / {universe_id}."
        )


if __name__ == "__main__":
    main()
