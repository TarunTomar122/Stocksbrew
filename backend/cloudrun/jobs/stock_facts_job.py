from __future__ import annotations

import argparse
import subprocess
import sys

from backend.instrument_universe import get_coverage_universe_id, list_instruments
from backend.storage import TraceMoneyStore


def _is_financial_depth_candidate(instrument: dict) -> bool:
    """Return whether a catalogue row represents an operating company."""
    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or "").strip().upper()
    kind = str(instrument.get("type") or "").strip().lower()
    support_tier = str(instrument.get("support_tier") or "").strip().lower()
    status = str(instrument.get("status") or "active").strip().lower()
    name = str(instrument.get("name") or "").strip().upper()
    if not instrument_id or not ticker or status != "active":
        return False
    if kind in {"macro", "index", "etf", "fund"} or support_tier == "macro":
        return False
    if instrument_id.startswith(("US_IDX_", "US_MAC_")):
        return False
    if (
        " ETF" in name
        or " ETN" in name
        or " EXCHANGE-TRADED FUND" in name
        or name == "INVESCO QQQ TRUST"
    ):
        return False
    return True


def _price_cohort_ids(store: TraceMoneyStore, market: str, universe_id: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    coverage_universe_id = get_coverage_universe_id(market) or universe_id
    try:
        instruments = list_instruments(market, coverage_universe_id)
    except ValueError:
        instruments = list_instruments(market, universe_id)
    for instrument in instruments:
        instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    raw_overrides = [
        str(raw or "").strip().upper()
        for raw in store.get_price_core_overrides(market)
        if str(raw or "").strip()
    ]
    valid_override_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_instruments(market, raw_overrides)
        if str(row.get("instrument_id") or "").strip()
    }
    for raw in raw_overrides:
        instrument_id = str(raw or "").strip().upper()
        if instrument_id and instrument_id in valid_override_ids and instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    # Financial depth serves every public stock page. Searchable companies
    # outside the runtime/core cohorts must still join the weekly refresh.
    for instrument in store.list_instruments(market):
        if not _is_financial_depth_candidate(instrument):
            continue
        instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
        if instrument_id not in seen:
            seen.add(instrument_id)
            ids.append(instrument_id)
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly fundamentals refresh worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="stock_facts")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--pause", type=float, default=0.25)
    args = parser.parse_args()

    py = sys.executable
    store = TraceMoneyStore()
    instrument_ids = _price_cohort_ids(store, args.market, args.universe)
    if args.limit > 0:
        instrument_ids = instrument_ids[: args.limit]
    if not instrument_ids:
        raise RuntimeError("Weekly fundamentals cohort is empty")
    ids_csv = ",".join(instrument_ids)
    facts_cmd = [
        py,
        "-m",
        "backend.scripts.sync_stock_facts",
        "--market",
        args.market,
        "--limit",
        str(max(0, args.limit)),
        "--max-workers",
        str(max(1, args.max_workers)),
        "--pause",
        str(max(0.0, args.pause)),
        "--instrument-ids",
        ids_csv,
    ]
    if args.universe:
        facts_cmd.extend(["--universe", args.universe])

    print(
        {
            "run_id": args.run_id,
            "lane": args.lane,
            "market": args.market,
            "universe_id": args.universe,
            "limit": args.limit,
            "cmd": " ".join(facts_cmd),
        }
    )
    subprocess.run(facts_cmd, check=True)

    cohort = [
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--instrument-ids",
        ids_csv,
    ]
    commands = [
        [
            py,
            "-m",
            "backend.scripts.sync_stock_metrics",
            *cohort,
            "--max-workers",
            str(max(1, args.max_workers)),
            "--pause",
            "0.25",
        ],
        [py, "-m", "backend.scripts.build_stock_intel_pro", *cohort],
        [
            py,
            "-m",
            "backend.scripts.build_stock_technicals",
            *cohort,
            "--finviz-workers",
            "3",
        ],
        [
            py,
            "-m",
            "backend.scripts.materialize_views",
            *cohort,
            "--allow-missing-context",
            "--skip-sector-scrape",
        ],
    ]
    for command in commands:
        print({"lane": args.lane, "cmd": " ".join(command)})
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
