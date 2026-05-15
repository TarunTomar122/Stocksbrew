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
    parser.add_argument("--threshold-pct", type=float, default=2.0)
    parser.add_argument("--limit", type=int, default=24)
    parser.add_argument("--per-stock-cap", type=int, default=3)
    parser.add_argument("--chunk-workers", type=int, default=4)
    args = parser.parse_args()

    common = ["--market", args.market, "--universe", args.universe]
    _run([
        sys.executable,
        "-m",
        "backend.scripts.build_daily_anomalies",
        *common,
        "--threshold-pct",
        str(args.threshold_pct),
        "--limit",
        str(args.limit),
        "--enrich-missing",
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--chunk-workers",
        str(args.chunk_workers),
    ])
    _run([sys.executable, "-m", "backend.scripts.build_heat_list", *common, "--ai-universe", args.universe, "--price-universe", args.universe])
    _run([sys.executable, "-m", "backend.scripts.build_divergence", *common, "--ai-universe", args.universe, "--price-universe", args.universe])
    _run([sys.executable, "-m", "backend.scripts.build_sentiment_flip", *common, "--ai-universe", args.universe, "--price-universe", args.universe])


if __name__ == "__main__":
    main()
