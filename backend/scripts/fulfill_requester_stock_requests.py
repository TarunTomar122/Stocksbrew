#!/usr/bin/env python3
"""Process all pending stock_requests for one requester (parallel batch)."""
from __future__ import annotations

import argparse
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.process_stock_requests",
        "--market",
        "US",
        "--limit",
        str(max(1, args.limit)),
        "--requester-email",
        args.email.strip().lower(),
        "--workers",
        str(max(1, min(args.workers, 8))),
        "--skip-ready-email",
    ]
    if args.dry_run:
        cmd.append("--dry-run")

    print("[fulfill-requester]", " ".join(cmd), flush=True)
    raise SystemExit(subprocess.run(cmd, check=False).returncode)


if __name__ == "__main__":
    main()
