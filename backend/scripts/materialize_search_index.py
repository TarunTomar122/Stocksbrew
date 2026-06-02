from __future__ import annotations

import argparse

from backend.storage import TraceMoneyStore


def _build_entry(instrument: dict, latest_price: dict | None) -> dict:
    quote = (latest_price or {}).get("quote") or {}
    return {
        "instrument_id": str(instrument.get("instrument_id") or "").upper(),
        "ticker": str(instrument.get("ticker") or "").upper(),
        "name": str(instrument.get("name") or instrument.get("ticker") or "").strip(),
        "exchange": str(instrument.get("exchange") or "").strip(),
        "price": quote.get("current"),
        "day_change_pct": quote.get("day_change_pct"),
        "updated_at": (latest_price or {}).get("updated_at"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_search_index from tm_instruments + tm_latest_prices.")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--active-only", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = store.list_instruments(args.market)
    if args.active_only:
        instruments = [row for row in instruments if str(row.get("status") or "active").lower() == "active"]
    instrument_ids = [str(row.get("instrument_id") or "").upper() for row in instruments if row.get("instrument_id")]
    latest_prices = store.get_latest_prices(instrument_ids) if instrument_ids else {}
    entries = [_build_entry(instrument, latest_prices.get(str(instrument.get("instrument_id") or "").upper())) for instrument in instruments]
    store.replace_search_index(args.market, entries)
    print({"market": args.market, "entries": len(entries)})


if __name__ == "__main__":
    main()
