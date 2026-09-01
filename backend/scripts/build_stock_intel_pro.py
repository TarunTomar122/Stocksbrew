"""Score each instrument on four pillars and persist to tm_stock_intel_pro.

Reads:
- Latest per-instrument Finviz snapshot from tm_stock_metrics_history/.../snapshots
- A ~30-day-old snapshot from the same collection (for delta catalysts)
- Latest sector benchmarks from tm_sector_benchmarks

Writes one doc per instrument under tm_stock_intel_pro/{market}__{universe}/stocks.
"""
from __future__ import annotations

import argparse
import math
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import get_coverage_universe_id, list_instruments
from backend.stock_scoring import score_stock
from backend.sector_slugs import resolve_sector_fields
from backend.storage import TraceMoneyStore


def _parse_instrument_ids(value: str | None) -> set[str] | None:
    if not value:
        return None
    ids = {item.strip().upper() for item in value.split(",") if item.strip()}
    return ids or None


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _enrich_snapshot_from_facts(
    snapshot: dict[str, Any],
    facts: dict[str, Any],
    latest_price: dict[str, Any],
) -> dict[str, Any]:
    """Fill sparse scraper metrics from the richer stock-page facts we already store."""
    metrics = dict(snapshot.get("metrics") or {})
    quick = facts.get("quick_stats") or {}
    financials = facts.get("financials") or {}
    quality = facts.get("quality") or {}
    valuation = facts.get("valuation") or {}
    analyst = facts.get("analyst") or {}
    returns = facts.get("returns") or {}
    history = [row for row in (facts.get("financial_history") or []) if isinstance(row, dict)]
    current = next((row for row in history if row.get("period") == "TTM"), history[0] if history else {})
    prior = next((row for row in history if row is not current), {})

    def add(key: str, value: Any) -> None:
        if _number(metrics.get(key)) is None and (number := _number(value)) is not None:
            metrics[key] = number

    add("pe", quick.get("pe_ttm"))
    add("fwd_pe", valuation.get("forward_pe"))
    add("target_price", analyst.get("target_price"))
    add("price", (latest_price.get("quote") or {}).get("current"))
    add("sales_yy_ttm", financials.get("revenue_growth_yoy_pct"))
    add("eps_next_y_growth", quick.get("eps_next_year_growth_pct"))
    current_eps, prior_eps = _number(current.get("eps_diluted")), _number(prior.get("eps_diluted"))
    if current_eps is not None and prior_eps not in (None, 0):
        add("eps_yy_ttm", ((current_eps - prior_eps) / abs(prior_eps)) * 100)
    add("roe", quality.get("roe_pct"))
    add("oper_margin", current.get("operating_margin_pct"))
    add("debt_eq", quality.get("debt_to_equity"))
    add("inst_own_pct", quick.get("institutional_ownership_pct"))
    add("recom", quick.get("recommendation_score"))
    add("perf_1m", returns.get("one_month_pct"))
    add("stock_cagr_1y", returns.get("one_year_pct"))
    sessions = latest_price.get("recent_sessions") or []
    if not sessions:
        window = latest_price.get("history_window") or []
        sessions = next(
            (
                row.get("recent_sessions") or []
                for row in reversed(window)
                if isinstance(row, dict) and row.get("recent_sessions")
            ),
            [],
        )
    closes = [_number(row.get("close")) for row in sessions if isinstance(row, dict)]
    closes = [close for close in closes if close is not None]
    if len(closes) >= 2 and closes[0] != 0:
        add("perf_1w", ((closes[-1] - closes[0]) / abs(closes[0])) * 100)
    buy, analyst_count = _number(analyst.get("buy")), _number(analyst.get("analyst_count"))
    if buy is not None and analyst_count not in (None, 0):
        add("analyst_buy_pct", (buy / analyst_count) * 100)

    return {**snapshot, "metrics": metrics}


