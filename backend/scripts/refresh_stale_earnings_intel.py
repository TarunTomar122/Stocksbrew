"""Find and rebuild post-earnings intel cards with missing-EPS boilerplate.

Scans tm_earnings_intel/*__latest for stale copy, re-syncs actuals (AV +
yfinance fallback), regenerates intel, then rebuilds tm_market_events.

Usage:
    python -m backend.scripts.refresh_stale_earnings_intel --market US --dry-run
    python -m backend.scripts.refresh_stale_earnings_intel --market US --write
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from typing import Any

from backend.earnings_actuals import (
    fetch_quarterly_actuals,
    fetch_yfinance_quarterly_actuals,
    pick_actual_for_event,
    summarize_surprise,
)
from backend.earnings_copy import is_missing_actual_copy
from backend.env import load_backend_env
from backend.llm_client import llm_model
from backend.news_av import _AV_KEY_POOL
from backend.scripts.build_earnings_intel import (
    OPENAI_DEFAULT_MODEL,
    _build_doc_id,
    _build_input_payload,
    _llm_synthesize,
    _pick_earnings_event,
    _resolve_instrument,
    _sanitize_decision_guide,
    _utc_now,
)
from backend.scripts.build_market_events import build_for_market
from backend.storage import TraceMoneyStore


def _as_date(value: str) -> datetime.date | None:
    candidate = str(value or "").split("T", 1)[0].strip()
    if not candidate:
        return None
    try:
        return datetime.strptime(candidate, "%Y-%m-%d").date()
    except ValueError:
        return None


def _enrichment_from_actual(actual: dict[str, Any], *, source: str) -> dict[str, Any]:
    return {
        "reported_eps": actual.get("reported_eps"),
        "estimated_eps": actual.get("estimated_eps"),
        "eps_surprise": actual.get("surprise"),
        "eps_surprise_pct": actual.get("surprise_pct"),
        "surprise_label": summarize_surprise(actual),
        "actuals_reported_date": actual.get("reported_date"),
        "actuals_fiscal_date_ending": actual.get("fiscal_date_ending"),
        "actuals_source": source,
        "actuals_captured_at": datetime.now(timezone.utc).isoformat(),
    }


def _intel_is_stale(doc: dict[str, Any], *, max_age_days: int) -> bool:
    event_date = _as_date(str(doc.get("event_date") or ""))
    if event_date is None:
        return False
    today = datetime.now(timezone.utc).date()
    age = (today - event_date).days
    if age < 0 or age > max(0, max_age_days):
        return False

    report = doc.get("report") if isinstance(doc.get("report"), dict) else {}
    facts = report.get("facts") if isinstance(report.get("facts"), dict) else {}
    reported_line = str(facts.get("reported_vs_expected") or "")
    summary = str(report.get("summary") or "")
    headline = str(report.get("headline") or "")

    if is_missing_actual_copy(reported_line):
        return True
    if is_missing_actual_copy(summary):
        return True
    if "not yet available" in headline.lower():
        return True
    return False


def _list_stale_latest_intel(
    store: TraceMoneyStore,
    market: str,
    *,
    max_age_days: int,
) -> list[dict[str, Any]]:
    stale: list[dict[str, Any]] = []
    prefix = f"{market.upper()}__"
    for snap in store.db.collection("tm_earnings_intel").stream():
        if not snap.id.endswith("__latest"):
            continue
        if not snap.id.startswith(prefix):
            continue
        data = snap.to_dict() or {}
        if not data.get("ticker") or not data.get("instrument_id"):
            continue
        if _intel_is_stale(data, max_age_days=max_age_days):
            stale.append({**data, "doc_id": snap.id})
    stale.sort(key=lambda row: str(row.get("event_date") or ""), reverse=True)
    return stale


def _sync_actuals_for_event(
    store: TraceMoneyStore,
    *,
    ticker: str,
    event_date: str,
    tolerance_days: int,
    api_key: str | None,
) -> dict[str, Any]:
    doc_id = f"{ticker}_{event_date}"
    actuals = fetch_quarterly_actuals(ticker, api_key=api_key)
    actual = pick_actual_for_event(actuals, event_date, tolerance_days=tolerance_days)
    source = "alphavantage"
    if actual is None:
        yf_actuals = fetch_yfinance_quarterly_actuals(ticker)
        actual = pick_actual_for_event(yf_actuals, event_date, tolerance_days=tolerance_days)
        source = "yfinance"
    if actual is None:
        return {"status": "no_actual", "ticker": ticker, "event_date": event_date}
    enrichment = _enrichment_from_actual(actual, source=source)
    store.db.collection("tm_earnings_events").document(doc_id).set(enrichment, merge=True)
    return {"status": "enriched", "ticker": ticker, "event_date": event_date, **enrichment}


def _rebuild_intel_for_ticker(
    store: TraceMoneyStore,
    *,
    market: str,
    ticker: str,
    event_date: str,
    model_name: str,
    prompt_variant: str,
    write: bool,
) -> dict[str, Any]:
    event = _pick_earnings_event(store, market, ticker, event_date)
    if event is None:
        return {"status": "no_event", "ticker": ticker, "event_date": event_date}
    instrument = _resolve_instrument(store, market, ticker)
    payload = _build_input_payload(store, market, ticker, instrument, event)
    synthesis = _llm_synthesize(payload, model_name=model_name, prompt_variant=prompt_variant)
    synthesis = _sanitize_decision_guide(synthesis, payload)
    instrument_id = str(instrument.get("instrument_id") or "")
    doc_id = _build_doc_id(market, instrument_id, event_date)
    report = {
        "doc_id": doc_id,
        "market": market.upper(),
        "instrument_id": instrument_id,
        "ticker": ticker.upper(),
        "event_date": event_date,
        "generated_at": _utc_now(),
        "model": model_name,
        "prompt_variant": prompt_variant,
        "inputs": {
            "earnings_event": payload.get("earnings_event"),
            "timing": payload.get("timing"),
            "reported_actuals": payload.get("reported_actuals"),
            "price_reaction_window": payload.get("price_reaction_window"),
            "post_earnings_news_count": len(payload.get("post_earnings_news") or []),
            "reddit_present": bool(payload.get("reddit_buzz")),
        },
        "report": synthesis,
    }
    if write:
        store.db.collection("tm_earnings_intel").document(doc_id).set(report)
        store.db.collection("tm_earnings_intel").document(f"{market.upper()}__{instrument_id}__latest").set(report)
    facts = synthesis.get("facts") if isinstance(synthesis.get("facts"), dict) else {}
    return {
        "status": "rebuilt",
        "ticker": ticker,
        "event_date": event_date,
        "reported_vs_expected": str(facts.get("reported_vs_expected") or "")[:160],
        "headline": str(synthesis.get("headline") or "")[:120],
    }


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Refresh stale post-earnings intel cards")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--max-age-days", type=int, default=21, help="Only refresh prints within this many days")
    parser.add_argument("--tolerance-days", type=int, default=4)
    parser.add_argument("--sleep", type=float, default=1.0, help="Pause between AV calls during actuals sync")
    parser.add_argument("--model", default="")
    parser.add_argument("--prompt-variant", choices=["v1", "v2", "v3"], default="v1")
    parser.add_argument("--market-events-limit", type=int, default=40)
    parser.add_argument(
        "--max-refresh",
        type=int,
        default=0,
        help="Cap LLM rebuilds (0 = no cap). Newest prints first.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.write:
        parser.error("Pass --dry-run or --write")

    store = TraceMoneyStore()
    stale = _list_stale_latest_intel(store, args.market, max_age_days=args.max_age_days)
    if not stale:
        print(json.dumps({"status": "noop", "reason": "no_stale_intel", "market": args.market}))
        return

    targets = [
        {
            "ticker": str(row.get("ticker") or "").upper().strip(),
            "event_date": str(row.get("event_date") or "").strip(),
            "instrument_id": str(row.get("instrument_id") or "").strip(),
        }
        for row in stale
    ]
    if args.max_refresh > 0:
        targets = targets[: args.max_refresh]
    if args.dry_run:
        print(
            json.dumps(
                {
                    "status": "dry_run",
                    "market": args.market,
                    "stale_count": len(targets),
                    "targets": targets,
                },
                indent=2,
                ensure_ascii=True,
            )
        )
        return

    model_name = args.model.strip() or llm_model(OPENAI_DEFAULT_MODEL)
    pool = list(_AV_KEY_POOL)
    actuals_results: list[dict[str, Any]] = []
    rebuild_results: list[dict[str, Any]] = []

    for idx, target in enumerate(targets):
        ticker = target["ticker"]
        event_date = target["event_date"]
        if not ticker or not event_date:
            continue
        api_key = pool[idx % len(pool)] if pool else None
        actuals_results.append(
            _sync_actuals_for_event(
                store,
                ticker=ticker,
                event_date=event_date,
                tolerance_days=args.tolerance_days,
                api_key=api_key,
            )
        )
        if args.sleep > 0 and idx < len(targets) - 1:
            time.sleep(args.sleep)
        rebuild_results.append(
            _rebuild_intel_for_ticker(
                store,
                market=args.market,
                ticker=ticker,
                event_date=event_date,
                model_name=model_name,
                prompt_variant=args.prompt_variant,
                write=True,
            )
        )

    feed = build_for_market(
        store,
        args.market,
        limit=args.market_events_limit,
        earnings_cap=args.market_events_limit,
    )

    print(
        json.dumps(
            {
                "status": "ok",
                "market": args.market,
                "stale_count": len(targets),
                "actuals": actuals_results,
                "rebuilt": rebuild_results,
                "market_events": {
                    "event_count": feed.get("event_count"),
                    "summary": feed.get("summary"),
                },
            },
            indent=2,
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
