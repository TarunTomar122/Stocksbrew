"""Scrape sector valuation medians and persist as a daily Firestore doc.

Writes to `tm_sector_benchmarks/{market}__{YYYY-MM-DD}` keyed by sector slug.
US pulls from Finviz group valuation view; IN walks the active universe's
tickers via Tickertape and takes the industry P/E, P/B, dividend yield that
Tickertape already computes for every stock's industry.
"""
from __future__ import annotations

import argparse
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from statistics import median

from backend.instrument_universe import list_instruments
from backend.sector_scraper import fetch_us_sector_benchmarks
from backend.storage import TraceMoneyStore
from backend.tickertape_scraper import fetch_tickertape_quote


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _fetch_in_benchmarks(universe_id: str, pause: float = 1.5) -> dict[str, dict[str, float]]:
    """One Tickertape hit per sector is enough - its industry PE/PB/DY are
    already the sector median. We pick the first ticker in each sector from
    the active universe to minimize scraping."""
    instruments = list_instruments("IN", universe_id)
    seen_sectors: set[str] = set()
    benchmarks: dict[str, dict[str, float]] = {}
    sector_labels: dict[str, str] = {}

    for i, inst in enumerate(instruments):
        ticker = inst["ticker"]
        try:
            q = fetch_tickertape_quote(ticker)
        except Exception as exc:
            print(f"  [fail] {ticker}: {exc}")
            continue
        if i < len(instruments) - 1:
            time.sleep(pause)
        sector_label = q.sector_label
        if not sector_label:
            continue
        slug = _slug(sector_label)
        if slug in seen_sectors:
            continue
        payload: dict[str, float] = {}
        for src, dst in (
            ("sector_pe", "pe"),
            ("sector_pb", "pb"),
            ("sector_dividend_yield", "dividend_yield"),
        ):
            if src in q.metrics:
                payload[dst] = q.metrics[src]
        if not payload:
            continue
        benchmarks[slug] = payload
        sector_labels[slug] = sector_label
        seen_sectors.add(slug)
        print(f"  [ok] {sector_label} ({slug}) - PE {payload.get('pe')}, PB {payload.get('pb')}")

    for slug, label in sector_labels.items():
        benchmarks[slug]["label"] = label  # type: ignore[assignment]
    return benchmarks


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync sector valuation benchmarks")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id (IN only)")
    parser.add_argument("--pause", type=float, default=1.5, help="Seconds between scrape requests (IN)")
    parser.add_argument(
        "--date",
        default=None,
        help="YYYY-MM-DD override; defaults to today in UTC.",
    )
    args = parser.parse_args()

    if args.market == "US":
        benchmarks = fetch_us_sector_benchmarks()
    else:
        store = TraceMoneyStore()
        universe_id = args.universe or store.get_active_price_universe(args.market)
        if not universe_id:
            raise ValueError(
                f"No active price universe configured for {args.market}. "
                "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
            )
        benchmarks = _fetch_in_benchmarks(universe_id, pause=args.pause)

    if not benchmarks:
        raise RuntimeError(f"No sector benchmarks scraped for {args.market}.")

    snapshot_date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if args.market == "US":
        store = TraceMoneyStore()
    store.save_sector_benchmarks(args.market, snapshot_date, benchmarks)

    print(
        f"Saved {len(benchmarks)} sector benchmarks for {args.market} / "
        f"{snapshot_date} (sectors: {', '.join(sorted(benchmarks.keys()))})"
    )


if __name__ == "__main__":
    main()
