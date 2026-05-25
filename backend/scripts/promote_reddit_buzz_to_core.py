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

from backend.scripts.process_stock_requests import (
    _load_symbol_master as _load_symbol_master_rows,
    _resolve_request_with_llm_fallback as _resolve_with_llm_fallback,
    _upsert_instrument as _upsert_resolved_instrument,
)
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


def _normalize_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\b(inc|inc\.|corp|corporation|ltd|limited|holdings?|company|co|plc|class a|class b)\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_tickers(payload: dict[str, Any], min_mentions: int) -> list[dict[str, Any]]:
    rows = payload.get("tickers") or []
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
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
        out.append(
            {
                "ticker": ticker,
                "mention_count": mentions,
                "company_name": str(row.get("company_name") or "").strip(),
                "exchange_hint": str(row.get("exchange_hint") or "").strip().upper(),
                "confidence": float(row.get("confidence") or 0.0),
            }
        )
    return out


def _resolve_instrument_ids(
    store: TraceMoneyStore,
    market: str,
    ticker_rows: list[dict[str, Any]],
    min_confidence: float,
    *,
    llm_fallback: bool,
) -> tuple[list[str], list[str], int]:
    resolved: list[str] = []
    unresolved: list[str] = []
    llm_resolved_count = 0
    market_key = str(market).upper()
    master_rows = _load_symbol_master_rows(store, market_key) if llm_fallback else []
    for row in ticker_rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        company_name = str(row.get("company_name") or "").strip()
        confidence = float(row.get("confidence") or 0.0)
        if confidence < min_confidence:
            unresolved.append(ticker)
            continue

        # Guardrail: avoid promoting private-company chatter under a public ticker.
        if ticker == "SPCE" and "space exploration technologies" in company_name.lower():
            unresolved.append(ticker)
            continue

        doc_id = f"{market_key}__{ticker}"
        sym_doc = store.db.collection("tm_symbol_master").document(doc_id).get()
        instrument_id = ""
        if sym_doc.exists:
            payload = sym_doc.to_dict() or {}
            master_name = _normalize_name(str(payload.get("name") or ""))
            llm_name = _normalize_name(str(row.get("company_name") or ""))
            name_ok = True
            if llm_name and master_name:
                name_ok = llm_name == master_name or llm_name in master_name or master_name in llm_name
            if name_ok:
                instrument_id = str(payload.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            fallback_id = f"{market_key}_{ticker}"
            inst_doc = store.db.collection("tm_instruments").document(fallback_id).get()
            if inst_doc.exists:
                instrument_id = fallback_id
        if not instrument_id and llm_fallback:
            query = company_name or ticker
            resolved = _resolve_with_llm_fallback(master_rows, market_key, query)
            if resolved:
                upserted = _upsert_resolved_instrument(store, resolved)
                candidate_id = str(upserted.get("instrument_id") or resolved.get("instrument_id") or "").strip().upper()
                if candidate_id:
                    instrument_id = candidate_id
                    llm_resolved_count += 1
        if instrument_id:
            resolved.append(instrument_id)
        else:
            unresolved.append(ticker)
    return resolved, unresolved, llm_resolved_count


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
    parser.add_argument("--min-confidence", type=float, default=0.55)
    parser.add_argument("--pause", type=float, default=0.35)
    parser.add_argument("--skip-backfill", action="store_true")
    parser.add_argument("--skip-llm-fallback", action="store_true")
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
    ticker_rows = _extract_tickers(payload, min_mentions=max(1, args.min_mentions))
    if not ticker_rows:
        print({"stage": "noop", "reason": "no_eligible_tickers", "market": market})
        return

    resolved_ids, unresolved, llm_resolved_count = _resolve_instrument_ids(
        store,
        market,
        ticker_rows,
        min_confidence=max(0.0, min(1.0, args.min_confidence)),
        llm_fallback=not bool(args.skip_llm_fallback),
    )
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
                "snapshot_tickers": len(ticker_rows),
                "resolved_ids": len(resolved_ids),
                "llm_resolved_ids": llm_resolved_count,
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
            "snapshot_tickers": len(ticker_rows),
            "resolved_ids": len(resolved_ids),
            "llm_resolved_ids": llm_resolved_count,
            "added_ids": len(added_ids),
            "override_total": total_override_count,
            "unresolved_tickers": unresolved[:20],
            "backfill_ran": bool(added_ids and not args.skip_backfill),
        }
    )


if __name__ == "__main__":
    main()
