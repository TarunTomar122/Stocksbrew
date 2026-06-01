"""US pre-earnings payload enrichment: consensus signals + Tavily research."""
from __future__ import annotations

import os
from typing import Any

import requests

from backend.env import load_backend_env
from backend.scripts.build_earnings_intel import _safe_float

load_backend_env()
from backend.storage import TraceMoneyStore

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
TAVILY_TIMEOUT_SEC = 25
MAX_TAVILY_RESULTS = 3


def _metric_float(metrics: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = _safe_float(metrics.get(key))
        if value is not None:
            return value
    return None


def _analyst_buy_pct(analyst: dict[str, Any]) -> float | None:
    buy = _safe_float(analyst.get("buy"))
    hold = _safe_float(analyst.get("hold"))
    sell = _safe_float(analyst.get("sell"))
    if buy is None and hold is None and sell is None:
        return None
    total = (buy or 0) + (hold or 0) + (sell or 0)
    if total <= 0:
        return None
    return round(100.0 * (buy or 0) / total, 1)


def build_eps_consensus(
    event: dict[str, Any],
    metrics_snap: dict[str, Any] | None,
    analyst: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structured estimate/positioning block (no third-party brand names in keys)."""
    metrics = (metrics_snap or {}).get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}
    analyst = analyst if isinstance(analyst, dict) else {}

    calendar_eps = _safe_float(event.get("eps_estimate"))
    surprise_pct = _metric_float(metrics, "zacks_esp")
    quant_rank = _metric_float(metrics, "zacks_rank")
    recom = _metric_float(metrics, "recom")
    short_float = _metric_float(metrics, "short_float_pct")
    eps_qq = _metric_float(metrics, "eps_qq")
    perf_1m = _metric_float(metrics, "perf_1m", "perf_1m_pct")

    buy_pct = _analyst_buy_pct(analyst)
    target = _safe_float(analyst.get("target_price"))
    target_low = _safe_float(analyst.get("target_low"))
    target_high = _safe_float(analyst.get("target_high"))

    block: dict[str, Any] = {
        "calendar_eps_estimate": calendar_eps,
        "event_date": event.get("event_date"),
        "report_timing": event.get("time"),
        "earnings_surprise_pct": surprise_pct,
        "quant_rank_1_best": quant_rank,
        "street_recom_1_buy_5_sell": recom,
        "short_interest_pct": short_float,
        "eps_growth_qoq_pct": eps_qq,
        "price_change_1m_pct": perf_1m,
        "analyst_buy_pct": buy_pct,
        "analyst_target": target,
        "analyst_target_low": target_low,
        "analyst_target_high": target_high,
    }

    signals: list[str] = []
    if surprise_pct is not None:
        if surprise_pct >= 1.0:
            signals.append("eps_signal_above_consensus")
        elif surprise_pct <= -1.0:
            signals.append("eps_signal_below_consensus")
        else:
            signals.append("eps_signal_near_consensus")
    if quant_rank is not None:
        if quant_rank <= 2:
            signals.append("quality_rank_strong")
        elif quant_rank >= 4:
            signals.append("quality_rank_weak")
    if buy_pct is not None:
        if buy_pct >= 70:
            signals.append("street_ratings_bullish")
        elif buy_pct <= 40:
            signals.append("street_ratings_bearish")
    if perf_1m is not None:
        if perf_1m >= 8:
            signals.append("stock_ran_up_into_print")
        elif perf_1m <= -8:
            signals.append("stock_weak_into_print")
    if short_float is not None and short_float >= 10:
        signals.append("elevated_short_interest")

    block["signals"] = signals
    block["signal_count"] = len(signals)
    return block


def tavily_search(query: str, *, api_key: str) -> dict[str, Any]:
    try:
        response = requests.post(
            TAVILY_SEARCH_URL,
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "include_answer": False,
                "max_results": MAX_TAVILY_RESULTS,
            },
            timeout=TAVILY_TIMEOUT_SEC,
        )
        response.raise_for_status()
        payload = response.json()
        results = []
        for row in payload.get("results") or []:
            if not isinstance(row, dict):
                continue
            results.append(
                {
                    "title": str(row.get("title") or "")[:180],
                    "url": str(row.get("url") or "")[:500],
                    "content": str(row.get("content") or "")[:420],
                }
            )
        return {"ok": True, "query": query, "results": results}
    except Exception as exc:
        return {"ok": False, "query": query, "error": str(exc), "results": []}


def fetch_external_research(ticker: str, event_date: str) -> dict[str, Any]:
    """Up to two Tavily searches; never raises."""
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "skipped": True, "reason": "TAVILY_API_KEY missing", "searches": []}

    date_hint = (event_date or "").split("T", 1)[0]
    queries = [
        f"{ticker} earnings analyst EPS consensus estimate preview {date_hint}",
        f"{ticker} stock pre earnings expectations guidance reaction setup",
    ]
    searches: list[dict[str, Any]] = []
    for query in queries[:2]:
        print(f"  [tavily] {ticker}: {query[:72]}...", flush=True)
        searches.append(tavily_search(query, api_key=api_key))
    ok_count = sum(1 for item in searches if item.get("ok"))
    return {
        "ok": ok_count > 0,
        "search_count": len(searches),
        "ok_count": ok_count,
        "searches": searches,
    }


def enrich_pre_earnings_payload(
    store: TraceMoneyStore,
    payload: dict[str, Any],
    *,
    instrument_id: str,
    event: dict[str, Any],
    ticker: str,
) -> dict[str, Any]:
    """Add eps_consensus + external_research; failures are logged and omitted."""
    enriched = dict(payload)
    facts = ((payload.get("fundamentals") or {}).get("analyst")) or {}
    if not facts:
        batch = store.get_stock_facts_batch([instrument_id])
        facts = (batch.get(instrument_id) or {}).get("analyst") or {}

    try:
        snaps = store.get_stock_metrics_snapshots_batch([instrument_id])
        metrics_snap = snaps.get(instrument_id)
        enriched["eps_consensus"] = build_eps_consensus(event, metrics_snap, facts)
    except Exception as exc:
        print(f"  [eps_consensus fail] {ticker}: {exc}", flush=True)
        enriched["eps_consensus"] = {"error": str(exc), "signals": []}

    try:
        enriched["external_research"] = fetch_external_research(
            ticker,
            str(event.get("event_date") or ""),
        )
    except Exception as exc:
        print(f"  [tavily fail] {ticker}: {exc}", flush=True)
        enriched["external_research"] = {"ok": False, "error": str(exc), "searches": []}

    return enriched
