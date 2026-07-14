from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar official-source sync worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="radar_official_sources")
    parser.add_argument("--market", choices=["US"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--recent-days", type=int, default=3)
    parser.add_argument("--include-ir", action="store_true")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.sync_radar_official_sources",
        "--since-days",
        str(max(1, args.recent_days)),
        "--write",
    ]
    if args.include_ir:
        cmd.append("--include-ir")
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
