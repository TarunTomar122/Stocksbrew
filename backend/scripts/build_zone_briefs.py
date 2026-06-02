"""Refresh AI news briefs for stocks in the market-anomaly and reddit-buzz zones.

A stock's brief only gets refreshed today if it sits in the active per-stock
universe or is paid-tracked. A name nobody watches (e.g. a stock that just
spiked 9% or lit up r/wallstreetbets) can carry a brief that's weeks stale -
which is exactly when its brief matters most. This job closes that gap: every
day it pulls the two "action" zones and rebuilds their briefs.

Zones:
- Market anomaly  -> tm_daily_anomalies/{MARKET}__latest (today's big movers).
- Reddit buzz     -> reddit_snapshots/{MARKET}__latest (resolved to instruments
                     via the same resolver promote_reddit_buzz_to_core uses).

Briefs are rebuilt under the active AI universe (the one the stock page reads),
so the refresh shows up regardless of whether the stock is in the base
universe. A staleness gate skips stocks whose brief is already fresh today, so
re-running the job is cheap.

Usage:
    python -m backend.scripts.build_zone_briefs --market US --dry-run
    python -m backend.scripts.build_zone_briefs --market US
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from backend.scripts.promote_reddit_buzz_to_core import (
    _extract_tickers,
    _resolve_instrument_ids,
)
from backend.storage import TraceMoneyStore


def _parse_iso(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _anomaly_instrument_ids(store: TraceMoneyStore, market: str) -> list[str]:
    doc = store.db.collection("tm_daily_anomalies").document(f"{market}__latest").get()
    if not doc.exists:
        return []
    payload = doc.to_dict() or {}
    out: list[str] = []
    seen: set[str] = set()
    for row in payload.get("anomalies") or []:
        if not isinstance(row, dict):
            continue
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            out.append(instrument_id)
    return out


def _reddit_instrument_ids(
    store: TraceMoneyStore,
    market: str,
    *,
    min_mentions: int,
    min_confidence: float,
    llm_fallback: bool,
) -> list[str]:
    doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    if not doc.exists:
        return []
    payload = doc.to_dict() or {}
    ticker_rows = _extract_tickers(payload, min_mentions=max(1, min_mentions))
    if not ticker_rows:
        return []
    resolved, _unresolved, _llm = _resolve_instrument_ids(
        store,
        market,
        ticker_rows,
        min_confidence=max(0.0, min(1.0, min_confidence)),
        llm_fallback=llm_fallback,
    )
    out: list[str] = []
    seen: set[str] = set()
    for instrument_id in resolved:
        iid = str(instrument_id or "").strip().upper()
        if iid and iid not in seen:
            seen.add(iid)
            out.append(iid)
    return out


def _is_fresh(doc: dict[str, Any] | None, cutoff: datetime | None) -> bool:
    """A brief is fresh if it exists, carries real news, and is newer than cutoff."""
    if not doc:
        return False
    if cutoff is None:
        return False  # max-age 0 -> never treat anything as fresh (always refresh)
    if int(doc.get("news_count") or 0) <= 0:
        return False
    ts = _parse_iso(str(doc.get("generated_at") or doc.get("as_of") or doc.get("updated_at") or ""))
    if ts is None:
        return False
    return ts >= cutoff


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh AI briefs for anomaly + reddit-buzz zone stocks"
    )
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument(
        "--max-age-hours",
        type=int,
        default=24,
        help="Skip stocks whose brief is newer than this (0 = always refresh).",
    )
    parser.add_argument("--reddit-min-mentions", type=int, default=1)
    parser.add_argument("--reddit-min-confidence", type=float, default=0.55)
    parser.add_argument(
        "--reddit-llm-fallback",
        action="store_true",
        help="Allow LLM resolution of ambiguous buzz tickers (slower, upserts instruments).",
    )
    parser.add_argument("--per-stock-cap", type=int, default=5)
    parser.add_argument("--per-stock-lookback-hours", type=int, default=72)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = args.market.upper()
    ai_universe = str(
        store.get_active_ai_universe(market) or store.get_active_price_universe(market) or ""
    ).strip()
    if not ai_universe:
        raise ValueError(f"No active AI/price universe configured for {market}")

    anomaly_ids = _anomaly_instrument_ids(store, market)
    reddit_ids = _reddit_instrument_ids(
        store,
        market,
        min_mentions=args.reddit_min_mentions,
        min_confidence=args.reddit_min_confidence,
        llm_fallback=bool(args.reddit_llm_fallback),
    )

    # Union, tracking which zone(s) each id came from for the summary.
    source_by_id: dict[str, list[str]] = {}
    for iid in anomaly_ids:
        source_by_id.setdefault(iid, []).append("anomaly")
    for iid in reddit_ids:
        source_by_id.setdefault(iid, []).append("reddit")
    candidate_ids = list(source_by_id.keys())

    if not candidate_ids:
        print(json.dumps({"status": "noop", "reason": "no_zone_stocks", "market": market}))
        return

    # Staleness gate against the AI universe (the one the stock page reads).
    cutoff = None
    if args.max_age_hours > 0:
        cutoff = datetime.now(timezone.utc).timestamp() - (args.max_age_hours * 3600)
        cutoff = datetime.fromtimestamp(cutoff, tz=timezone.utc)
    existing = store.get_stock_intelligence_docs_batch(market, ai_universe, candidate_ids)
    refresh_ids = [iid for iid in candidate_ids if not _is_fresh(existing.get(iid), cutoff)]
    skipped_fresh = [iid for iid in candidate_ids if iid not in refresh_ids]

    summary = {
        "market": market,
        "ai_universe": ai_universe,
        "anomaly_zone": len(anomaly_ids),
        "reddit_zone": len(reddit_ids),
        "candidates": len(candidate_ids),
        "to_refresh": len(refresh_ids),
        "skipped_fresh": len(skipped_fresh),
        "refresh_ids": refresh_ids,
    }

    if args.dry_run:
        print(json.dumps({"status": "dry_run", **summary}, indent=2, ensure_ascii=True))
        return

    if not refresh_ids:
        print(json.dumps({"status": "ok", "reason": "all_fresh", **summary}))
        return

    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        market,
        "--instrument-ids",
        ",".join(refresh_ids),
        "--include-no-news",
        "--upsert",
        "--per-stock-cap",
        str(max(1, args.per_stock_cap)),
        "--per-stock-lookback-hours",
        str(max(1, args.per_stock_lookback_hours)),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(max(1, args.chunk_workers)),
        "--skip-context",
        "--skip-materialize",
    ]
    print(json.dumps({"status": "running", "cmd": " ".join(cmd), **summary}, ensure_ascii=True))
    subprocess.run(cmd, check=True)
    print(json.dumps({"status": "ok", **summary}, ensure_ascii=True))


if __name__ == "__main__":
    main()
