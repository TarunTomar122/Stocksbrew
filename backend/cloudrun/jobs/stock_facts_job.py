from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Stock facts refresh worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="stock_facts")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--pause", type=float, default=0.25)
    args = parser.parse_args()

    cmd = [
        sys.executable,
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
    ]
    if args.universe:
        cmd.extend(["--universe", args.universe])

    print(
        {
            "run_id": args.run_id,
            "lane": args.lane,
            "market": args.market,
            "universe_id": args.universe,
            "limit": args.limit,
            "cmd": " ".join(cmd),
        }
    )
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
