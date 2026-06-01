from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Zone-brief refresh worker (anomaly + reddit buzz)")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="zone_briefs")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--max-age-hours", type=int, default=24)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_zone_briefs",
        "--market",
        args.market,
        "--max-age-hours",
        str(max(0, args.max_age_hours)),
        "--per-stock-cap",
        str(max(1, args.per_stock_cap)),
        "--chunk-workers",
        str(max(1, args.chunk_workers)),
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
