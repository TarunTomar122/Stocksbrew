"""Lightweight price refresh — updates ONLY the price fields in the stocks/ collection.

No LLM calls, no intelligence, no news. Just fresh prices from yfinance.
Designed to run frequently (e.g. every 15 min during market hours) so the
frontend never shows stale quotes.

Usage:
    python -m backend.scripts.refresh_prices --market US
    python -m backend.scripts.refresh_prices --market IN
    python -m backend.scripts.refresh_prices --market US --market IN
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.providers.yfinance_provider import YFinanceClient
from backend.storage import TraceMoneyStore


def _to_float(val: Any) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def refresh_prices(market: str, universe_id: str | None = None, max_workers: int = 8) -> int:
    """Fetch fresh quotes and patch the price subfield in each stocks/ doc.

    Returns the number of stocks updated.
    """
    uid = universe_id or get_default_universe_id(market)
    if not uid:
        raise ValueError(f"No universe configured for {market}")

    instruments = list_instruments(market, uid)
    client = YFinanceClient(max_workers=max_workers)
    raw_quotes = client.fetch_quotes(instruments)

    store = TraceMoneyStore()
    updated = 0
    now = datetime.now(timezone.utc).isoformat()

    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        quote_payload = raw_quotes.get(instrument_id)
        if not quote_payload:
            print(f"  ⚠ No quote for {instrument_id}, skipping")
            continue

        quote = quote_payload.get("quote", {})
        current = _to_float(quote.get("current"))
        if current <= 0:
            print(f"  ⚠ Invalid price for {instrument_id}: {current}, skipping")
            continue

        price_patch = {
            "price.current": round(current, 2),
            "price.open": round(_to_float(quote.get("open")), 2),
            "price.high": round(_to_float(quote.get("high")), 2),
            "price.low": round(_to_float(quote.get("low")), 2),
            "price.previousClose": round(_to_float(quote.get("previous_close")), 2),
            "price.change": round(_to_float(quote.get("day_change_abs")), 2),
            "price.changePct": round(_to_float(quote.get("day_change_pct")), 2),
            "price.volume": round(_to_float(quote.get("volume"))),
            "lastUpdated": now,
        }

        doc_ref = store.db.collection("stocks").document(instrument_id)
        doc = doc_ref.get()
        if not doc.exists:
            print(f"  ⚠ No stocks/ doc for {instrument_id}, skipping (run bootstrap first)")
            continue

        doc_ref.update(price_patch)
        symbol = instrument.get("ticker", instrument_id)
        prev = _to_float(quote.get("previous_close"))
        pct = _to_float(quote.get("day_change_pct"))
        print(f"  ✓ {symbol:>12s}  {current:>10.2f}  ({pct:+.2f}%)  prev {prev:.2f}")
        updated += 1

    # Also save to tm_latest_prices so the next bootstrap picks up fresh data
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
            "session_phase": "price_refresh",
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

    # Update the lastRun timestamp so the frontend shows "Updated {time}"
    market_key = market.upper()
    run_status = {
        "type": "price_refresh",
        "startedAt": now,
        "completedAt": now,
        "stocksUpdated": updated,
        "sectorsUpdated": 0,
        "marketsUpdated": 0,
        "errors": [],
    }
    store.db.collection("meta").document("lastRun").set({
        market_key: {
            "price_refresh": run_status,
            "latest": run_status,
        },
        "updatedAtServer": now,
    }, merge=True)

    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh stock prices without running full pipeline")
    parser.add_argument(
        "--market",
        action="append",
        choices=["US", "IN"],
        required=True,
        help="Market(s) to refresh. Can pass multiple: --market US --market IN",
    )
    parser.add_argument("--universe", default=None, help="Override universe id")
    parser.add_argument("--max-workers", type=int, default=8)
    args = parser.parse_args()

    total = 0
    for market in args.market:
        print(f"\n{'='*50}")
        print(f"Refreshing prices for {market}...")
        print(f"{'='*50}")
        count = refresh_prices(market, args.universe, args.max_workers)
        total += count
        print(f"\nUpdated {count} stocks for {market}.")

    print(f"\n{'='*50}")
    print(f"Done. {total} stocks refreshed across {len(args.market)} market(s).")


if __name__ == "__main__":
    main()
