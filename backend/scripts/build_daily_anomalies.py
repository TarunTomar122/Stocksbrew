from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

import requests

from backend.llm_client import json_response_format, llm_api_key, llm_api_url, llm_headers, llm_model, parse_json_content, schema_system_prompt
from backend.instrument_universe import list_instruments
from backend.stock_intelligence import build_no_news_intelligence_doc
from backend.storage import TraceMoneyStore


OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
MOVE_EXPLAINER_PROMPT = """You explain sharp single-stock moves for a market app.

You receive the ticker, company name, today's price move, and the latest internal news items for that stock.

Decide whether those news items plausibly explain today's sudden move.

Rules:
- Use only the supplied news items. Do not infer from old market memory.
- If the items are unrelated, stale, contradictory, or do not explain the move, return can_explain=false.
- If they explain the move, write a plain-English headline and explanation.
- Keep headline under 12 words.
- Keep why_it_matters to 1-2 complete sentences, 35-55 words total.
- Do not mention that you are an AI or that evidence was supplied.
"""

MOVE_EXPLAINER_SCHEMA = {
    "type": "object",
    "properties": {
        "can_explain": {"type": "boolean"},
        "cause_type": {"type": "string"},
        "headline": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["can_explain", "cause_type", "headline", "why_it_matters", "confidence"],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _ticker_context_doc_id(market: str, ticker: str) -> str:
    return f"{market.upper()}__{str(ticker or '').strip().upper()}"


def _write_ticker_read_models(store: TraceMoneyStore, market: str, payload: dict[str, Any]) -> None:
    """Write per-ticker anomaly docs so stock pages avoid the full anomalies feed."""
    market_key = market.upper()
    rows = [row for row in (payload.get("anomalies") or []) if isinstance(row, dict)]
    current_tickers = sorted({str(row.get("ticker") or "").strip().upper() for row in rows if row.get("ticker")})
    index_ref = store.db.collection("tm_daily_anomaly_ticker_index").document(market_key)
    previous = index_ref.get()
    previous_tickers = []
    if previous.exists:
        previous_data = previous.to_dict() or {}
        previous_tickers = [
            str(ticker or "").strip().upper()
            for ticker in (previous_data.get("tickers") or [])
            if str(ticker or "").strip()
        ]

    batch = store.db.batch()
    collection = store.db.collection("tm_daily_anomaly_tickers")
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        batch.set(
            collection.document(_ticker_context_doc_id(market_key, ticker)),
            {
                "market": market_key,
                "ticker": ticker,
                "generated_at": payload.get("generated_at"),
                "enriched_at": payload.get("enriched_at"),
                "date": payload.get("date"),
                "anomaly": row,
            },
        )
    for ticker in sorted(set(previous_tickers) - set(current_tickers)):
        batch.delete(collection.document(_ticker_context_doc_id(market_key, ticker)))
    batch.set(
        index_ref,
        {
            "market": market_key,
            "generated_at": payload.get("generated_at"),
            "date": payload.get("date"),
            "tickers": current_tickers,
            "count": len(current_tickers),
        },
    )
    batch.commit()


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _latest_timeline_items(intel_doc: dict[str, Any] | None, *, limit: int = 3) -> list[dict[str, Any]]:
    intel = intel_doc or {}
    rows = [row for row in (intel.get("timeline") or []) if isinstance(row, dict)]
    rows.sort(key=lambda row: str(row.get("timestamp") or ""), reverse=True)
    out: list[dict[str, Any]] = []
    for row in rows:
        title = str(row.get("title") or "").strip()
        summary = str(row.get("summary") or "").strip()
        if not title and not summary:
            continue
        out.append(
            {
                "date": str(row.get("timestamp") or "").strip()[:10],
                "source": str(row.get("source_name") or "").strip(),
                "title": title,
                "summary": summary,
                "url": str(row.get("article_url") or "").strip(),
            }
        )
        if len(out) >= limit:
            break
    return out


def _fallback_move_explanation() -> dict[str, Any]:
    return {
        "cause_type": "unclear",
        "headline": "No clear company-specific driver surfaced yet.",
        "why_it_matters": "The move is large, but current internal news and intelligence do not explain it cleanly.",
        "confidence": "low",
        "searched_externally": False,
        "evidence": [],
    }


def _llm_move_explanation(
    *,
    instrument: dict[str, Any],
    day_change_pct: float,
    articles: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not articles:
        return None
    api_key = llm_api_key()
    if not api_key:
        return None
    payload = {
        "ticker": str(instrument.get("ticker") or "").strip().upper(),
        "company": str(instrument.get("name") or instrument.get("ticker") or "").strip(),
        "day_change_pct": day_change_pct,
        "direction": "up" if day_change_pct >= 0 else "down",
        "latest_articles": articles,
    }
    try:
        resp = requests.post(
            llm_api_url(),
            headers=llm_headers(api_key),
            json={
                "model": llm_model(OPENAI_DEFAULT_MODEL),
                "temperature": 0.0,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(MOVE_EXPLAINER_PROMPT, MOVE_EXPLAINER_SCHEMA)},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
                ],
                "response_format": json_response_format(),
            },
            timeout=35,
        )
        resp.raise_for_status()
        parsed = parse_json_content(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        print(f"  [move explainer] failed {payload['ticker']}: {exc}", flush=True)
        return None
    if not parsed.get("can_explain"):
        return None
    headline = str(parsed.get("headline") or "").strip()
    why = str(parsed.get("why_it_matters") or "").strip()
    if not headline or not why:
        return None
    return {
        "cause_type": str(parsed.get("cause_type") or "company_news").strip() or "company_news",
        "headline": headline,
        "why_it_matters": why,
        "confidence": str(parsed.get("confidence") or "medium").strip() or "medium",
        "searched_externally": False,
        "evidence": [{"title": row.get("title"), "url": row.get("url")} for row in articles if row.get("url")],
    }

def _move_explanation(
    *,
    instrument: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    day_change_pct: float,
    external_search: bool,
) -> dict[str, Any] | None:
    if abs(day_change_pct) < 4:
        return None
    explanation = _llm_move_explanation(
        instrument=instrument,
        day_change_pct=day_change_pct,
        articles=_latest_timeline_items(intel_doc, limit=3),
    )
    return explanation or _fallback_move_explanation()


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


def _tracked_instrument_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
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


def _load_scan_instruments(
    store: TraceMoneyStore,
    *,
    market: str,
    universe_id: str,
    include_tracked: bool,
) -> list[dict[str, Any]]:
    rows = list_instruments(market, universe_id)
    by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in rows
        if str(row.get("instrument_id") or "").strip()
    }
    if include_tracked:
        missing_ids = [iid for iid in _tracked_instrument_ids(store, market) if iid not in by_id]
        for row in store.list_instruments(market, missing_ids):
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            if instrument_id:
                by_id[instrument_id] = row
    return list(by_id.values())


def _pick_row(
    instrument: dict[str, Any],
    quote_doc: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    *,
    explain_moves: bool,
    external_search: bool,
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
    direction = "up" if day_change_pct >= 0 else "down"
    key_points = [str(p).strip() for p in ((intel_doc or {}).get("key_points") or []) if str(p).strip()][:4]
    headline = str((intel_doc or {}).get("headline") or "").strip() or None
    thesis = str((intel_doc or {}).get("thesis") or "").strip() or None
    raw_brief = (
        str(
            (intel_doc or {}).get("today_brief")
            or (intel_doc or {}).get("body")
            or ""
        ).strip()
        or None
    )
    brief = raw_brief or (key_points[0] if key_points else None)
    label = str((intel_doc or {}).get("overall_label") or "").strip() or None
    score = (intel_doc or {}).get("overall_score")
    overall_score = int(score) if isinstance(score, (int, float)) else None
    visual_summary = (intel_doc or {}).get("visual_summary")
    if not isinstance(visual_summary, dict):
        visual_summary = None
    move_explanation = (
        _move_explanation(
            instrument=instrument,
            intel_doc=intel_doc,
            day_change_pct=day_change_pct,
            external_search=external_search,
        )
        if explain_moves
        else None
    )

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
        "direction": direction,
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
        "move_explanation": move_explanation,
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
    parser.add_argument("--explain-hard-moves", action="store_true")
    parser.add_argument("--exclude-tracked", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")

    instruments = _load_scan_instruments(
        store,
        market=args.market,
        universe_id=universe_id,
        include_tracked=not bool(args.exclude_tracked),
    )
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
    for index, instrument_id in enumerate(selected_ids):
        row = _pick_row(
            by_id.get(instrument_id) or {},
            prices.get(instrument_id) or {},
            intelligence.get(instrument_id),
            explain_moves=bool(args.explain_hard_moves),
            external_search=bool(args.explain_hard_moves) and index < 12,
        )
        if row:
            rows.append(row)

    up_count = sum(1 for row in rows if str(row.get("direction")) == "up")
    down_count = sum(1 for row in rows if str(row.get("direction")) == "down")

    payload = {
        "market": args.market,
        "generated_at": _now_iso(),
        "enriched_at": _now_iso(),
        "date": _today_utc(),
        "anomaly_count": len(rows),
        "threshold_pct": float(args.threshold_pct),
        "up_count": up_count,
        "down_count": down_count,
        "anomalies": rows,
        "universe_id": universe_id,
    }
    store.db.collection("tm_daily_anomalies").document(f"{args.market}__latest").set(payload)
    _write_ticker_read_models(store, args.market, payload)
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
            "include_tracked": not bool(args.exclude_tracked),
            "scan_count": len(instrument_ids),
        },
    )
    print({"market": args.market, "scanned": len(instrument_ids), "selected": len(selected_ids), "written": len(rows)})


if __name__ == "__main__":
    main()
