"""Cloud Run job entry point for the free newsletter pipeline."""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Newsletter pipeline worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="newsletter_pipeline")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--mode", choices=["morning", "close"], default="morning")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.run_newsletter_pipeline",
        "--market",
        args.market,
        "--mode",
        args.mode,
    ]
    if args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])

    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
