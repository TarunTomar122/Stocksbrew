"""Fetch latest quote snapshots for a configured instrument universe."""
from __future__ import annotations

import argparse
import json

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.providers.yfinance_provider import YFinanceClient
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Trace Money price snapshots")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_test_5")
    parser.add_argument(
        "--session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default="manual",
    )
    parser.add_argument("--print-json", action="store_true")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active frontend universe")
    parser.add_argument("--max-workers", type=int, default=8, help="Parallel yfinance workers")
    args = parser.parse_args()

    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    client = YFinanceClient(max_workers=args.max_workers)
    raw_quotes = client.fetch_quotes(instruments)

    store = TraceMoneyStore()
    saved_rows = []
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        quote_payload = raw_quotes.get(instrument_id)
        if not quote_payload:
            continue
        snapshot = {
            "instrument_id": instrument_id,
            "market": instrument["market"],
            "ticker": instrument["ticker"],
            "captured_at": quote_payload["captured_at"],
            "session_phase": args.session_phase,
            "source": "yfinance",
            "currency": quote_payload.get("currency") or instrument.get("currency", "USD"),
            "quote": quote_payload["quote"],
            "fundamentals": quote_payload.get("fundamentals", {}),
            "analyst_consensus": quote_payload.get("analyst_consensus", {}),
            "provider_metadata": {
                "yahoo_symbol": quote_payload.get("yahoo_symbol", ""),
                "exchange": quote_payload.get("exchange", instrument.get("exchange", "")),
                "name": quote_payload.get("name", instrument.get("name", "")),
            },
        }
        store.save_price_snapshot(snapshot)
        if snapshot["fundamentals"]:
            store.save_fundamental_snapshot(instrument_id, {
                "instrument_id": instrument_id,
                "market": instrument["market"],
                "ticker": instrument["ticker"],
                "captured_at": quote_payload["captured_at"],
                "source": "yfinance",
                "currency": snapshot["currency"],
                "fundamentals": snapshot["fundamentals"],
                "analyst_consensus": snapshot["analyst_consensus"],
            })
        saved_rows.append(snapshot)

    if args.activate:
        store.save_active_universe(args.market, universe_id)

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": universe_id,
            "count": len(saved_rows),
            "snapshots": saved_rows,
        }, indent=2))
    else:
        print(f"Saved {len(saved_rows)} price snapshots for {args.market} / {universe_id}.")


if __name__ == "__main__":
    main()
