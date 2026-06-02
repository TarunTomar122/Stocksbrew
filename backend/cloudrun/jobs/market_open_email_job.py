from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Scheduled email system worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="market_open_email")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.send_email_system",
        "--market",
        args.market,
    ]
    if args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
