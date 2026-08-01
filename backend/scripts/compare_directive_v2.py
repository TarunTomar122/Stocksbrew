from __future__ import annotations

import argparse
import json
from typing import Any

from backend.directive_v2 import build_directive_v2
from backend.stock_intelligence import (
    _build_anomaly_digest,
    _build_news_digest,
    _extract_analyst_from_intel_pro,
    _load_options_digests,
    _summarize_intel_pro,
    _summarize_price_context,
)
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare stored directive_v2 against a fresh deterministic rebuild")
    parser.add_argument("--market", default="US")
    parser.add_argument("--universe", default="")
    parser.add_argument("--tickers", default="NVDA,MSFT,RKLB,AVGO,MSTR,OKLO")
    parser.add_argument("--with-options", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    market = str(args.market or "US").upper()
    store = TraceMoneyStore()
    universe = str(args.universe or "").strip() or store.get_active_ai_universe(market) or store.get_active_price_universe(market)
    if not universe:
        raise SystemExit(f"No active universe found for {market}")

    option_digests: dict[str, dict[str, Any]] = {}
    ticker_list = [raw.strip().upper() for raw in args.tickers.split(",") if raw.strip()]
    if args.with_options and market == "US":
        option_digests = _load_options_digests(
            [{"instrument_id": f"{market}_{ticker}", "ticker": ticker} for ticker in ticker_list],
            market=market,
            store=store,
        )

    rows: list[dict[str, Any]] = []
    for ticker in ticker_list:
        if not ticker:
            continue
        instrument_id = f"{market}_{ticker}"
        doc = store.get_stock_intelligence_doc(market, universe, instrument_id)
        if not doc:
            rows.append({"ticker": ticker, "error": "missing stock_intelligence doc"})
            continue
        latest = store.get_latest_prices([instrument_id]).get(instrument_id) or {}
        history = store.get_price_history(instrument_id, limit=20)
        intel = store.get_stock_intel_pro(market, universe, instrument_id) or {}
        current = doc.get("current_price")
        try:
            current_float = float(current) if current is not None else None
        except Exception:
            current_float = None
        _, analyst_target, _ = _extract_analyst_from_intel_pro(intel, current_float)
        anomaly_doc = store.get_daily_anomaly_ticker_docs_batch(market, [ticker]).get(f"{market}__{ticker}")
        visual = doc.get("visual_summary") if isinstance(doc.get("visual_summary"), dict) else {}
        timeline = doc.get("timeline") if isinstance(doc.get("timeline"), list) else []
        data_quality = doc.get("data_quality") if isinstance(doc.get("data_quality"), dict) else {}
        doc = {
            **doc,
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
        if args.with_options and market == "US":
            doc["options_digest"] = option_digests.get(instrument_id)
        stored_v2 = doc.get("directive_v2") if isinstance(doc.get("directive_v2"), dict) else {}
        v2 = build_directive_v2(doc, previous_v2=stored_v2 or None)
        rows.append({
            "ticker": ticker,
            "price": doc.get("current_price"),
            "stored": {
                "stance": stored_v2.get("stance"),
                "execution": stored_v2.get("execution"),
                "label": (stored_v2.get("action") or {}).get("label"),
                "confidence": stored_v2.get("confidence"),
                "zones": stored_v2.get("zones"),
            },
            "rebuilt": {
                "stance": v2.get("stance"),
                "execution": v2.get("execution"),
                "label": (v2.get("action") or {}).get("label"),
                "confidence": v2.get("confidence"),
                "zones": v2.get("zones"),
            },
        })

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    for row in rows:
        if row.get("error"):
            print(f"{row['ticker']}: {row['error']}")
            continue
        print(
            f"{row['ticker']} @ {row.get('price')}: "
            f"stored={row['stored']['stance']}:{row['stored']['execution']} / {row['stored']['label']}  ->  "
            f"rebuilt={row['rebuilt']['stance']}:{row['rebuilt']['execution']} / {row['rebuilt']['label']} "
            f"({row['rebuilt']['confidence']}) zones={row['rebuilt']['zones']}"
        )


if __name__ == "__main__":
    main()
