"""Compose materialized stock-page view docs for a market/universe.

This is the initial backfill + universe-refresh job for
`tm_stock_page_views/{market}__{instrument_id}`. Ongoing freshness is NOT this
script's job: every source writer (storage.save_* methods, earnings/pre-earnings
builders) merges its section into the view doc in the same batch, so source and
view can never drift apart.

Usage:
  python3 -m backend.scripts.build_stock_page_views --market US
  python3 -m backend.scripts.build_stock_page_views --market US --instrument-ids US_AAPL,US_KO
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import (
    get_coverage_universe_id,
    list_instruments,
    list_intel_universe_ids,
)
from backend.sector_slugs import resolve_sector_fields
from backend.stock_page_view import build_stock_page_view_docs
from backend.storage import TraceMoneyStore, _serialize

MIN_FUNDAMENTALS_COVERAGE = 0.5


def _pillar_coverage(pillar: dict[str, Any]) -> float:
    coverage = pillar.get("coverage")
    if isinstance(coverage, (int, float)):
        return max(0.0, min(1.0, float(coverage)))
    metrics = pillar.get("metrics") or []
    if not metrics:
        return 0.0
    total_weight = sum(float((m or {}).get("weight", 1)) for m in metrics)
    available = sum(
        float((m or {}).get("weight", 1))
        for m in metrics
        if (m or {}).get("score") is not None
    )
    return available / total_weight if total_weight > 0 else 0.0


def _overall_coverage(intel: dict[str, Any]) -> float | None:
    coverage = (intel.get("overall") or {}).get("coverage")
    if isinstance(coverage, (int, float)):
        return max(0.0, min(1.0, float(coverage)))
    return None


def intel_has_composite_score(intel: dict[str, Any]) -> bool:
    score = (intel.get("overall") or {}).get("score")
    pillars = intel.get("pillars") or {}
    if not isinstance(score, (int, float)) or not pillars:
        return False
    coverage = _overall_coverage(intel)
    return coverage is None or coverage >= MIN_FUNDAMENTALS_COVERAGE


def intel_quality_score(intel: dict[str, Any]) -> int:
    """Mirror the frontend pick: prefer coverage-aware, populated pillars."""
    pillars = list((intel.get("pillars") or {}).values())
    coverage_aware = sum(
        1 for p in pillars if isinstance(p, dict) and isinstance(p.get("coverage"), (int, float))
    )
    scored = sum(1 for p in pillars if isinstance(p, dict) and (p.get("score") or 0) > 0)
    scored_metrics = sum(
        1
        for p in pillars
        if isinstance(p, dict)
        for m in (p.get("metrics") or [])
        if isinstance(m, dict) and isinstance(m.get("score"), (int, float))
    )
    overall = float((intel.get("overall") or {}).get("score") or 0)
    return coverage_aware * 100_000 + scored * 1000 + scored_metrics * 10 + int(overall)


def _sector_slug_for(intel: dict[str, Any], instrument_by_id: dict[str, dict[str, Any]]) -> str:
    instrument = instrument_by_id.get(str(intel.get("instrument_id") or "")) or {}
    slug, _label = resolve_sector_fields(
        sector_slug=str(intel.get("sector_slug") or ""),
        sector_label=str(intel.get("sector_label") or ""),
        instrument_sector=str(instrument.get("sector") or ""),
        instrument_industry=str(instrument.get("industry") or ""),
    )
    return slug


def _peer_pick_row(intel: dict[str, Any]) -> dict[str, Any]:
    return {
        "instrument_id": str(intel.get("instrument_id") or ""),
        "ticker": str(intel.get("ticker") or ""),
        "score": float((intel.get("overall") or {}).get("score") or 0),
        "verdict": str((intel.get("overall") or {}).get("verdict") or ""),
    }


def _peer_row(
    intel: dict[str, Any],
    instrument_by_id: dict[str, dict[str, Any]],
    prices_by_id: dict[str, dict[str, Any]],
    facts_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    instrument_id = str(intel.get("instrument_id") or "")
    instrument = instrument_by_id.get(instrument_id) or {}
    price = prices_by_id.get(instrument_id) or {}
    facts = facts_by_id.get(instrument_id) or {}
    quote = price.get("quote") or {}
    quick_stats = facts.get("quick_stats") or {}
    financials = facts.get("financials") or {}
    fundamentals = price.get("fundamentals") or {}
    overall = intel.get("overall") or {}
    scored = intel_has_composite_score(intel)
    score = overall.get("score")
    market_cap = quick_stats.get("market_cap")
    pe_ttm = quick_stats.get("pe_ttm")
    return {
        "instrument_id": instrument_id,
        "ticker": str(instrument.get("ticker") or intel.get("ticker") or ""),
        "name": str(
            instrument.get("name")
            or intel.get("industry_label")
            or overall.get("verdict")
            or ""
        ),
        "score": float(score) if scored and isinstance(score, (int, float)) else None,
        "verdict": str(overall.get("verdict") or ""),
        "price": float(quote["current"]) if isinstance(quote.get("current"), (int, float)) else None,
        "day_change_pct": (
            float(quote["day_change_pct"]) if isinstance(quote.get("day_change_pct"), (int, float)) else None
        ),
        "market_cap": market_cap if market_cap is not None else fundamentals.get("market_cap"),
        "pe_ttm": pe_ttm if pe_ttm is not None else fundamentals.get("pe_ttm"),
        "revenue_growth_yoy_pct": financials.get("revenue_growth_yoy_pct"),
    }


def compute_peers_for_market(
    intel_docs: list[dict[str, Any]],
    instrument_by_id: dict[str, dict[str, Any]],
    prices_by_id: dict[str, dict[str, Any]],
    facts_by_id: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Peers per instrument_id: `{better: [...], rows: [...]}`."""
    by_sector: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for intel in intel_docs:
        if not intel_has_composite_score(intel):
            continue
        slug = _sector_slug_for(intel, instrument_by_id)
        if slug:
            by_sector[slug].append(intel)

    peers_by_id: dict[str, dict[str, Any]] = {}
    for members in by_sector.values():
        ranked = sorted(
            members,
            key=lambda row: float((row.get("overall") or {}).get("score") or 0),
            reverse=True,
        )
        for intel in members:
            instrument_id = str(intel.get("instrument_id") or "")
            own_score = float((intel.get("overall") or {}).get("score") or 0)
            others = [row for row in ranked if str(row.get("instrument_id") or "") != instrument_id]
            better = [
                row
                for row in others
                if float((row.get("overall") or {}).get("score") or 0) > own_score
            ][:4]
            peers_by_id[instrument_id] = {
                "better": [_peer_pick_row(row) for row in better],
                "rows": [
                    _peer_row(row, instrument_by_id, prices_by_id, facts_by_id)
                    for row in others[:6]
                ],
            }
    return peers_by_id


