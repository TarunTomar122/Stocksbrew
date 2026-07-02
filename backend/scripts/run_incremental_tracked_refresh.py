"""Incremental tracked-stock news refresh.

Stage 1: cheap discovery across all tracked names.
Stage 2: selective enrichment + brief rebuild for changed names only.
Then rebuild only the affected user watchlists.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile

from backend.storage import TraceMoneyStore


def _tracked_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            instrument_id = str(raw or "").strip().upper()
            if not instrument_id or not instrument_id.startswith(prefix) or instrument_id in seen:
                continue
            seen.add(instrument_id)
            out.append(instrument_id)
    return out


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    print({"cmd": " ".join(cmd)})
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Incremental tracked-stock news refresh")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument("--subscribed-only", action="store_true")
    parser.add_argument("--no-llm", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = str(args.universe or store.get_active_ai_universe(args.market) or "").strip()
    if not universe_id:
        raise ValueError(f"No active AI universe configured for {args.market}")

    instrument_ids = _tracked_ids(store, args.market)
    if not instrument_ids:
        print({"status": "noop", "reason": "no_tracked_ids"})
        return
    if args.dry_run:
        print({"status": "dry_run", "market": args.market, "universe_id": universe_id, "tracked_count": len(instrument_ids)})
        return

    with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as handle:
        changed_path = handle.name

    discovery_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        args.market,
        "--universe",
        universe_id,
        "--instrument-ids",
        ",".join(instrument_ids),
        "--incremental",
        "--discovery-only",
        "--emit-changed-instrument-ids-path",
        changed_path,
        "--upsert",
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(args.chunk_workers),
        "--skip-context",
        "--skip-materialize",
    ]
    try:
        discovery_result = _run(discovery_cmd)
        with open(changed_path, "r", encoding="utf-8") as handle:
            changed_ids = json.load(handle) or []
    finally:
        try:
            os.remove(changed_path)
        except OSError:
            pass
    changed_ids = [
        str(instrument_id).strip().upper()
        for instrument_id in changed_ids
        if str(instrument_id).strip()
    ]
    if not changed_ids:
        print({"status": "noop", "reason": "no_changed_tickers", "tracked_count": len(instrument_ids)})
        return

    synthesis_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        args.market,
        "--universe",
        universe_id,
        "--instrument-ids",
        ",".join(changed_ids),
        "--incremental",
        "--upsert",
        "--per-stock-cap",
        str(args.per_stock_cap),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(args.chunk_workers),
        "--grouped-stock-llm",
        "--skip-context",
        "--skip-av",
        "--skip-finnhub",
        "--skip-marketaux",
    ]
    synthesis_result = _run(synthesis_cmd)

    watchlist_cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_watchlist_views",
        "--instrument-ids",
        ",".join(changed_ids),
    ]
    if args.subscribed_only:
        watchlist_cmd.append("--subscribed-only")
    if args.no_llm:
        watchlist_cmd.append("--no-llm")
    watchlist_result = _run(watchlist_cmd)

    print(
        {
            "status": "success",
            "market": args.market,
            "universe_id": universe_id,
            "tracked_count": len(instrument_ids),
            "changed_count": len(changed_ids),
            "changed_ids": changed_ids,
            "discovery_stdout_tail": "\n".join(discovery_result.stdout.strip().splitlines()[-8:]) if discovery_result.stdout else "",
            "synthesis_stdout_tail": "\n".join(synthesis_result.stdout.strip().splitlines()[-8:]) if synthesis_result.stdout else "",
            "watchlist_stdout_tail": "\n".join(watchlist_result.stdout.strip().splitlines()[-8:]) if watchlist_result.stdout else "",
        }
    )


if __name__ == "__main__":
    main()
