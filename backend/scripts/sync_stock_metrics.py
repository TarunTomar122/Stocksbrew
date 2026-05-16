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
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

from backend.fundamentals_scraper import fetch_finviz_quotes, fetch_zacks_quote
from backend.instrument_universe import list_instruments
from backend.providers.yfinance_provider import fetch_yfinance_scorecard_metrics
from backend.screener_scraper import fetch_screener_quote
from backend.storage import TraceMoneyStore
from backend.tickertape_scraper import fetch_tickertape_quote


def _sync_us(args: argparse.Namespace) -> None:
    run_started = time.time()
    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )

    instruments = list_instruments(args.market, universe_id)
    tickers = [inst["ticker"] for inst in instruments]
    ticker_to_instrument = {inst["ticker"]: inst for inst in instruments}

    snapshot_date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    captured_at = datetime.now(timezone.utc).isoformat()

    print(
        f"Fetching Finviz fundamentals for {len(tickers)} tickers "
        f"(pause={args.pause}s)..."
    )
    finviz_started = time.time()
    quotes = fetch_finviz_quotes(tickers, pause_seconds=args.pause)
    print(
        f"Finviz fetch complete: {len(quotes)}/{len(tickers)} tickers "
        f"in {time.time() - finviz_started:.1f}s"
    )

    def build_payload(ticker: str, quote: Any) -> dict[str, Any] | None:
        instrument = ticker_to_instrument.get(ticker)
        if instrument is None:
            return None
        if not quote.metrics:
            print(f"  [skip] {ticker}: no metrics parsed")
            return None

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
        return {
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

    saved = 0
    max_workers = max(1, args.max_workers)
    if max_workers == 1:
        payloads = [build_payload(ticker, quote) for ticker, quote in quotes.items()]
    else:
        payloads = []
        completed = 0
        total = len(quotes)
        zacks_started = time.time()
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(build_payload, ticker, quote): ticker
                for ticker, quote in quotes.items()
            }
            for future in as_completed(futures):
                completed += 1
                try:
                    payloads.append(future.result())
                except Exception as exc:
                    print(f"  [worker fail] {futures[future]}: {exc}")
                if completed == 1 or completed % 25 == 0 or completed == total:
                    elapsed = time.time() - zacks_started
                    print(
                        f"  [zacks workers] progress {completed}/{total} "
                        f"(payloads={len(payloads)}) elapsed={elapsed:.1f}s"
                    )

    save_started = time.time()
    for payload in payloads:
        if not payload:
            continue
        store.save_stock_metrics_snapshot(payload["instrument_id"], snapshot_date, payload)
        saved += 1
        if saved == 1 or saved % 50 == 0:
            print(
                f"  [save] progress {saved}/{len(tickers)} "
                f"elapsed={time.time() - save_started:.1f}s"
            )

    print(
        f"Saved {saved}/{len(tickers)} snapshots for {args.market} / "
        f"{universe_id} / {snapshot_date} "
        f"(total_elapsed={time.time() - run_started:.1f}s)"
    )
    store.save_stage_watermark(
        market=args.market,
        stage_key="sync_stock_metrics",
        universe_id=universe_id,
        expected_count=len(tickers),
        success_count=saved,
        error_count=max(0, len(tickers) - saved),
        metadata={
            "snapshot_date": snapshot_date,
            "max_workers": int(max_workers),
            "source": "finviz+zacks",
        },
    )


