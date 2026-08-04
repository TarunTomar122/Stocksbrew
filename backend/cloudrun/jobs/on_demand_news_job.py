from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="On-demand news queue worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="on_demand_news")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--per-stock-cap", type=int, default=6)
    parser.add_argument("--broad-cap", type=int, default=0)
    parser.add_argument("--max-workers", type=int, default=2)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.process_on_demand_news_jobs",
        "--limit",
        str(max(1, args.limit)),
        "--per-stock-cap",
        str(max(1, args.per_stock_cap)),
        "--broad-cap",
        str(max(0, args.broad_cap)),
        "--max-workers",
        str(max(1, args.max_workers)),
    ]
    print(
        {
            "run_id": args.run_id,
            "lane": args.lane,
            "market": args.market,
            "universe_id": args.universe,
            "cmd": " ".join(cmd),
        }
    )
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
