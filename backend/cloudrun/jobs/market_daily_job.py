"""VPS/Cloud Run compatible entry point for Market Daily."""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Market Daily publisher worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="market_daily")
    parser.add_argument("--market", choices=["US"], default="US")
    parser.add_argument("--universe", default="")
    parser.add_argument("--model", default="")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_market_daily",
        "--publish",
    ]
    if args.model:
        cmd.extend(["--model", args.model])
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)}, flush=True)
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
