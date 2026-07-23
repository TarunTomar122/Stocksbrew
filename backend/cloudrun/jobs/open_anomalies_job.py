from __future__ import annotations

import argparse
import subprocess
import sys
from typing import Sequence


def _run(cmd: Sequence[str]) -> None:
    print({"cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Open-session anomaly worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="open_anomalies")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--threshold-pct", type=float, default=1.0)
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument("--per-stock-cap", type=int, default=3)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument(
        "--price-session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default=None,
        help="Require selected mover prices to be fresh for this session phase.",
    )
    args = parser.parse_args()

    # `build_daily_anomalies` accepts `--universe`; the others below take only
    # `--market` + `--ai-universe` / `--price-universe`. Passing `--universe`
    # to them fails argparse and silently kills the heat/divergence/sentiment
    # refresh — see the open-anomalies job logs prior to this fix.
    anomaly_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_daily_anomalies",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--threshold-pct",
        str(args.threshold_pct),
        "--limit",
        str(args.limit),
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--chunk-workers",
        str(args.chunk_workers),
        "--require-web-revalidate",
    ]
    # Closing-price materialization must not wait on missing intelligence or
    # external catalyst searches. Those are useful for the open-session feed,
    # but they can take minutes per ticker and previously left the homepage on
    # yesterday's mover snapshot even after canonical prices were current.
    if args.price_session_phase != "post_close":
        anomaly_cmd.extend(["--enrich-missing", "--explain-hard-moves"])
    if args.price_session_phase:
        anomaly_cmd.extend(["--require-price-session-phase", args.price_session_phase])
    _run(anomaly_cmd)
    market_only = ["--market", args.market]
    universe_pair = ["--ai-universe", args.universe, "--price-universe", args.universe]
    _run([sys.executable, "-m", "backend.scripts.build_heat_list", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_interesting_stocks", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_divergence", *market_only, *universe_pair])
    _run([sys.executable, "-m", "backend.scripts.build_sentiment_flip", *market_only, *universe_pair])


if __name__ == "__main__":
    main()
