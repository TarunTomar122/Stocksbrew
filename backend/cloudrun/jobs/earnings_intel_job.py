from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Post-earnings intelligence worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="earnings_intel")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--recent-days", type=int, default=3)
    parser.add_argument("--max-events", type=int, default=20)
    parser.add_argument("--model", default="")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_earnings_intel",
        "--market",
        args.market,
        "--all-recent",
        "--recent-days",
        str(max(0, args.recent_days)),
        "--max-events",
        str(max(1, args.max_events)),
        "--write",
    ]
    if args.model.strip():
        cmd.extend(["--model", args.model.strip()])

    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
