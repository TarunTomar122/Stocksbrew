from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-earnings setup worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="pre_earnings_intel")
    parser.add_argument("--market", choices=["US"], default="US")
    parser.add_argument("--universe", default="")
    parser.add_argument("--upcoming-days", type=int, default=7)
    parser.add_argument("--max-events", type=int, default=200)
    parser.add_argument("--model", default="")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild reports even when a doc already exists for the event",
    )
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_pre_earnings_intel",
        "--market",
        args.market,
        "--all-upcoming",
        "--upcoming-days",
        str(max(1, args.upcoming_days)),
        "--max-events",
        str(max(1, args.max_events)),
        "--write",
    ]
    if args.force:
        cmd.append("--force")
    if args.universe.strip():
        cmd.extend(["--universe", args.universe.strip()])
    if args.model.strip():
        cmd.extend(["--model", args.model.strip()])

    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
