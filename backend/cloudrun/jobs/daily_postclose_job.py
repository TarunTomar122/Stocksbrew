from __future__ import annotations

import argparse
import subprocess
import sys
from typing import Sequence

from backend.instrument_universe import get_coverage_universe_id, list_coverage_delta_instrument_ids
from backend.storage import TraceMoneyStore


def _run(cmd: Sequence[str]) -> None:
    print({"cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Daily post-close worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="daily_postclose")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--session-phase", default="post_close")
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--include-heavy", action="store_true")
    args = parser.parse_args()

    common = ["--market", args.market, "--universe", args.universe]

    # Core daily freshness chain.
    _run([
        sys.executable,
        "-m",
        "backend.scripts.sync_price_snapshots",
        *common,
        "--session-phase",
        args.session_phase,
        "--max-workers",
        str(args.max_workers),
    ])
    _run([sys.executable, "-m", "backend.scripts.sync_sector_benchmarks", *common])
    _run([sys.executable, "-m", "backend.scripts.sync_stock_metrics", *common])

    _run([sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *common])
    _run([sys.executable, "-m", "backend.scripts.build_stock_technicals", *common])
    _run([sys.executable, "-m", "backend.scripts.build_sector_regimes", "--market", args.market])
    _run([sys.executable, "-m", "backend.scripts.build_market_breadth", *common])

    _run([sys.executable, "-m", "backend.scripts.build_thematic_screens", *common])
    _run([sys.executable, "-m", "backend.scripts.build_user_alert_flags", *common])
    _run([sys.executable, "-m", "backend.scripts.materialize_views", *common, "--activate"])
    _run([sys.executable, "-m", "backend.scripts.materialize_search_index", "--market", args.market, "--active-only"])
    _run([sys.executable, "-m", "backend.scripts.build_watchlist_views"])
    _run([sys.executable, "-m", "backend.scripts.build_snapshot", "--market", args.market])

    coverage_universe = get_coverage_universe_id(args.market)
    if coverage_universe and coverage_universe != args.universe:
        delta_ids = list_coverage_delta_instrument_ids(args.market, args.universe)
        if delta_ids:
            ids_csv = ",".join(delta_ids)
            coverage_args = [
                "--market",
                args.market,
                "--universe",
                coverage_universe,
                "--instrument-ids",
                ids_csv,
            ]
            print(
                {
                    "coverage_catalog_refresh": {
                        "universe": coverage_universe,
                        "delta_count": len(delta_ids),
                    }
                }
            )
            _run([
                sys.executable,
                "-m",
                "backend.scripts.sync_stock_metrics",
                *coverage_args,
                "--max-workers",
                "1",
                "--pause",
                "0.5",
            ])
            _run([sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *coverage_args])

    # Keep override set bounded and active before running extended-core thick refresh.
    _run([
        sys.executable,
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
    ])

    # Extended core refresh: keep dynamic overrides fully thick (price + fundamentals + score + technicals)
    # even when they are outside the static base universe file.
    store = TraceMoneyStore()
    override_ids = store.get_price_core_overrides(args.market)
    if override_ids:
        ids_csv = ",".join(override_ids)
        extra = [*common, "--instrument-ids", ids_csv]
        _run([
            sys.executable,
            "-m",
            "backend.scripts.sync_price_snapshots",
            *extra,
            "--session-phase",
            args.session_phase,
            "--max-workers",
            str(args.max_workers),
            "--merge-market-snapshot",
        ])
        _run([sys.executable, "-m", "backend.scripts.sync_stock_metrics", *extra, "--max-workers", "1", "--pause", "0.4"])
        _run([sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *extra])
        _run([sys.executable, "-m", "backend.scripts.build_stock_technicals", *extra, "--finviz-workers", "1"])
        _run([
            sys.executable,
            "-m",
            "backend.scripts.materialize_views",
            *extra,
            "--allow-missing-context",
            "--skip-sector-scrape",
            "--skip-dashboard",
        ])

    if args.include_heavy:
        _run([
            sys.executable,
            "-m",
            "backend.scripts.build_heat_list",
            "--market",
            args.market,
            "--ai-universe",
            args.universe,
            "--price-universe",
            args.universe,
        ])
        _run([
            sys.executable,
            "-m",
            "backend.scripts.build_divergence",
            "--market",
            args.market,
            "--ai-universe",
            args.universe,
            "--price-universe",
            args.universe,
        ])
        _run([
            sys.executable,
            "-m",
            "backend.scripts.build_sentiment_flip",
            "--market",
            args.market,
            "--ai-universe",
            args.universe,
            "--price-universe",
            args.universe,
        ])


if __name__ == "__main__":
    main()
