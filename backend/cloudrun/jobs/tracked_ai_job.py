from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Tracked AI shard worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="tracked_ai")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--shard-id", required=True)
    parser.add_argument("--instrument-ids", required=True)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        args.market,
        "--universe",
        args.universe,
        "--instrument-ids",
        args.instrument_ids,
        "--upsert",
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(args.chunk_workers),
        "--skip-context",
        "--skip-materialize",
    ]
    print({"run_id": args.run_id, "lane": args.lane, "shard_id": args.shard_id, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()

