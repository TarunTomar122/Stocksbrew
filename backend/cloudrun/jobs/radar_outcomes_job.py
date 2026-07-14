from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar directive-outcome worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="radar_outcomes")
    parser.add_argument("--market", choices=["US"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.score_radar_directive_outcomes",
        "--limit",
        str(max(0, args.limit)),
        "--write",
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
