from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Non-LLM tracked news discovery worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="tracked_incremental_refresh")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.run_incremental_tracked_refresh",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--chunk-workers",
        str(args.chunk_workers),
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
