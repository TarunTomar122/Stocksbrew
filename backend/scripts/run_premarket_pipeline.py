"""Run the pre-market pipeline in order."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time


def _run_step(label: str, cmd: list[str], *, dry_run: bool) -> None:
    full_cmd = cmd + (["--dry-run"] if dry_run and "--dry-run" not in cmd else [])
    print(json.dumps({"step": label, "cmd": " ".join(full_cmd), "status": "starting"}), flush=True)
    started = time.time()
    result = subprocess.run(full_cmd, check=False)
    elapsed = round(time.time() - started, 1)
    if result.returncode != 0:
        print(json.dumps({"step": label, "status": "failed", "returncode": result.returncode, "elapsed_s": elapsed}), flush=True)
        raise SystemExit(1)
    print(json.dumps({"step": label, "status": "ok", "elapsed_s": elapsed}), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Full pre-market pipeline")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--limit", type=int, default=0, help="Max email recipients (0 = all)")
    parser.add_argument("--skip-news", action="store_true")
    parser.add_argument("--skip-movers", action="store_true")
    parser.add_argument("--skip-context", action="store_true")
    parser.add_argument("--skip-email", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    py = sys.executable
    market = args.market
    if not args.skip_news:
        _run_step("premarket_news", [py, "-m", "backend.scripts.build_premarket_news", "--market", market], dry_run=args.dry_run)
    if not args.skip_movers:
        _run_step("premarket_movers", [py, "-m", "backend.scripts.build_premarket_movers", "--market", market], dry_run=args.dry_run)
    if not args.skip_context:
        _run_step("premarket_context", [py, "-m", "backend.scripts.build_premarket_context", "--market", market], dry_run=args.dry_run)
    if not args.skip_email:
        email_cmd = [py, "-m", "backend.scripts.send_premarket_briefs", "--market", market]
        if args.limit > 0:
            email_cmd.extend(["--limit", str(args.limit)])
        _run_step("premarket_email", email_cmd, dry_run=args.dry_run)

    print(json.dumps({"status": "success", "market": market.upper(), "dry_run": args.dry_run}), flush=True)


if __name__ == "__main__":
    main()
