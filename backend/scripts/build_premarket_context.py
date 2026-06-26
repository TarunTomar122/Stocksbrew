"""Build why-moving context for pre-market gappers from RSS/API news (no Tavily)."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.news_marketaux import fetch_marketaux_news_for_tickers
from backend.news_pipeline import collect_per_ticker_articles
from backend.premarket_intel import (
    article_to_context_row,
    mover_tickers_from_snapshot,
    pick_best_article,
    pick_best_enrichment,
)
from backend.premarket_tape_llm import enrich_context_with_tape_lines
from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _instruments_for_tickers(market: str, universe_id: str, tickers: list[str]) -> list[dict[str, Any]]:
    by_ticker = {
        str(inst.get("ticker") or "").strip().upper(): inst
        for inst in list_instruments(market, universe_id)
    }
    out: list[dict[str, Any]] = []
    for ticker in tickers:
        inst = by_ticker.get(ticker.upper())
        if inst:
            out.append(inst)
    return out


def _merge_articles(*groups: list) -> list:
    seen: set[str] = set()
    merged = []
    for group in groups:
        for article in group:
            key = str(getattr(article, "url", "") or getattr(article, "id", "")).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(article)
    return merged


def build_context_for_movers(
    store: TraceMoneyStore,
    *,
    market: str,
    min_gap: float = 2.0,
    lookback_hours: int = 12,
    per_stock_cap: int = 10,
) -> dict[str, Any]:
    market = market.upper()
    premarket = store.get_premarket_movers(market) or {}
    tickers = mover_tickers_from_snapshot(premarket, min_gap=min_gap)
    universe_id = str(store.get_active_ai_universe(market) or "").strip()
    if not tickers:
        payload = {
            "market": market,
            "generated_at": _now_iso(),
            "ticker_count": 0,
            "by_ticker": {},
        }
        store.save_premarket_context(market, payload)
        return payload

    instruments = _instruments_for_tickers(market, universe_id, tickers)
    instrument_ids = [str(i.get("instrument_id") or "") for i in instruments if i.get("instrument_id")]

    rss_articles, _health = collect_per_ticker_articles(
        market,
        universe_id,
        per_stock_cap=per_stock_cap,
        broad_cap=0,
        instrument_ids=instrument_ids or None,
        instruments_override=instruments or None,
        per_stock_lookback_hours=lookback_hours,
    )

    finnhub_articles = fetch_finnhub_news_for_tickers(
        tickers,
        market=market,
        lookback_days=max(1, lookback_hours // 24 + 1),
    )
    marketaux_articles = fetch_marketaux_news_for_tickers(
        tickers,
        market=market,
        lookback_hours=lookback_hours,
    )

    articles = _merge_articles(rss_articles, finnhub_articles, marketaux_articles)
    enrichments = store.list_article_enrichments(market, universe_id, limit=300) if universe_id else []

    by_ticker: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        article = pick_best_article(articles, ticker)
        if article is not None:
            by_ticker[ticker] = article_to_context_row(article)
            continue
        enrichment = pick_best_enrichment(enrichments, ticker)
        if enrichment:
            by_ticker[ticker] = enrichment

    company_by_ticker = {
        str(inst.get("ticker") or "").strip().upper(): str(inst.get("name") or inst.get("ticker") or "").strip()
        for inst in instruments
        if str(inst.get("ticker") or "").strip()
    }
    gap_by_ticker: dict[str, float] = {}
    for row in list(premarket.get("gappers_up") or []) + list(premarket.get("gappers_down") or []):
        sym = str(row.get("ticker") or "").strip().upper()
        if sym:
            gap_by_ticker[sym] = float(row.get("pre_market_change_pct") or 0)
    by_snapshot = premarket.get("by_ticker") or {}
    if isinstance(by_snapshot, dict):
        for sym, hit in by_snapshot.items():
            if isinstance(hit, dict):
                gap_by_ticker[str(sym).upper()] = float(hit.get("pre_market_change_pct") or 0)

    enrich_context_with_tape_lines(
        store,
        market=market,
        by_ticker=by_ticker,
        company_by_ticker=company_by_ticker,
        gap_by_ticker=gap_by_ticker,
    )

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "lookback_hours": lookback_hours,
        "ticker_count": len(by_ticker),
        "candidate_tickers": tickers,
        "by_ticker": by_ticker,
    }
    store.save_premarket_context(market, payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build pre-market mover context from news APIs")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--min-gap", type=float, default=2.0)
    parser.add_argument("--lookback-hours", type=int, default=12)
    parser.add_argument("--per-stock-cap", type=int, default=10)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    if args.dry_run:
        premarket = store.get_premarket_movers(args.market) or {}
        tickers = mover_tickers_from_snapshot(premarket, min_gap=args.min_gap)
        print(json.dumps({"dry_run": True, "tickers": tickers}))
        return

    payload = build_context_for_movers(
        store,
        market=args.market,
        min_gap=args.min_gap,
        lookback_hours=args.lookback_hours,
        per_stock_cap=args.per_stock_cap,
    )
    print(json.dumps({
        "status": "success",
        "market": args.market.upper(),
        "context_tickers": payload.get("ticker_count", 0),
        "candidates": len(payload.get("candidate_tickers") or []),
    }))


if __name__ == "__main__":
    main()
