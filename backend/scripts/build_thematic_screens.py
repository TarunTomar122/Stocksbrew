"""Build pre-built thematic screens for a market and persist to Firestore.

Reads the scored four-pillar intel_pro docs + latest technical docs + latest
price docs for a universe, runs each screen filter/sort, and saves the full
dashboard-ready payload to `tm_thematic_screens/{market}`.
"""
from __future__ import annotations

import argparse

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore
from backend.thematic_screens import build_screens_doc


def main() -> None:
    parser = argparse.ArgumentParser(description="Build dashboard thematic screens")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument(
        "--universe",
        required=True,
        help="Universe to screen — use the broad data-tier (e.g. us_core_100, in_core_150) "
             "so screens pull from the largest population we have intel_pro on.",
    )
    parser.add_argument("--top-n", type=int, default=10, help="Max matches per screen")
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = list_instruments(args.market, args.universe)
    if not instruments:
        raise ValueError(f"No instruments found for {args.market} / {args.universe}")

    instrument_ids = [i["instrument_id"] for i in instruments]
    intel_pro_docs = store.list_stock_intel_pro(args.market, args.universe)
    technical_docs = [
        doc for doc in (
            store.get_latest_stock_technical_doc(iid) for iid in instrument_ids
        ) if doc
    ]
    latest_prices = store.get_latest_prices(instrument_ids)

    doc = build_screens_doc(
        market=args.market,
        universe_id=args.universe,
        instruments=instruments,
        intel_pro_docs=intel_pro_docs,
        technical_docs=technical_docs,
        latest_prices=latest_prices,
        top_n=args.top_n,
    )
    store.save_thematic_screens(args.market, doc)

    screen_stats = ", ".join(f"{s['id']}={s['match_count']}" for s in doc["screens"])
    print(
        f"[screens] {args.market}/{args.universe}: "
        f"{doc['coverage']['intel_pro_docs']} intel_pro, "
        f"{doc['coverage']['technical_docs']} technical docs → {screen_stats}"
    )


if __name__ == "__main__":
    main()
