"""Overnight news fetch for subscribed tracked stocks (RSS + Finnhub + Marketaux)."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch overnight news for tracked stocks")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--lookback-hours", type=int, default=14)
    parser.add_argument("--per-stock-cap", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = str(store.get_active_ai_universe(args.market) or "").strip()
    if not universe_id:
        raise ValueError(f"No active AI universe for {args.market}")

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        args.market,
        "--universe",
        universe_id,
        "--paid-only",
        "--incremental",
        "--enrich-only",
        "--upsert",
        "--per-stock-lookback-hours",
        str(max(4, args.lookback_hours)),
        "--per-stock-cap",
        str(max(3, args.per_stock_cap)),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        "4",
        "--skip-context",
        "--skip-materialize",
    ]

    if args.dry_run:
        print(json.dumps({"dry_run": True, "cmd": " ".join(cmd)}))
        return

    subprocess.run(cmd, check=True)
    print(json.dumps({"status": "success", "market": args.market, "universe_id": universe_id}))


if __name__ == "__main__":
    main()
