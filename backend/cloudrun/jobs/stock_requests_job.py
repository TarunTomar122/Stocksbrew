from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Stock request queue worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="stock_requests")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--query", default="")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.process_stock_requests",
        "--market",
        args.market,
        "--limit",
        str(max(1, args.limit)),
    ]
    query = str(args.query or "").strip().upper()
    if query:
        cmd.extend(["--query", query])

    print(
        {
            "run_id": args.run_id,
            "lane": args.lane,
            "market": args.market,
            "universe_id": args.universe,
            "query": query,
            "cmd": " ".join(cmd),
        }
    )
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
