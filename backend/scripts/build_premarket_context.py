"""Build why-moving context for pre-market gappers from batched news data."""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.instrument_universe import list_instruments
from backend.news_av import fetch_av_news_for_tickers
from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.premarket_intel import (
    article_to_context_row,
    mover_tickers_from_snapshot,
    pick_best_article,
    pick_best_enrichment,
    subscriber_book_mover_tickers,
)
from backend.premarket_tape_llm import enrich_context_with_tape_lines
from backend.storage import TraceMoneyStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _instruments_for_tickers(market: str, tickers: list[str]) -> list[dict[str, Any]]:
    by_ticker = {
        str(inst.get("ticker") or "").strip().upper(): inst
        for inst in list_instruments(market)
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
    public_tickers = mover_tickers_from_snapshot(premarket, min_gap=min_gap)
    email_tickers = subscriber_book_mover_tickers(store, premarket)
    tickers = list(dict.fromkeys(public_tickers + email_tickers))
    universe_id = str(store.get_active_ai_universe(market) or "").strip()
    if not tickers:
        payload = {
            "market": market,
            "generated_at": _now_iso(),
            "source_movers_generated_at": str(premarket.get("generated_at") or ""),
            "source_movers_date": str(premarket.get("date") or ""),
            "ticker_count": 0,
            "by_ticker": {},
        }
        store.save_premarket_context(market, payload)
        return payload

    instruments = _instruments_for_tickers(market, tickers)
    company_by_ticker = {
        str(inst.get("ticker") or "").strip().upper(): str(
            inst.get("name") or inst.get("ticker") or ""
        ).strip()
        for inst in instruments
        if str(inst.get("ticker") or "").strip()
    }
    batch_started = time.perf_counter()
    av_articles = fetch_av_news_for_tickers(
        tickers,
        market=market,
        lookback_hours=lookback_hours,
    )
    batch_elapsed = round(time.perf_counter() - batch_started, 2)

    batch_covered = {
        ticker
        for ticker in tickers
        if pick_best_article(
            av_articles,
            ticker,
            company_name=company_by_ticker.get(ticker, ""),
        ) is not None
    }
    fallback_tickers = [ticker for ticker in tickers if ticker not in batch_covered]
    fallback_started = time.perf_counter()
    finnhub_articles = (
        fetch_finnhub_news_for_tickers(
            fallback_tickers,
            market=market,
            lookback_days=max(1, lookback_hours // 24 + 1),
        )
        if fallback_tickers
        else []
    )
    fallback_elapsed = round(time.perf_counter() - fallback_started, 2)

    articles = _merge_articles(av_articles, finnhub_articles)
    enrichments = store.list_article_enrichments(market, universe_id, limit=300) if universe_id else []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, lookback_hours))

    by_ticker: dict[str, dict[str, Any]] = {}
    for ticker in tickers:
        company_name = company_by_ticker.get(ticker, "")
        article = pick_best_article(articles, ticker, company_name=company_name)
        if article is not None:
            by_ticker[ticker] = article_to_context_row(
                article,
                ticker=ticker,
                company_name=company_name,
            )
            continue
        enrichment = pick_best_enrichment(
            enrichments,
            ticker,
            cutoff=cutoff,
            company_name=company_name,
        )
        if enrichment:
            by_ticker[ticker] = enrichment

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

    tape_started = time.perf_counter()
    enrich_context_with_tape_lines(
        store,
        market=market,
        by_ticker=by_ticker,
        company_by_ticker=company_by_ticker,
        gap_by_ticker=gap_by_ticker,
    )
    tape_elapsed = round(time.perf_counter() - tape_started, 2)
    by_ticker = {
        ticker: row
        for ticker, row in by_ticker.items()
        if bool(row.get("relevance_verified"))
    }
    no_catalyst_tickers = [ticker for ticker in tickers if ticker not in by_ticker]

    payload = {
        "market": market,
        "generated_at": _now_iso(),
        "source_movers_generated_at": str(premarket.get("generated_at") or ""),
        "source_movers_date": str(premarket.get("date") or ""),
        "lookback_hours": lookback_hours,
        "ticker_count": len(by_ticker),
        "candidate_tickers": tickers,
        "by_ticker": by_ticker,
        "build_stats": {
            "batch_articles": len(av_articles),
            "batch_covered_tickers": len(batch_covered),
            "single_symbol_fallback_tickers": len(fallback_tickers),
            "no_catalyst_tickers": len(no_catalyst_tickers),
            "batch_elapsed_s": batch_elapsed,
            "fallback_elapsed_s": fallback_elapsed,
            "tape_elapsed_s": tape_elapsed,
        },
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
