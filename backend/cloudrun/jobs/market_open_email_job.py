from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Market-open newsletter sender worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="market_open_email")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", required=True)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.send_market_open_newsletters",
        "--market",
        args.market,
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
