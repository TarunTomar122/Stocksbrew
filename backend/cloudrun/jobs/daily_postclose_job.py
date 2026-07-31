from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import subprocess
import sys
import time
from typing import Sequence

from backend.instrument_universe import get_coverage_universe_id, list_instruments
from backend.price_pipeline_contract import require_price_batch_coverage
from backend.scripts.sync_price_snapshots import sync_price_snapshots
from backend.storage import TraceMoneyStore


def _run(stage: str, cmd: Sequence[str]) -> dict[str, object]:
    started = time.monotonic()
    print({"stage": stage, "cmd": " ".join(cmd)}, flush=True)
    subprocess.run(cmd, check=True)
    return {"stage": stage, "elapsed_seconds": round(time.monotonic() - started, 2)}


def _price_cohort_ids(
    store: TraceMoneyStore,
    *,
    market: str,
    universe_id: str,
) -> list[str]:
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
        str(instrument_id or "").strip().upper()
        for instrument_id in store.get_price_core_overrides(market)
        if str(instrument_id or "").strip()
    ]
    valid_override_ids = {
        str(row.get("instrument_id") or "").strip().upper()
        for row in store.list_instruments(market, raw_overrides)
        if str(row.get("instrument_id") or "").strip()
    }
    for instrument_id in raw_overrides:
        key = str(instrument_id or "").strip().upper()
        if key and key in valid_override_ids and key not in seen:
            seen.add(key)
            ids.append(key)
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Lean daily post-close price/read-model worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="daily_postclose")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--session-phase", default="post_close")
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--include-heavy", action="store_true")
    args = parser.parse_args()

    started = time.monotonic()
    timings: list[dict[str, object]] = []
    py = sys.executable
    common = ["--market", args.market, "--universe", args.universe]
    store = TraceMoneyStore()

    # Keep the dynamic cohort bounded before selecting the one daily batch.
    timings.append(
        _run(
            "prune_price_overrides",
            [
                py,
                "-m",
                "backend.scripts.prune_price_core_overrides",
                "--market",
                args.market,
                "--recent-days",
                "21",
                "--target-cap",
                "500" if args.market == "US" else "250",
                "--floor",
                "200" if args.market == "US" else "80",
            ],
        )
    )
    price_ids = _price_cohort_ids(
        store,
        market=args.market,
        universe_id=args.universe,
    )
    price_started = time.monotonic()
    price_result = sync_price_snapshots(
        market=args.market,
        universe_id=args.universe,
        session_phase=args.session_phase,
        max_workers=args.max_workers,
        instrument_ids=price_ids,
        activate=False,
        merge_market_snapshot=True,
        store=store,
    )
    timings.append(
        {
            "stage": "price_batch",
            "elapsed_seconds": round(time.monotonic() - price_started, 2),
            "input_count": len(price_ids),
            "saved_count": price_result["saved_count"],
        }
    )
    require_price_batch_coverage(
        price_result,
        minimum_coverage=0.98,
        context=f"{args.market} post-close price batch",
    )
    resolvable_input_count = int(price_result["input_count"])

    ids_csv = ",".join(price_ids)
    cohort_args = [*common, "--instrument-ids", ids_csv]

    # These derive from the new price batch or already-weekly fundamentals.
    # They are independent and safe to run together.
    parallel_commands = {
        "sector_benchmarks": [py, "-m", "backend.scripts.sync_sector_benchmarks", *common],
        "local_technicals": [
            py,
            "-m",
            "backend.scripts.build_stock_technicals",
            *cohort_args,
            "--no-finviz",
        ],
        "thematic_screens": [py, "-m", "backend.scripts.build_thematic_screens", *common],
    }
    with ThreadPoolExecutor(max_workers=len(parallel_commands)) as executor:
        futures = {
            executor.submit(_run, stage, command): stage
            for stage, command in parallel_commands.items()
        }
        for future in as_completed(futures):
            timings.append(future.result())

    # Regime/breadth consume the refreshed benchmark/technical state.
    timings.append(_run("sector_regimes", [py, "-m", "backend.scripts.build_sector_regimes", "--market", args.market]))
    timings.append(_run("market_breadth", [py, "-m", "backend.scripts.build_market_breadth", *common]))
    timings.append(_run("user_alert_flags", [py, "-m", "backend.scripts.build_user_alert_flags", *common]))

    # One final publish barrier. Fundamentals are deliberately absent here;
    # the weekly job owns all Finviz/Zacks/Yahoo `.info` work.
    timings.append(
        _run(
            "materialize_views",
            [
                py,
                "-m",
                "backend.scripts.materialize_views",
                *cohort_args,
                "--activate",
                "--allow-missing-context",
                "--skip-sector-scrape",
            ],
        )
    )
    timings.append(
        _run(
            "materialize_search",
            [py, "-m", "backend.scripts.materialize_search_index", "--market", args.market, "--active-only"],
        )
    )
    timings.append(_run("watchlists", [py, "-m", "backend.scripts.build_watchlist_views", "--no-llm"]))
    timings.append(_run("snapshot", [py, "-m", "backend.scripts.build_snapshot", "--market", args.market]))

    total = round(time.monotonic() - started, 2)
    store.save_stage_watermark(
        market=args.market,
        stage_key="daily_postclose",
        universe_id=args.universe,
        expected_count=resolvable_input_count,
        success_count=price_result["saved_count"],
        error_count=max(0, resolvable_input_count - price_result["saved_count"]),
        metadata={
            "session_phase": args.session_phase,
            "total_elapsed_seconds": total,
            "timings": timings,
            "weekly_fundamentals_excluded": True,
        },
    )
    print(
        json.dumps(
            {
                "run_id": args.run_id,
                "lane": args.lane,
                "price": price_result,
                "total_elapsed_seconds": total,
                "timings": timings,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
