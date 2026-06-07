from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly market recap email worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="weekly_newsletter")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.send_weekly_newsletters",
        "--market",
        args.market,
        "--limit",
        str(max(0, args.limit)),
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
