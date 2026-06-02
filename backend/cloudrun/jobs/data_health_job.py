from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Frontend data-health snapshot worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="data_health")
    parser.add_argument("--market", choices=["US", "IN"], required=True)
    parser.add_argument("--universe", default="")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.audit_data_health",
        "--market",
        args.market,
    ]
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
