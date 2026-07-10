"""Run the free newsletter pipeline after post-close market data is ready."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time

from backend.env import load_backend_env
from backend.newsletter_intel import has_sendable_newsletter_snapshot, market_today_key, previous_trading_date_key
from backend.open_email_intel import load_daily_anomalies
from backend.storage import TraceMoneyStore


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
    load_backend_env()
    parser = argparse.ArgumentParser(description="Free daily newsletter pipeline")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--mode", choices=["morning", "close"], default="morning")
    parser.add_argument("--limit", type=int, default=0, help="Max subscribers to scan (0 = all)")
    parser.add_argument("--skip-email", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = args.market.upper()
    store = TraceMoneyStore()
    anomalies_doc = load_daily_anomalies(store, market)
    if not has_sendable_newsletter_snapshot(anomalies_doc, market=market, mode=args.mode):
        payload = {
            "status": "skipped_no_snapshot",
            "market": market,
            "mode": args.mode,
            "snapshot_date": str((anomalies_doc or {}).get("date") or ""),
            "expected_date": (
                market_today_key(market)
                if args.mode == "close"
                else previous_trading_date_key(market)
            ),
        }
        print(json.dumps(payload), flush=True)
        return

    if args.skip_email:
        print(json.dumps({"status": "success", "market": market, "mode": args.mode, "email": "skipped"}), flush=True)
        return

    py = sys.executable
    email_cmd = [py, "-m", "backend.scripts.send_newsletter_briefs", "--market", market]
    if args.mode == "morning":
        email_cmd.extend([
            "--as-of-date",
            previous_trading_date_key(market),
            "--allow-stale",
        ])
    else:
        email_cmd.extend(["--as-of-date", market_today_key(market)])
    if args.limit > 0:
        email_cmd.extend(["--limit", str(args.limit)])

    _run_step("newsletter_email", email_cmd, dry_run=args.dry_run)
    print(json.dumps({"status": "success", "market": market, "mode": args.mode, "dry_run": args.dry_run}), flush=True)


if __name__ == "__main__":
    main()
