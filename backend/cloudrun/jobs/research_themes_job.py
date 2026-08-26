from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Weekly research-theme refresh worker")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lane", default="research_themes")
    parser.add_argument("--market", choices=["US"], required=True)
    parser.add_argument("--universe", default="")
    parser.add_argument("--min-candidates", type=int, default=8)
    parser.add_argument("--max-candidates", type=int, default=12)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.refresh_research_themes",
        "--market",
        args.market,
        "--min-candidates",
        str(max(1, args.min_candidates)),
        "--max-candidates",
        str(max(1, args.max_candidates)),
    ]
    if args.dry_run:
        cmd.append("--dry-run")
    if args.seed_only:
        cmd.append("--seed-only")
    print({"run_id": args.run_id, "lane": args.lane, "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
