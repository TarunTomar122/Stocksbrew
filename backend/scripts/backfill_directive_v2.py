from __future__ import annotations

import argparse
from typing import Any

from backend.directive_v2 import build_directive_v2
from backend.stock_intelligence import (
    _build_anomaly_digest,
    _build_news_digest,
    _extract_analyst_from_intel_pro,
    _summarize_intel_pro,
    _summarize_price_context,
    _visual_cards,
)
from backend.storage import TraceMoneyStore


def _ticker_from_instrument_id(instrument_id: str) -> str:
    return instrument_id.split("_", 1)[-1].strip().upper()


def _hydrate_doc(
    *,
    market: str,
    doc: dict[str, Any],
    latest: dict[str, Any],
    intel: dict[str, Any],
    anomaly_doc: dict[str, Any] | None,
) -> dict[str, Any]:
    instrument_id = str(doc.get("instrument_id") or "").strip().upper()
    history = latest.get("history_window") if isinstance(latest.get("history_window"), list) else []
    current = doc.get("current_price")
    if current is None:
        quote = latest.get("quote") if isinstance(latest.get("quote"), dict) else {}
        current = quote.get("current")
    try:
        current_float = float(current) if current is not None else None
    except Exception:
        current_float = None

    _, analyst_target, _ = _extract_analyst_from_intel_pro(intel, current_float)
    visual = doc.get("visual_summary") if isinstance(doc.get("visual_summary"), dict) else {}
    timeline = doc.get("timeline") if isinstance(doc.get("timeline"), list) else []
    data_quality = doc.get("data_quality") if isinstance(doc.get("data_quality"), dict) else {}
    return {
        **doc,
        "current_price": current_float if current_float is not None else doc.get("current_price"),
        "analyst_target": analyst_target,
        "fundamentals": _summarize_intel_pro(intel),
        "price_context": _summarize_price_context(latest, None, history),
        "news_digest": _build_news_digest(
            recent_news=[],
            timeline=timeline,
            visual_summary=visual,
            freshness_hours=float(data_quality.get("freshness_hours") or 999),
        ),
        "anomaly_digest": _build_anomaly_digest(anomaly_doc),
    }


def _existing_visual_cards(doc: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    cards = doc.get("visual_cards") if isinstance(doc.get("visual_cards"), dict) else {}
    visual = doc.get("visual_summary") if isinstance(doc.get("visual_summary"), dict) else {}
    out = _visual_cards(
        drivers=list(cards.get("drivers") or visual.get("drivers") or []),
        catalyst_cards=list(cards.get("catalyst_cards") or visual.get("catalyst_cards") or []),
        risk_cards=list(cards.get("risk_cards") or visual.get("risk_cards") or []),
    )
    if not any(out.values()):
        points = [str(point).strip() for point in (doc.get("key_points") or []) if str(point).strip()]
        out["drivers"] = [
            {"label": point[:80], "detail": point, "direction": "mixed", "strength": 3, "horizon": "week"}
            for point in points[:3]
        ]
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill directive_v2 on existing stock intelligence docs.")
    parser.add_argument("--market", default="US")
    parser.add_argument("--universe", default="")
    parser.add_argument("--tickers", default="", help="Comma-separated tickers. Empty means all docs in namespace.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    market = str(args.market or "US").strip().upper()
    store = TraceMoneyStore()
    universe = str(args.universe or "").strip() or store.get_active_ai_universe(market) or store.get_active_price_universe(market)
    if not universe:
        raise SystemExit(f"No active universe found for {market}")

    tickers = [raw.strip().upper() for raw in args.tickers.split(",") if raw.strip()]
    if tickers:
        docs = []
        for ticker in tickers:
            doc = store.get_stock_intelligence_doc(market, universe, f"{market}_{ticker}")
            if doc:
                docs.append(doc)
    else:
        docs = store.list_stock_intelligence_docs(market, universe)

    instrument_ids = [str(doc.get("instrument_id") or "").strip().upper() for doc in docs if str(doc.get("instrument_id") or "").strip()]
    tickers = [_ticker_from_instrument_id(instrument_id) for instrument_id in instrument_ids]
    latest_by_id = store.get_latest_prices(instrument_ids) if instrument_ids else {}
    intel_by_id = store.get_stock_intel_pro_batch(market, universe, instrument_ids) if instrument_ids else {}
    anomaly_by_doc_id = store.get_daily_anomaly_ticker_docs_batch(market, tickers) if tickers else {}

    updates: list[dict[str, Any]] = []
    for doc in docs:
        instrument_id = str(doc.get("instrument_id") or "").strip().upper()
        if not instrument_id:
            continue
        ticker = _ticker_from_instrument_id(instrument_id)
        visual_cards = _existing_visual_cards(doc)
        hydrated = _hydrate_doc(
            market=market,
            doc=doc,
            latest=latest_by_id.get(instrument_id) or {},
            intel=intel_by_id.get(instrument_id) or {},
            anomaly_doc=anomaly_by_doc_id.get(f"{market}__{ticker}"),
        )
        hydrated["visual_cards"] = visual_cards
        directive_v2 = build_directive_v2(
            hydrated,
            previous_v2=doc.get("directive_v2") if isinstance(doc.get("directive_v2"), dict) else None,
        )
        updates.append({
            "instrument_id": instrument_id,
            "directive_v2": directive_v2,
            "visual_cards": visual_cards,
        })

    if not args.dry_run and updates:
        store.upsert_stock_intelligence_docs(market, universe, updates)

    print({
        "market": market,
        "universe": universe,
        "found": len(docs),
        "updated": len(updates),
        "dry_run": bool(args.dry_run),
    })


if __name__ == "__main__":
    main()
