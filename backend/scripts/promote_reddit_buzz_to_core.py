"""Promote Reddit buzz tickers into extended core overrides.

Flow:
1) Read `reddit_snapshots/{MARKET}__latest`
2) Resolve tickers -> instrument ids via tm_symbol_master (fallback: tm_instruments)
3) Merge into tm_config/price_core_overrides.{MARKET}
4) Optionally run immediate per-stock backfill for newly promoted ids
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from backend.storage import TraceMoneyStore


SAFE_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")
BLOCKLIST = {
    "THE",
    "THIS",
    "THAT",
    "WITH",
    "FROM",
    "WILL",
    "YOUR",
    "HTTP",
    "HTTPS",
    "WWW",
    "HREF",
    "COM",
    "NET",
    "ORG",
    "TO",
    "IS",
    "IT",
    "A",
    "AN",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_tickers(payload: dict[str, Any], min_mentions: int) -> list[str]:
    rows = payload.get("tickers") or []
    if not isinstance(rows, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        mentions = int(row.get("mention_count") or 0)
        if mentions < min_mentions:
            continue
        if not SAFE_TICKER_RE.match(ticker):
            continue
        if ticker in BLOCKLIST:
            continue
        if ticker in seen:
            continue
        seen.add(ticker)
        out.append(ticker)
    return out


def _resolve_instrument_ids(store: TraceMoneyStore, market: str, tickers: list[str]) -> tuple[list[str], list[str]]:
    resolved: list[str] = []
    unresolved: list[str] = []
    market_key = str(market).upper()
    for ticker in tickers:
        doc_id = f"{market_key}__{ticker}"
        sym_doc = store.db.collection("tm_symbol_master").document(doc_id).get()
        instrument_id = ""
        if sym_doc.exists:
            payload = sym_doc.to_dict() or {}
            instrument_id = str(payload.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            fallback_id = f"{market_key}_{ticker}"
            inst_doc = store.db.collection("tm_instruments").document(fallback_id).get()
            if inst_doc.exists:
                instrument_id = fallback_id
        if instrument_id:
            resolved.append(instrument_id)
        else:
            unresolved.append(ticker)
    return resolved, unresolved


def _save_promoted_tickers(store: TraceMoneyStore, market: str, instrument_ids: list[str]) -> None:
    current = store.get_promoted_tickers(market)
    by_id = {
        str(item.get("instrument_id") or "").strip().upper(): item
        for item in current
        if isinstance(item, dict)
    }
    changed = False
    for instrument_id in instrument_ids:
        if instrument_id in by_id:
            continue
        ticker = instrument_id.split("_", 1)[-1]
        by_id[instrument_id] = {
            "ticker": ticker,
            "instrument_id": instrument_id,
            "display_name": ticker,
            "lane": "reddit_buzz_promoted",
            "score": 1.0,
            "updated_at": _now_iso(),
        }
        changed = True
    if changed:
        rows = list(by_id.values())
        rows.sort(key=lambda row: str(row.get("ticker") or ""))
        store.save_promoted_tickers(market, rows)


def _update_overrides(store: TraceMoneyStore, market: str, resolved_ids: list[str], max_add: int) -> tuple[list[str], int]:
    cap = 500 if str(market).upper() == "US" else 250
    existing = store.get_price_core_overrides(market)
    seen = set(existing)
    added: list[str] = []
    for iid in resolved_ids:
        iid_u = str(iid or "").strip().upper()
        if not iid_u or iid_u in seen:
            continue
        if len(added) >= max(0, max_add):
            break
        seen.add(iid_u)
        existing.append(iid_u)
        added.append(iid_u)
    if added:
        if len(existing) > cap:
            existing = existing[-cap:]
        store.db.collection("tm_config").document("price_core_overrides").set(
            {str(market).upper(): existing, "updated_at": _now_iso()},
            merge=True,
        )
    return added, len(existing)


def _run_backfill(market: str, universe: str, instrument_ids: list[str], max_backfill: int, pause: float) -> None:
    target = instrument_ids[: max(0, max_backfill)]
    if not target:
        return
    joined = ",".join(target)
    common = ["--market", market, "--universe", universe, "--instrument-ids", joined]
    cmds = [
        [sys.executable, "-m", "backend.scripts.sync_stock_metrics", *common, "--max-workers", "2", "--pause", str(pause)],
        [sys.executable, "-m", "backend.scripts.build_stock_intel_pro", *common],
        [sys.executable, "-m", "backend.scripts.build_stock_technicals", *common, "--finviz-workers", "2"],
    ]
    for cmd in cmds:
        print({"stage": "backfill", "cmd": " ".join(cmd), "count": len(target)})
        subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote Reddit buzz tickers into price_core_overrides")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default="")
    parser.add_argument("--min-mentions", type=int, default=1)
    parser.add_argument("--max-add", type=int, default=8)
    parser.add_argument("--max-backfill", type=int, default=6)
    parser.add_argument("--pause", type=float, default=0.35)
    parser.add_argument("--skip-backfill", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = str(args.market).upper()
    universe = str(args.universe or store.get_active_price_universe(market) or "").strip()
    if not universe:
        raise ValueError(f"No active universe for {market}")

    snap_doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    if not snap_doc.exists:
        print({"stage": "noop", "reason": "missing_reddit_snapshot", "market": market})
        return

    payload = snap_doc.to_dict() or {}
    tickers = _extract_tickers(payload, min_mentions=max(1, args.min_mentions))
    if not tickers:
        print({"stage": "noop", "reason": "no_eligible_tickers", "market": market})
        return

    resolved_ids, unresolved = _resolve_instrument_ids(store, market, tickers)
    current_overrides = store.get_price_core_overrides(market)
    current_set = set(current_overrides)
    would_add: list[str] = []
    for iid in resolved_ids:
        if iid in current_set:
            continue
        if len(would_add) >= max(0, args.max_add):
            break
        current_set.add(iid)
        would_add.append(iid)

    if args.dry_run:
        print(
            {
                "market": market,
                "snapshot_tickers": len(tickers),
                "resolved_ids": len(resolved_ids),
                "would_add_ids": len(would_add),
                "override_total_after": len(current_overrides) + len(would_add),
                "unresolved_tickers": unresolved[:20],
                "backfill_would_run": bool(would_add and not args.skip_backfill),
            }
        )
        return

    added_ids, total_override_count = _update_overrides(store, market, resolved_ids, max_add=args.max_add)
    if added_ids:
        _save_promoted_tickers(store, market, added_ids)

    if added_ids and not args.skip_backfill:
        _run_backfill(
            market=market,
            universe=universe,
            instrument_ids=added_ids,
            max_backfill=args.max_backfill,
            pause=args.pause,
        )

    print(
        {
            "market": market,
            "snapshot_tickers": len(tickers),
            "resolved_ids": len(resolved_ids),
            "added_ids": len(added_ids),
            "override_total": total_override_count,
            "unresolved_tickers": unresolved[:20],
            "backfill_ran": bool(added_ids and not args.skip_backfill),
        }
    )


if __name__ == "__main__":
    main()
