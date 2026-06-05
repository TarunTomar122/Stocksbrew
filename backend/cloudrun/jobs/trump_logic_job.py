from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Trump Logic daily worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="trump_logic")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--lookback-days", type=int, default=90)
    parser.add_argument("--max-posts", type=int, default=5000)
    parser.add_argument("--rss-chunk-days", type=int, default=7)
    parser.add_argument("--llm-batch-size", type=int, default=50)
    parser.add_argument("--incremental-fetch-days", type=int, default=5)
    parser.add_argument("--full-refresh", action="store_true")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_trump_logic",
        "--market",
        args.market,
        "--lookback-days",
        str(max(1, args.lookback_days)),
        "--max-posts",
        str(max(100, args.max_posts)),
        "--rss-chunk-days",
        str(max(1, args.rss_chunk_days)),
        "--llm-batch-size",
        str(max(10, args.llm_batch_size)),
        "--incremental-fetch-days",
        str(max(1, args.incremental_fetch_days)),
    ]
    if args.full_refresh:
        cmd.append("--full-refresh")
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
