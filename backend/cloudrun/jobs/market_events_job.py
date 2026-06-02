from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Market-wide events feed worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="market_events")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--earnings-cap", type=int, default=12)
    parser.add_argument("--skip-if-fresh-hours", type=int, default=0)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_market_events",
        "--market",
        args.market,
        "--limit",
        str(max(1, args.limit)),
        "--earnings-cap",
        str(max(0, args.earnings_cap)),
    ]
    if args.skip_if_fresh_hours > 0:
        cmd.extend(["--skip-if-fresh-hours", str(args.skip_if_fresh_hours)])
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
