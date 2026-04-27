"""Scrape per-ticker fundamentals and write daily snapshots to Firestore.

Writes to `tm_stock_metrics_history/{instrument_id}/snapshots/{YYYY-MM-DD}`.
US routes through Finviz + Zacks; IN routes through Screener + Tickertape.
Downstream scoring reads the latest snapshot plus the previous one to compute
delta catalysts (short spike, insider flow, target/rank revisions).
"""
from __future__ import annotations

import argparse
import re
import time
from datetime import datetime, timezone
from typing import Any

from backend.fundamentals_scraper import fetch_finviz_quotes, fetch_zacks_quote
from backend.instrument_universe import get_default_universe_id, list_instruments
from backend.providers.yfinance_provider import fetch_yfinance_scorecard_metrics
from backend.screener_scraper import fetch_screener_quote
from backend.storage import TraceMoneyStore
from backend.tickertape_scraper import fetch_tickertape_quote


def _sync_us(args: argparse.Namespace) -> None:
    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    tickers = [inst["ticker"] for inst in instruments]
    ticker_to_instrument = {inst["ticker"]: inst for inst in instruments}

    snapshot_date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    captured_at = datetime.now(timezone.utc).isoformat()

    print(f"Fetching Finviz fundamentals for {len(tickers)} tickers (pause={args.pause}s)...")
    quotes = fetch_finviz_quotes(tickers, pause_seconds=args.pause)

    store = TraceMoneyStore()
    saved = 0
    for ticker, quote in quotes.items():
        instrument = ticker_to_instrument.get(ticker)
        if instrument is None:
            continue
        if not quote.metrics:
            print(f"  [skip] {ticker}: no metrics parsed")
            continue

        zacks_fields: dict[str, float] = {}
        zacks_meta: dict[str, str] = {}
        try:
            zq = fetch_zacks_quote(ticker)
            time.sleep(args.pause)
            if zq.rank is not None:
                zacks_fields["zacks_rank"] = float(zq.rank)
                zacks_meta["zacks_rank_label"] = zq.rank_label
            if zq.earnings_esp is not None:
                zacks_fields["zacks_esp"] = zq.earnings_esp
            for key, letter in (
                ("style_value", zq.style_value), ("style_growth", zq.style_growth),
                ("style_momentum", zq.style_momentum), ("style_vgm", zq.style_vgm),
            ):
                if letter:
                    zacks_meta[key] = letter
        except Exception as exc:
            print(f"  [zacks fail] {ticker}: {exc}")

        merged_metrics = {**quote.metrics, **zacks_fields}
        payload = {
            "instrument_id": instrument["instrument_id"],
            "ticker": ticker,
            "market": args.market,
            "universe_id": universe_id,
            "snapshot_date": snapshot_date,
            "captured_at": captured_at,
            "sector_slug": quote.sector_slug,
            "sector_label": quote.sector_label,
            "industry_slug": quote.industry_slug,
            "industry_label": quote.industry_label,
            "earnings_date": quote.earnings_date,
            "metrics": merged_metrics,
            "zacks_meta": zacks_meta,
            "source": "finviz+zacks",
        }
        store.save_stock_metrics_snapshot(instrument["instrument_id"], snapshot_date, payload)
        saved += 1

    print(f"Saved {saved}/{len(tickers)} snapshots for {args.market} / {universe_id} / {snapshot_date}")


def _sync_in(args: argparse.Namespace) -> None:
    universe_id = args.universe or get_default_universe_id(args.market)
    if not universe_id:
        raise ValueError(f"No universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    snapshot_date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    captured_at = datetime.now(timezone.utc).isoformat()

    store = TraceMoneyStore()
    saved = 0
    print(f"Fetching Screener + Tickertape fundamentals for {len(instruments)} IN tickers (pause={args.pause}s)...")
    for i, instrument in enumerate(instruments):
        ticker = instrument["ticker"]
        try:
            screener = fetch_screener_quote(ticker)
        except Exception as exc:
            print(f"  [screener fail] {ticker}: {exc}")
            screener = None
        time.sleep(args.pause)

        try:
            tickertape = fetch_tickertape_quote(ticker)
        except Exception as exc:
            print(f"  [tickertape fail] {ticker}: {exc}")
            tickertape = None
        if i < len(instruments) - 1:
            time.sleep(args.pause)

        merged: dict[str, float] = {}
        if screener:
            merged.update(screener.metrics)
        if tickertape:
            for k, v in tickertape.metrics.items():
                merged.setdefault(k, v)  # Screener wins on conflicts (more accurate PE from consolidated)

        # Yahoo fallback for fields IN-native sources don't publish: forward
        # P/E, PEG, analyst mean target, and an analyst buy % derived from
        # Yahoo's recommendationMean. Only fills gaps — never overwrites a
        # value Screener/Tickertape already produced.
        try:
            yahoo_metrics = fetch_yfinance_scorecard_metrics(ticker, "IN")
        except Exception as exc:
            print(f"  [yfinance fail] {ticker}: {exc}")
            yahoo_metrics = {}
        for k, v in yahoo_metrics.items():
            merged.setdefault(k, v)

        if not merged:
            print(f"  [skip] {ticker}: no metrics parsed from either source")
            continue

        # Prefer Tickertape's sector_label because it's more consumer-readable
        # ("Oil & Gas - Refining & Marketing" vs Screener's "Energy"); fall back
        # to Screener when Tickertape is absent.
        sector_label = (tickertape.sector_label if tickertape else "") or (screener.sector_label if screener else "")
        industry_label = (tickertape.industry_label if tickertape else "") or (screener.industry_label if screener else "")
        # Slug must match how sync_sector_benchmarks saved IN benchmarks (which
        # also slugifies the Tickertape label), so derive from the same label.
        sector_slug = _slug(sector_label) if sector_label else (screener.sector_slug if screener else "")
        industry_slug = _slug(industry_label) if industry_label else (screener.industry_slug if screener else "")

        meta: dict[str, Any] = {}
        if tickertape and tickertape.scorecard_tags:
            meta["tickertape_tags"] = tickertape.scorecard_tags
        if tickertape and tickertape.peers:
            meta["peers"] = tickertape.peers

        payload = {
            "instrument_id": instrument["instrument_id"],
            "ticker": ticker,
            "market": args.market,
            "universe_id": universe_id,
            "snapshot_date": snapshot_date,
            "captured_at": captured_at,
            "sector_slug": sector_slug,
            "sector_label": sector_label,
            "industry_slug": industry_slug,
            "industry_label": industry_label,
            "earnings_date": "",
            "metrics": merged,
            "zacks_meta": meta,
            "source": "screener+tickertape",
        }
        store.save_stock_metrics_snapshot(instrument["instrument_id"], snapshot_date, payload)
        saved += 1
        print(f"  [ok] {ticker} — {len(merged)} metrics, sector={sector_label}")

    print(f"Saved {saved}/{len(instruments)} snapshots for {args.market} / {universe_id} / {snapshot_date}")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync per-ticker fundamentals")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (defaults to the configured AI universe)")
    parser.add_argument("--pause", type=float, default=1.5, help="Seconds between scrape requests")
    parser.add_argument("--date", default=None, help="Snapshot date override YYYY-MM-DD")
    args = parser.parse_args()

    if args.market == "US":
        _sync_us(args)
    else:
        _sync_in(args)


if __name__ == "__main__":
    main()
