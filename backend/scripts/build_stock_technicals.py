"""Build lightweight stock technical docs for the landing experience.

RSI (and a few other technicals) are scraped directly from Finviz at build
time — no rolling price history needed. SMA distances and trend signals
still fall back to whatever `tm_latest_prices.history_window` has, plus
Yahoo's pre-computed 50D/200D averages.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.landing_metrics import build_stock_technical_doc
from backend.providers.finviz_provider import fetch_finviz_technicals_batch
from backend.storage import TraceMoneyStore


def _history_from_latest(latest_price: dict | None, limit: int) -> list[dict]:
    if not latest_price:
        return []
    window = list(latest_price.get("history_window") or [])
    if limit > 0 and len(window) > limit:
        window = window[-limit:]
    return window


def _resolve_universe(store: TraceMoneyStore, market: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    active = store.get_active_price_universe(market)
    if active:
        return active
    raise ValueError(
        f"No active price universe configured for {market}. "
        "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
    )


def _apply_finviz_rsi(
    doc: dict[str, Any],
    finviz: dict[str, Any] | None,
) -> dict[str, Any]:
    """Override the RSI block with Finviz's pre-computed value when present.

    Leaves the rest of the doc (SMAs, distances, etc.) untouched. Falls
    silently back to whatever build_stock_technical_doc computed from
    history_window when Finviz can't be reached or returns null.
    """
    if not finviz or finviz.get("error"):
        return doc
    rsi = finviz.get("rsi_14") or {}
    if rsi.get("value") is None:
        return doc
    doc["rsi_14"] = rsi
    doc["source"] = "finviz.com (rsi) + tm_latest_prices.history_window (smas)"
    return doc


def main() -> None:
    parser = argparse.ArgumentParser(description="Build stock-level lightweight technical docs")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (defaults to active price universe)")
    parser.add_argument("--history-limit", type=int, default=260, help="Max snapshot points per instrument")
    parser.add_argument("--as-of-date", default=None, help="Override as_of date (YYYY-MM-DD)")
    parser.add_argument(
        "--no-finviz",
        action="store_true",
        help="Skip the Finviz RSI scrape (use only history_window data)",
    )
    parser.add_argument(
        "--finviz-workers",
        type=int,
        default=3,
        help="Concurrent HTTP workers for Finviz scrape (Finviz 429s aggressive bursts; 3 is the sweet spot)",
    )
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = _resolve_universe(store, args.market, args.universe)
    instruments = list_instruments(args.market, universe_id)
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]
    latest_prices = store.get_latest_prices(instrument_ids)

    # Finviz only covers US-listed tickers; skip the scrape for IN.
    finviz_map: dict[str, dict[str, Any]] = {}
    if not args.no_finviz and args.market == "US":
        tickers = [inst["ticker"] for inst in instruments if inst.get("ticker")]
        print(f"Scraping RSI from Finviz for {len(tickers)} tickers ...")
        finviz_map = fetch_finviz_technicals_batch(tickers, max_workers=args.finviz_workers)
        ok = sum(1 for v in finviz_map.values() if (v.get("rsi_14") or {}).get("value") is not None)
        fail = len(finviz_map) - ok
        print(f"  Finviz RSI resolved: {ok}/{len(tickers)}{f' ({fail} failed)' if fail else ''}")

    as_of_date = args.as_of_date or datetime.now(timezone.utc).date().isoformat()
    docs_payload = []
    rsi_ok = 0
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        latest_price = latest_prices.get(instrument_id)
        if not latest_price:
            continue
        history = _history_from_latest(latest_price, limit=max(30, args.history_limit))
        doc = build_stock_technical_doc(
            instrument=instrument,
            latest_price=latest_price,
            history_points=history,
            as_of_date=as_of_date,
        )

        # Override RSI with Finviz's pre-computed value when available.
        ticker = str(instrument.get("ticker", "")).upper()
        doc = _apply_finviz_rsi(doc, finviz_map.get(ticker))

        if (doc.get("rsi_14") or {}).get("value") is not None:
            rsi_ok += 1
        docs_payload.append(doc)

    store.save_stock_technical_docs(docs_payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_stock_technicals",
        universe_id=universe_id,
        expected_count=len(instruments),
        success_count=len(docs_payload),
        error_count=max(0, len(instruments) - len(docs_payload)),
        metadata={
            "as_of_date": as_of_date,
            "history_limit": int(args.history_limit),
            "finviz_enabled": bool(not args.no_finviz and args.market == "US"),
            "rsi_resolved": rsi_ok,
        },
    )

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": universe_id,
            "as_of_date": as_of_date,
            "count": len(docs_payload),
            "docs": docs_payload,
        }, indent=2))
    else:
        print(
            f"Saved {len(docs_payload)} stock technical docs for {args.market} / {universe_id} "
            f"({as_of_date}). RSI resolved: {rsi_ok}/{len(docs_payload)}."
        )


if __name__ == "__main__":
    main()
