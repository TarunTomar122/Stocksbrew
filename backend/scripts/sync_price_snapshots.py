"""Fetch latest quote snapshots for a configured instrument universe."""
from __future__ import annotations

import argparse
import json

from backend.instrument_universe import list_instruments
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
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active price universe")
    parser.add_argument("--max-workers", type=int, default=8, help="Parallel yfinance workers")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )

    instruments = list_instruments(args.market, universe_id)
    client = YFinanceClient(max_workers=args.max_workers)
    raw_quotes = client.fetch_quotes(instruments)

    # Build a lookup so the shard-row builder can pull sector + name from the
    # instrument definition without a second loop.
    instrument_by_id: dict[str, dict] = {i["instrument_id"]: i for i in instruments}

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
        store.save_active_price_universe(args.market, universe_id)

    # Fan out to the sharded `market_price_snapshots/{market}/shards` view.
    # The dashboard's top-movers row, "on the house" free picks, and the header
    # search index all read from this collection via `getMarketSnapshot` — if
    # we only write `tm_latest_prices/{id}` docs, those surfaces go stale. The
    # frontend expects camelCase fields (`instrumentId`, `symbol`, `price.current`,
    # `price.change`, `price.changePct`, `price.previousClose`), so we reshape
    # the per-instrument snapshots here rather than have the reader do it.
    #
    # `sectorId` is critical — the stock detail page uses it to find all peers
    # in the same sector for the heatmap. We derive it the same way the
    # frontend's `sectorSlug()` does: lowercase + spaces-to-dashes.
    def _sector_id(raw: str) -> str | None:
        if not raw:
            return None
        slug = raw.strip().lower().replace(" ", "-")
        slug = "".join(c for c in slug if c.isalnum() or c == "-")
        slug = "-".join(p for p in slug.split("-") if p)
        return slug or None

    shard_rows = []
    for snap in saved_rows:
        quote = snap.get("quote") or {}
        current = quote.get("current")
        if not isinstance(current, (int, float)):
            continue
        instrument = instrument_by_id.get(snap["instrument_id"]) or {}
        sector_raw = instrument.get("sector") or ""
        shard_rows.append({
            "instrumentId": snap["instrument_id"],
            "market": snap["market"],
            "symbol": snap["ticker"],
            "name": snap.get("provider_metadata", {}).get("name") or instrument.get("name") or snap["ticker"],
            "sectorId": _sector_id(sector_raw),
            "lastUpdated": snap.get("captured_at"),
            "price": {
                "current": current,
                "change": quote.get("day_change_abs"),
                "changePct": quote.get("day_change_pct"),
                "previousClose": quote.get("previous_close"),
                "volume": quote.get("volume"),
            },
        })
    if shard_rows:
        store.save_market_price_snapshot(args.market, shard_rows)

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
