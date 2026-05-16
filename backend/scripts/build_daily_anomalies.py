from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.stock_intelligence import build_no_news_intelligence_doc
from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _run_intelligence_fill_for_missing(
    *,
    market: str,
    universe_id: str,
    instrument_ids: list[str],
    per_stock_cap: int,
    chunk_workers: int,
    per_stock_lookback_hours: int,
) -> None:
    if not instrument_ids:
        return
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        market,
        "--universe",
        universe_id,
        "--instrument-ids",
        ",".join(instrument_ids),
        "--upsert",
        "--per-stock-cap",
        str(per_stock_cap),
        "--per-stock-lookback-hours",
        str(max(1, int(per_stock_lookback_hours))),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(chunk_workers),
        "--skip-context",
        "--skip-materialize",
    ]
    print({"stage": "fill_missing_intelligence", "instrument_count": len(instrument_ids), "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def _pick_row(
    instrument: dict[str, Any],
    quote_doc: dict[str, Any],
    intel_doc: dict[str, Any] | None,
) -> dict[str, Any] | None:
    quote = (quote_doc or {}).get("quote") or {}
    price = _to_float(quote.get("current"))
    day_change_pct = _to_float(quote.get("day_change_pct"))
    if price is None or day_change_pct is None:
        return None
    previous_close = _to_float(quote.get("previous_close"))
    day_change_abs = _to_float(quote.get("day_change_abs"))
    volume = _to_float(quote.get("volume"))

    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or "").strip().upper()
    headline = str((intel_doc or {}).get("headline") or "").strip() or None
    thesis = str((intel_doc or {}).get("thesis") or "").strip() or None
    brief = str((intel_doc or {}).get("today_brief") or "").strip() or None
    label = str((intel_doc or {}).get("overall_label") or "").strip() or None
    score = (intel_doc or {}).get("overall_score")
    overall_score = int(score) if isinstance(score, (int, float)) else None
    key_points = [str(p).strip() for p in ((intel_doc or {}).get("key_points") or []) if str(p).strip()][:4]
    visual_summary = (intel_doc or {}).get("visual_summary")
    if not isinstance(visual_summary, dict):
        visual_summary = None

    if not headline:
        sector = str(instrument.get("sector") or "").strip()
        if sector:
            headline = f"{ticker} is a top {direction} mover in {sector}."
        else:
            headline = f"{ticker} is a top {direction} mover today."
    if not brief:
        context = (
            f"relative to its prior close and peer moves"
            if previous_close is not None
            else "against the broader tape"
        )
        brief = (
            f"Move is driven by price momentum {context}. "
            "Watch for follow-through, catalyst updates, and reversal risk in the next session."
        )

    return {
        "instrument_id": instrument_id,
        "ticker": ticker,
        "name": str(instrument.get("name") or ticker),
        "sector": instrument.get("sector"),
        "industry": instrument.get("industry"),
        "logo_url": instrument.get("logo_url"),
        "price": price,
        "previous_close": previous_close,
        "day_change_pct": day_change_pct,
        "day_change_abs": day_change_abs,
        "volume": volume,
        "direction": "up" if day_change_pct >= 0 else "down",
        "headline": headline,
        "thesis": thesis,
        "today_brief": brief,
        "news_count": int((intel_doc or {}).get("news_count") or 0),
        "source_count": int((intel_doc or {}).get("source_count") or 0),
        "overall_score": overall_score,
        "overall_label": label,
        "catalyst": (intel_doc or {}).get("catalyst"),
        "risk": (intel_doc or {}).get("risk"),
        "key_points": key_points,
        "visual_summary": visual_summary,
        "overall_verdict": (intel_doc or {}).get("overall_verdict"),
        "comparative_context": (intel_doc or {}).get("comparative_context")
        if isinstance((intel_doc or {}).get("comparative_context"), dict)
        else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_daily_anomalies for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--threshold-pct", type=float, default=2.0)
    parser.add_argument("--limit", type=int, default=24)
    parser.add_argument("--enrich-missing", action="store_true")
    parser.add_argument("--per-stock-cap", type=int, default=3)
    parser.add_argument("--per-stock-lookback-hours", type=int, default=168)
    parser.add_argument("--chunk-workers", type=int, default=4)
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")

    instruments = list_instruments(args.market, universe_id)
    by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in instruments
        if str(row.get("instrument_id") or "").strip()
    }
    instrument_ids = list(by_id.keys())
    prices = store.get_latest_prices(instrument_ids)

    movers: list[tuple[str, float]] = []
    for instrument_id in instrument_ids:
        pct = _to_float(((prices.get(instrument_id) or {}).get("quote") or {}).get("day_change_pct"))
        if pct is None:
            continue
        if abs(pct) >= abs(args.threshold_pct):
            movers.append((instrument_id, abs(pct)))
    movers.sort(key=lambda item: item[1], reverse=True)
    selected_ids = [instrument_id for instrument_id, _ in movers[: max(0, args.limit)]]

    intelligence = store.get_stock_intelligence_docs_batch(args.market, universe_id, selected_ids)
    if args.enrich_missing:
        missing_ids = [
            instrument_id
            for instrument_id in selected_ids
            if not intelligence.get(instrument_id)
            or int((intelligence.get(instrument_id) or {}).get("news_count") or 0) <= 0
        ]
        _run_intelligence_fill_for_missing(
            market=args.market,
            universe_id=universe_id,
            instrument_ids=missing_ids,
            per_stock_cap=args.per_stock_cap,
            chunk_workers=args.chunk_workers,
            per_stock_lookback_hours=args.per_stock_lookback_hours,
        )
        intelligence = store.get_stock_intelligence_docs_batch(args.market, universe_id, selected_ids)

    if selected_ids:
        latest_prices = store.get_latest_prices(selected_ids)
        intel_pro_docs = store.get_stock_intel_pro_batch(args.market, universe_id, selected_ids)
        fallback_docs: dict[str, dict[str, Any]] = {}
        for instrument_id in selected_ids:
            existing = intelligence.get(instrument_id) or {}
            if str(existing.get("headline") or "").strip() and str(existing.get("today_brief") or "").strip():
                continue
            instrument = by_id.get(instrument_id) or {}
            fallback_doc = build_no_news_intelligence_doc(
                instrument=instrument,
                market=args.market,
                universe_id=universe_id,
                latest_price_doc=latest_prices.get(instrument_id),
                technical_doc=None,
                intel_pro_doc=intel_pro_docs.get(instrument_id),
                avg_volume=None,
                store=store,
            )
            if fallback_doc:
                fallback_docs[instrument_id] = fallback_doc
        if fallback_docs:
            for instrument_id, doc in fallback_docs.items():
                intelligence[instrument_id] = doc

    rows: list[dict[str, Any]] = []
    for instrument_id in selected_ids:
        row = _pick_row(
            by_id.get(instrument_id) or {},
            prices.get(instrument_id) or {},
            intelligence.get(instrument_id),
        )
        if row:
            rows.append(row)

    up_count = sum(1 for row in rows if str(row.get("direction")) == "up")
    down_count = sum(1 for row in rows if str(row.get("direction")) == "down")
    summary = f"{len(rows)} stocks moved {args.threshold_pct:.1f}%+ today ({up_count} up, {down_count} down)."

    payload = {
        "market": args.market,
        "generated_at": _now_iso(),
        "enriched_at": _now_iso(),
        "date": _today_utc(),
        "anomaly_count": len(rows),
        "threshold_pct": float(args.threshold_pct),
        "up_count": up_count,
        "down_count": down_count,
        "summary": summary,
        "anomalies": rows,
        "universe_id": universe_id,
    }
    store.db.collection("tm_daily_anomalies").document(f"{args.market}__latest").set(payload)
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_daily_anomalies",
        universe_id=universe_id,
        expected_count=len(selected_ids),
        success_count=len(rows),
        error_count=max(0, len(selected_ids) - len(rows)),
        metadata={
            "threshold_pct": args.threshold_pct,
            "limit": args.limit,
            "enrich_missing": bool(args.enrich_missing),
        },
    )
    print({"market": args.market, "selected": len(selected_ids), "written": len(rows)})


if __name__ == "__main__":
    main()