def _resolve_instruments(
    store: TraceMoneyStore,
    market: str,
    universe_id: str,
    allowed_ids: set[str] | None,
) -> list[dict]:
    if not allowed_ids:
        return list_instruments(market, universe_id)
    market_catalog = list_instruments(market, None)
    by_id = {
        str(instrument.get("instrument_id", "")).upper(): instrument
        for instrument in market_catalog
    }
    resolved = [
        by_id[instrument_id]
        for instrument_id in sorted(allowed_ids)
        if instrument_id in by_id
    ]
    missing = [instrument_id for instrument_id in sorted(allowed_ids) if instrument_id not in by_id]
    if missing:
        refs = [store.db.collection("tm_instruments").document(instrument_id) for instrument_id in missing]
        for doc in store.db.get_all(refs):
            if not doc.exists:
                continue
            row = doc.to_dict() or {}
            if str(row.get("market") or "").upper() != market.upper():
                continue
            resolved.append(row)
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser(description="Score stocks on four pillars")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids for subset scoring")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.<MARKET>_price_universe or pass --universe."
        )
    benchmarks_doc = store.get_sector_benchmarks(args.market) or {}
    if not benchmarks_doc:
        print(f"[warn] no sector benchmarks found - valuation pillar will lack sector comps")

    coverage_universe_id = get_coverage_universe_id(args.market)
    use_coverage_sector_fallback = coverage_universe_id and coverage_universe_id != universe_id

    today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    allowed_ids = _parse_instrument_ids(args.instrument_ids)
    instruments = _resolve_instruments(store, args.market, universe_id, allowed_ids)
    instrument_ids = [instrument["instrument_id"] for instrument in instruments]
    facts_by_id = store.get_stock_facts_batch(instrument_ids)
    prices_by_id = store.get_latest_prices(instrument_ids)
    today_snaps = store.get_stock_metrics_snapshots_batch(instrument_ids, today_date)
    if len(today_snaps) < len(instrument_ids):
        latest_snaps = store.get_stock_metrics_snapshots_batch(instrument_ids)
        for instrument_id, snapshot in latest_snaps.items():
            today_snaps.setdefault(instrument_id, snapshot)
    saved = 0
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        today_snap = today_snaps.get(instrument_id) or store.get_latest_stock_metrics_snapshot(instrument_id)
        if not today_snap:
            print(f"  [skip] {instrument['ticker']}: no snapshot yet")
            continue
        today_snap = _enrich_snapshot_from_facts(
            today_snap,
            facts_by_id.get(instrument_id) or {},
            prices_by_id.get(instrument_id) or {},
        )
        sector_slug, sector_label = resolve_sector_fields(
            sector_slug=str(today_snap.get("sector_slug") or ""),
            sector_label=str(today_snap.get("sector_label") or ""),
            instrument_sector=str(instrument.get("sector") or ""),
            instrument_industry=str(instrument.get("industry") or ""),
        )
        if sector_slug and not today_snap.get("sector_slug"):
            today_snap = {**today_snap, "sector_slug": sector_slug, "sector_label": sector_label or today_snap.get("sector_label", "")}
        scored = score_stock(instrument, today_snap, None, benchmarks_doc)
        if use_coverage_sector_fallback and not str(scored.get("sector_slug") or "").strip():
            coverage_doc = store.get_stock_intel_pro(args.market, coverage_universe_id, instrument_id)
            if coverage_doc:
                for key in ("sector_slug", "sector_label", "industry_label"):
                    value = str(coverage_doc.get(key) or "").strip()
                    if value and not str(scored.get(key) or "").strip():
                        scored[key] = value
        store.save_stock_intel_pro(args.market, universe_id, instrument_id, scored)
        saved += 1

    store.save_stage_watermark(
        market=args.market,
        stage_key="build_stock_intel_pro",
        universe_id=universe_id,
        expected_count=len(instruments),
        success_count=saved,
        error_count=max(0, len(instruments) - saved),
        metadata={
            "as_of_date": today_date,
            "today_snapshot_count": len(today_snaps),
            "benchmarks_present": bool(benchmarks_doc),
        },
    )

    print(f"Scored {saved}/{len(instruments)} stocks for {args.market} / {universe_id}")


if __name__ == "__main__":
    main()
