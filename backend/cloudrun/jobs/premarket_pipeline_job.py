"""Cloud Run job entry point for the full pre-market pipeline."""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-market pipeline worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="premarket_pipeline")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    cmd = [sys.executable, "-m", "backend.scripts.run_premarket_pipeline", "--market", args.market]
    if args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])

    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