def build_view_rows(
    store: TraceMoneyStore,
    market: str,
    instruments: list[dict[str, Any]],
    intel_universes: list[str],
) -> tuple[list[dict[str, Any]], int]:
    instrument_ids = [str(instrument["instrument_id"]) for instrument in instruments]
    instrument_by_id = {str(instrument["instrument_id"]): instrument for instrument in instruments}

    facts_by_id = store.get_stock_facts_batch(instrument_ids)
    prices_by_id = store.get_latest_prices(instrument_ids)
    technicals_by_id = store.get_latest_stock_technicals_batch(instrument_ids)

    intelligence_by_id: dict[str, dict[str, Any]] = {}
    questions_by_id: dict[str, dict[str, Any]] = {}
    intel_pro_by_id: dict[str, dict[str, Any]] = {}
    for universe_id in intel_universes:
        for instrument_id, doc in store.get_stock_intelligence_docs_batch(market, universe_id, instrument_ids).items():
            intelligence_by_id.setdefault(instrument_id, doc)
        for instrument_id, doc in store.get_business_questions_docs_batch(market, universe_id, instrument_ids).items():
            questions_by_id.setdefault(instrument_id, doc)
        for instrument_id, doc in store.get_stock_intel_pro_batch(market, universe_id, instrument_ids).items():
            existing = intel_pro_by_id.get(instrument_id)
            if existing is None or intel_quality_score(doc) > intel_quality_score(existing):
                intel_pro_by_id[instrument_id] = doc

    # Instrument views live under tm_views_instrument/{iid}__{price_universe}.
    instrument_view_by_id: dict[str, dict[str, Any]] = {}
    for start in range(0, len(instrument_ids), 500):
        chunk = instrument_ids[start : start + 500]
        refs = [
            store.db.collection("tm_views_instrument").document(f"{iid}__{universe_id}")
            for iid in chunk
        ]
        for doc in store.db.get_all(refs):
            if doc.exists:
                instrument_view_by_id[doc.id.split("__", 1)[0]] = _serialize(doc.to_dict()) or {}

    earnings_by_id: dict[str, dict[str, Any]] = {}
    pre_earnings_by_id: dict[str, dict[str, Any]] = {}
    for start in range(0, len(instrument_ids), 500):
        chunk = instrument_ids[start : start + 500]
        earnings_refs = [
            store.db.collection("tm_earnings_intel").document(f"{market}__{iid}__latest")
            for iid in chunk
        ]
        pre_refs = [
            store.db.collection("tm_pre_earnings_intel").document(f"{market}__{iid}__upcoming")
            for iid in chunk
        ]
        for doc in store.db.get_all(earnings_refs):
            if doc.exists:
                earnings_by_id[doc.id.split("__", 1)[1].rsplit("__", 1)[0]] = _serialize(doc.to_dict()) or {}
        for doc in store.db.get_all(pre_refs):
            if doc.exists:
                pre_earnings_by_id[doc.id.split("__", 1)[1].rsplit("__", 1)[0]] = _serialize(doc.to_dict()) or {}

    # Peer pools need intel from every intel namespace (not just the runtime one).
    all_intel_docs: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for universe_id in intel_universes:
        for doc in store.list_stock_intel_pro(market, universe_id):
            instrument_id = str(doc.get("instrument_id") or "")
            if not instrument_id or instrument_id in seen_ids:
                continue
            seen_ids.add(instrument_id)
            all_intel_docs.append(doc)

    extra_ids = [iid for iid in seen_ids if iid not in instrument_by_id]
    if extra_ids:
        try:
            for instrument in list_instruments(market, None):
                instrument_by_id.setdefault(str(instrument["instrument_id"]), instrument)
        except (ValueError, KeyError):
            pass
        for instrument_id, payload in store.get_latest_prices(extra_ids).items():
            prices_by_id.setdefault(instrument_id, payload)
        for instrument_id, payload in store.get_stock_facts_batch(extra_ids).items():
            facts_by_id.setdefault(instrument_id, payload)

    # Display names come from the tm_instruments docs (same source the direct
    # reader used), falling back to the universe catalog entry.
    all_ids = list(dict.fromkeys(instrument_ids + list(seen_ids)))
    for start in range(0, len(all_ids), 500):
        chunk = all_ids[start : start + 500]
        refs = [store.db.collection("tm_instruments").document(iid) for iid in chunk]
        for doc in store.db.get_all(refs):
            if not doc.exists:
                continue
            data = _serialize(doc.to_dict()) or {}
            instrument_id = str(data.get("instrument_id") or doc.id)
            instrument_by_id.setdefault(instrument_id, {})
            merged = {**instrument_by_id.get(instrument_id, {}), **data}
            instrument_by_id[instrument_id] = merged

    peers_by_id = compute_peers_for_market(all_intel_docs, instrument_by_id, prices_by_id, facts_by_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    for instrument in instruments:
        instrument_id = str(instrument["instrument_id"])
        rows.append(
            {
                "instrument_id": instrument_id,
                "built_at": now_iso,
                "intelligence": intelligence_by_id.get(instrument_id),
                "business_questions": questions_by_id.get(instrument_id),
                "instrument_view": instrument_view_by_id.get(instrument_id),
                "intel_pro": intel_pro_by_id.get(instrument_id),
                "facts": facts_by_id.get(instrument_id),
                "technicals": technicals_by_id.get(instrument_id),
                "earnings_intel": earnings_by_id.get(instrument_id),
                "pre_earnings": pre_earnings_by_id.get(instrument_id),
                "peers": peers_by_id.get(instrument_id),
            }
        )
    return rows, len(all_intel_docs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize stock page view docs")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--instrument-ids", default="", help="Comma-separated subset (default: full universe)")
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = args.market.upper()
    universe_id = store.get_active_price_universe(market)
    if not universe_id:
        raise SystemExit(f"No active price universe configured for {market}")
    intel_universes = list_intel_universe_ids(market, store)
    coverage_universe_id = get_coverage_universe_id(market)

    instruments: list[dict[str, Any]] = []
    seen: set[str] = set()
    for u in dict.fromkeys([universe_id, coverage_universe_id]):
        if not u:
            continue
        try:
            for instrument in list_instruments(market, u):
                iid = str(instrument["instrument_id"])
                if iid not in seen:
                    seen.add(iid)
                    instruments.append(instrument)
        except ValueError:
            continue
    if args.instrument_ids:
        allowed = {x.strip().upper() for x in args.instrument_ids.split(",") if x.strip()}
        instruments = [i for i in instruments if str(i["instrument_id"]).upper() in allowed]

    print({"market": market, "intel_universes": intel_universes, "instruments": len(instruments)})
    if not instruments:
        return

    rows, peer_pool = build_view_rows(store, market, instruments, intel_universes)
    if args.dry_run:
        sample = next(
            (row for row in rows if row.get("intelligence") or row.get("intel_pro") or row.get("facts")),
            None,
        )
        present = sorted(key for key in ("intelligence", "business_questions", "instrument_view", "intel_pro", "facts", "technicals", "earnings_intel", "pre_earnings", "peers") if sample and sample.get(key))
        print({"dry_run": True, "rows": len(rows), "peer_pool": peer_pool, "sample_sections": present})
        return
    saved = build_stock_page_view_docs(store.db, market, rows, batch_size=args.batch_size)
    print({"status": "ok", "market": market, "rows": len(rows), "saved": saved})


if __name__ == "__main__":
    main()
