"""Sync free-source stock facts for detail pages."""
from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from backend.instrument_universe import (
    get_default_universe_id,
    list_instruments,
)
from backend.providers.stock_facts_provider import fetch_stock_facts
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync stock facts")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--pause", type=float, default=0.5)
    parser.add_argument("--max-workers", type=int, default=1)
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    if args.limit > 0:
        instruments = instruments[:args.limit]

    store = TraceMoneyStore()
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
