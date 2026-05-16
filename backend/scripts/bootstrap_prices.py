"""Bootstrap Firestore stock documents and fetch initial prices for the full universe.

This creates minimal stock docs for every stock in the instrument universe
(without running the expensive LLM / news pipeline), then fetches live prices.
Run this once after expanding the universe to make all stocks discoverable.

Usage:
    python -m backend.scripts.bootstrap_prices --market US --universe us_core_155
    python -m backend.scripts.bootstrap_prices --market IN --universe in_core_150
    python -m backend.scripts.bootstrap_prices --market US --universe us_core_155 --market IN --universe in_core_150
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import yfinance as yf

from backend.instrument_universe import get_market_catalog, list_instruments, refresh_instrument_catalog
from backend.storage import TraceMoneyStore


def _to_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _yahoo_suffix(market: str) -> str:
    return ".NS" if market == "IN" else ""


def _fetch_quote(instrument: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
    ticker_str = instrument["ticker"] + _yahoo_suffix(instrument["market"])
    try:
        t = yf.Ticker(ticker_str)
        info = t.info or {}
        price = _to_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev = _to_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        if price <= 0:
            fast = t.fast_info
            price = _to_float(getattr(fast, "last_price", 0))
            prev = _to_float(getattr(fast, "previous_close", 0))
        if price <= 0:
            return instrument["instrument_id"], None
        change = round(price - prev, 4)
        change_pct = round((change / prev * 100) if prev > 0 else 0.0, 4)
        return instrument["instrument_id"], {
            "current": round(price, 4),
            "previousClose": round(prev, 4),
            "change": change,
            "changePct": change_pct,
            "open": _to_float(info.get("open") or info.get("regularMarketOpen")),
            "high": _to_float(info.get("dayHigh") or info.get("regularMarketDayHigh")),
            "low": _to_float(info.get("dayLow") or info.get("regularMarketDayLow")),
            "volume": _to_float(info.get("volume") or info.get("regularMarketVolume")),
            "marketCap": _to_float(info.get("marketCap")),
            "pe": _to_float(info.get("trailingPE")),
            "eps": _to_float(info.get("trailingEps")),
            "fiftyTwoWeekHigh": _to_float(info.get("fiftyTwoWeekHigh")),
            "fiftyTwoWeekLow": _to_float(info.get("fiftyTwoWeekLow")),
            "name": info.get("longName") or info.get("shortName") or instrument.get("name", ""),
        }
    except Exception as exc:
        print(f"  ✗ {instrument['ticker']}: {exc}")
        return instrument["instrument_id"], None


def bootstrap_market(
    market: str,
    universe_id: str,
    max_workers: int = 10,
    skip_existing: bool = True,
) -> None:
    print(f"\n{'='*55}")
    print(f"Bootstrapping {market} - universe: {universe_id}")
    print(f"{'='*55}")

    instruments = list_instruments(market, universe_id)
    store = TraceMoneyStore()
    now = datetime.now(timezone.utc).isoformat()

    # Determine which docs already exist
    existing: set[str] = set()
    if skip_existing:
        all_docs = store.db.collection("stocks").where("market", "==", market).stream()
        existing = {doc.id for doc in all_docs}
        print(f"  {len(existing)} existing docs found; skipping those with price.current > 0")

    to_fetch: list[dict[str, Any]] = []
    for inst in instruments:
        iid = inst["instrument_id"]
        if skip_existing and iid in existing:
            # Check if it already has a usable price
            doc = store.db.collection("stocks").document(iid).get()
            if doc.exists:
                data = doc.to_dict() or {}
                price_obj = data.get("price", {})
                if _to_float(price_obj.get("current")) > 0:
                    continue
        to_fetch.append(inst)

    print(f"  Fetching prices for {len(to_fetch)} stocks (skipping {len(instruments) - len(to_fetch)} already priced)...")

    results: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_quote, inst): inst for inst in to_fetch}
        for future in as_completed(futures):
            iid, quote = future.result()
            if quote:
                results[iid] = quote

    print(f"  Got prices for {len(results)} / {len(to_fetch)} stocks")

    # Upsert Firestore docs
    inst_map = {inst["instrument_id"]: inst for inst in instruments}
    ok = 0
    fail = 0
    for iid, quote in results.items():
        inst = inst_map.get(iid, {})
        ticker = inst.get("ticker", iid.split("_", 1)[-1])
        doc_ref = store.db.collection("stocks").document(iid)
        sector_field = inst.get("sector", "Other").lower().replace(" ", "_").replace("&", "and")

        payload: dict[str, Any] = {
            "market": market,
            "ticker": ticker,
            "name": quote.pop("name", inst.get("name", ticker)),
            "sector": inst.get("sector", ""),
            "sectorSlug": sector_field,
            "exchange": inst.get("exchange", ""),
            "currency": inst.get("currency", "USD"),
            "price": {
                "current": quote["current"],
                "previousClose": quote["previousClose"],
                "change": quote["change"],
                "changePct": quote["changePct"],
                "open": quote["open"],
                "high": quote["high"],
                "low": quote["low"],
                "volume": quote["volume"],
            },
            "fundamentals": {
                "marketCap": quote.get("marketCap", 0),
                "pe": quote.get("pe", 0),
                "eps": quote.get("eps", 0),
                "fiftyTwoWeekHigh": quote.get("fiftyTwoWeekHigh", 0),
                "fiftyTwoWeekLow": quote.get("fiftyTwoWeekLow", 0),
            },
            "sentiment": {},
            "technicals": {},
            "analystConsensus": {},
            "news": [],
            "lastUpdated": now,
            "bootstrappedAt": now,
        }

        try:
            doc_ref.set(payload, merge=True)
            pct = quote.get("changePct", 0)
            print(f"  ✓ {ticker:>14s}  {quote['current']:>10.2f}  ({pct:+.2f}%)")
            ok += 1
        except Exception as exc:
            print(f"  ✗ {ticker}: Firestore write failed - {exc}")
            fail += 1

    print(f"\n  Done: {ok} upserted, {fail} failed, {len(to_fetch) - len(results)} no-quote")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap stock docs + fetch initial prices")
    parser.add_argument("--market", action="append", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", action="append", default=None,
                        help="Universe id(s) matching the markets in order. "
                             "Defaults: us_core_155 for US, in_core_150 for IN.")
    parser.add_argument("--max-workers", type=int, default=10)
    parser.add_argument("--no-skip-existing", action="store_true",
                        help="Re-fetch prices even for stocks that already have them")
    args = parser.parse_args()

    default_universes = {"US": "us_core_155", "IN": "in_core_150"}
    universes = args.universe or []

    for i, market in enumerate(args.market):
        uid = universes[i] if i < len(universes) else default_universes.get(market, "")
        bootstrap_market(
            market=market,
            universe_id=uid,
            max_workers=args.max_workers,
            skip_existing=not args.no_skip_existing,
        )
        refresh_instrument_catalog()

    print("\nAll done. Run seed_tikrr_meta.py to refresh meta/stocks and meta/tikrrEvalUniverse.")


if __name__ == "__main__":
    main()
