from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly business questions worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="business_questions")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--max-workers", type=int, default=4)
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_business_questions",
        "--market",
        args.market,
        "--max-workers",
        str(max(1, args.max_workers)),
    ]
    if args.universe:
        cmd.extend(["--universe", args.universe])
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