def _sync_in(args: argparse.Namespace) -> None:
    run_started = time.time()
    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )

    instruments = list_instruments(args.market, universe_id)
    snapshot_date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    captured_at = datetime.now(timezone.utc).isoformat()

    print(f"Fetching Screener + Tickertape fundamentals for {len(instruments)} IN tickers (pause={args.pause}s)...")

    def build_payload(instrument: dict[str, Any]) -> dict[str, Any] | None:
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
        time.sleep(args.pause)

        merged: dict[str, float] = {}
        if screener:
            merged.update(screener.metrics)
            if screener.shareholding:
                inst_own_pct = round(
                    screener.shareholding.get("fii_pct", 0.0)
                    + screener.shareholding.get("dii_pct", 0.0),
                    2,
                )
                merged.setdefault("inst_own_pct", inst_own_pct)
                for key, value in screener.shareholding.items():
                    merged.setdefault(key, value)
        if tickertape:
            for k, v in tickertape.metrics.items():
                merged.setdefault(k, v)  # Screener wins on conflicts (more accurate PE from consolidated)

        # Yahoo fallback for fields IN-native sources don't publish: forward
        # P/E, PEG, analyst mean target, and an analyst buy % derived from
        # Yahoo's recommendationMean. Only fills gaps - never overwrites a
        # value Screener/Tickertape already produced.
        try:
            yahoo_metrics = fetch_yfinance_scorecard_metrics(ticker, "IN")
        except Exception as exc:
            print(f"  [yfinance fail] {ticker}: {exc}")
            yahoo_metrics = {}
        for k, v in yahoo_metrics.items():
            merged.setdefault(k, v)

        native_metric_count = (
            (len(screener.metrics) if screener else 0)
            + (len(tickertape.metrics) if tickertape else 0)
        )
        if not merged:
            print(f"  [skip] {ticker}: no metrics parsed from either source")
            return None
        if native_metric_count < 3:
            print(f"  [skip] {ticker}: only thin Yahoo fallback metrics parsed")
            return None

        # Prefer Tickertape's sector_label because it's more consumer-readable
        # ("Oil & Gas - Refining & Marketing" vs Screener's "Energy"); fall back
        # to Screener when Tickertape is absent.
        sector_label = (
            (tickertape.sector_label if tickertape else "")
            or (screener.sector_label if screener else "")
            or str(instrument.get("sector") or "")
        )
        industry_label = (
            (tickertape.industry_label if tickertape else "")
            or (screener.industry_label if screener else "")
            or str(instrument.get("industry") or sector_label)
        )
        # Slug must match how sync_sector_benchmarks saved IN benchmarks (which
        # also slugifies the Tickertape label), so derive from the same label.
        sector_slug = _slug(sector_label) if sector_label else (screener.sector_slug if screener else "")
        industry_slug = _slug(industry_label) if industry_label else (screener.industry_slug if screener else "")

        meta: dict[str, Any] = {}
        if tickertape and tickertape.scorecard_tags:
            meta["tickertape_tags"] = tickertape.scorecard_tags
        if tickertape and tickertape.peers:
            meta["peers"] = tickertape.peers

        return {
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

    saved = 0
    max_workers = max(1, args.max_workers)
    if max_workers == 1:
        payloads = [build_payload(instrument) for instrument in instruments]
    else:
        payloads = []
        completed = 0
        total = len(instruments)
        workers_started = time.time()
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(build_payload, instrument): instrument.get("ticker", "")
                for instrument in instruments
            }
            for future in as_completed(futures):
                completed += 1
                try:
                    payloads.append(future.result())
                except Exception as exc:
                    print(f"  [worker fail] {futures[future]}: {exc}")
                if completed == 1 or completed % 25 == 0 or completed == total:
                    elapsed = time.time() - workers_started
                    print(
                        f"  [workers] progress {completed}/{total} "
                        f"(payloads={len(payloads)}) elapsed={elapsed:.1f}s"
                    )

    for payload in payloads:
        if not payload:
            continue
        store.save_stock_metrics_snapshot(payload["instrument_id"], snapshot_date, payload)
        saved += 1
        print(f"  [ok] {payload['ticker']} - {len(payload.get('metrics') or {})} metrics, sector={payload.get('sector_label', '')}")

    print(
        f"Saved {saved}/{len(instruments)} snapshots for {args.market} / "
        f"{universe_id} / {snapshot_date} "
        f"(total_elapsed={time.time() - run_started:.1f}s)"
    )
    store.save_stage_watermark(
        market=args.market,
        stage_key="sync_stock_metrics",
        universe_id=universe_id,
        expected_count=len(instruments),
        success_count=saved,
        error_count=max(0, len(instruments) - saved),
        metadata={
            "snapshot_date": snapshot_date,
            "max_workers": int(max_workers),
            "source": "screener+tickertape",
        },
    )


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync per-ticker fundamentals")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (defaults to the configured AI universe)")
    parser.add_argument("--pause", type=float, default=1.5, help="Seconds between scrape requests")
    parser.add_argument("--date", default=None, help="Snapshot date override YYYY-MM-DD")
    parser.add_argument("--max-workers", type=int, default=1, help="Bounded per-ticker workers for secondary scrapers")
    args = parser.parse_args()

    if args.market == "US":
        _sync_us(args)
    else:
        _sync_in(args)


if __name__ == "__main__":
    main()
