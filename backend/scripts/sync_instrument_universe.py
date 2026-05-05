"""Sync configured instruments into Firestore."""
from __future__ import annotations

import argparse
import json

from backend.instrument_universe import (
    list_instruments,
    list_universes_for_market,
    load_instrument_catalog,
)
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Trace Money instrument universe into Firestore")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_core_155")
    parser.add_argument("--print-json", action="store_true")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active price universe")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Pass --universe when bootstrapping a new market."
        )

    instruments = list_instruments(args.market, universe_id)
    manifest = load_instrument_catalog()

    store.save_instrument_universe_manifest({
        "version": manifest.get("version"),
        "markets": {
            args.market: {
                "universes": list(list_universes_for_market(args.market).keys()),
            }
        },
    })
    store.save_instruments(args.market, universe_id, instruments)
    if args.activate:
        store.save_active_price_universe(args.market, universe_id)

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": universe_id,
            "instrument_count": len(instruments),
            "instruments": instruments,
        }, indent=2))
    else:
        print(f"Synced {len(instruments)} instruments for {args.market} / {universe_id}.")


if __name__ == "__main__":
    main()
