from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar personalized-view worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="radar_materialize")
    parser.add_argument("--market", choices=["US"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--with-llm", action="store_true")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.materialize_radar_views",
        "--write",
    ]
    if args.activate:
        cmd.append("--activate")
    if args.with_llm:
        cmd.append("--with-llm")
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
