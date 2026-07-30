"""Research evidence-backed reasons for an already-materialized mover snapshot.

This is intentionally not a stock-brief job.  It receives the exact movers
that were selected from one market-session price snapshot, checks current
company news first, and only then escalates to Context Search + Firecrawl for
names without a supported explanation.  It never changes prices or reselects
movers, so a late research pass cannot mix a closing explanation with a
pre-market quote.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.context_search import context_search_enabled, search_context_articles_for_ticker
from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.news_av import fetch_av_news_for_tickers
from backend.scripts.build_daily_anomalies import (
    ANOMALY_REVALIDATE_PATHS,
    _article_to_move_item,
    _llm_move_explanation,
    _parse_timestamp,
    _write_ticker_read_models,
)
from backend.scripts.trigger_web_revalidate import trigger_web_revalidate
from backend.storage import TraceMoneyStore


REASON_LOOKBACK_HOURS = 48
REASON_CONTEXT_WORKERS = 6


def _fresh_items(items: list[dict[str, Any]], *, reference: datetime) -> list[dict[str, Any]]:
    """Keep dated, recent evidence only; undated web pages cannot explain a move."""
    earliest = reference - timedelta(hours=REASON_LOOKBACK_HOURS)
    latest = datetime.now(timezone.utc) + timedelta(minutes=10)
    fresh: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        published = _parse_timestamp(item.get("date") or item.get("published_at") or item.get("timestamp"))
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        if published is None or published < earliest or published > latest or not title:
            continue
        key = url or f"{title}|{published.isoformat()}"
        if key in seen:
            continue
        seen.add(key)
        row = dict(item)
        row["date"] = published.isoformat()
        fresh.append(row)
    fresh.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    return fresh


def _snapshot_reference(row: dict[str, Any], payload: dict[str, Any]) -> datetime | None:
    return _parse_timestamp(row.get("price_as_of")) or _parse_timestamp(payload.get("generated_at"))


def _timeline_items(doc: dict[str, Any] | None, *, reference: datetime) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for source in ((doc or {}).get("timeline") or []):
        if not isinstance(source, dict):
            continue
        rows.append(
            {
                "date": source.get("timestamp") or source.get("published_at"),
                "source": source.get("source_name") or source.get("source"),
                "title": source.get("title"),
                "summary": source.get("summary") or source.get("article_overview"),
                "url": source.get("article_url") or source.get("url"),
            }
        )
    return _fresh_items(rows, reference=reference)


def _source_items_by_ticker(
    tickers: list[str], *, market: str, reference: datetime
) -> dict[str, list[dict[str, Any]]]:
    """Fetch narrow, source-attributed company-news evidence for the movers only."""
    # Alpha Vantage is the primary broad-market source: one call gives the
    # entire selected mover cohort with entity relevance. The earlier anomaly
    # lane skipped it, which is why obvious names often reached a weak search
    # fallback with no usable evidence.
    fetched = fetch_av_news_for_tickers(
        tickers, market=market, lookback_hours=REASON_LOOKBACK_HOURS
    )
    fetched.extend(fetch_finnhub_news_for_tickers(
        tickers, market=market, lookback_days=3, max_per_ticker=8, sleep_between=0.2
    ))
    # Marketaux is intentionally not part of this latency-sensitive lane. Its
    # production quota is exhausted/paid-only (402), and one serial request
    # per mover turned a source outage into a slow, low-coverage anomaly run.
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for article in fetched:
        ticker = str(getattr(article, "focus_ticker", "") or "").strip().upper()
        if ticker:
            grouped[ticker].append(_article_to_move_item(article))
    return {
        ticker: _fresh_items(rows, reference=reference)
        for ticker, rows in grouped.items()
    }


def _context_items_by_ticker(
    instruments: dict[str, dict[str, Any]],
    *,
    market: str,
    reference: datetime,
) -> dict[str, list[dict[str, Any]]]:
    """Acquire independent web evidence for the whole selected mover set.

    Context Search plus Firecrawl is a first-class source in this lane, rather
    than an afterthought after a single provider happens to miss a ticker. It
    runs concurrently and its dated results are combined with the market-news
    feeds before one evidence-bound explanation is attempted for each mover.
    """
    if not instruments or not context_search_enabled():
        return {}

    def fetch_one(ticker: str, instrument: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        try:
            articles, health = search_context_articles_for_ticker(
                instrument,
                market=market,
                limit=5,
                lookback_hours=REASON_LOOKBACK_HOURS,
            )
        except Exception as exc:
            print({"stage": "anomaly_web_source_error", "ticker": ticker, "error": str(exc)}, flush=True)
            return ticker, []
        if not articles:
            print({"stage": "anomaly_web_source_empty", "ticker": ticker, "health": health}, flush=True)
            return ticker, []
        return ticker, _fresh_items([_article_to_move_item(article) for article in articles], reference=reference)

    grouped: dict[str, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=min(REASON_CONTEXT_WORKERS, len(instruments))) as executor:
        futures = [
            executor.submit(fetch_one, ticker, instrument)
            for ticker, instrument in instruments.items()
        ]
        for future in as_completed(futures):
            ticker, items = future.result()
            if items:
                grouped[ticker] = items
    return grouped


def _price_context_explanation(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    """Represent an unresolved mover without turning an incomplete tape into a cause.

    The prior implementation compared an aggregate five-day return with today's
    move and called it a continuation. Those are different measurements: a
    stock can be down over five sessions while sharply up today. We do not
    publish a causal-sounding price-history sentence unless a dated source
    actually explains the current move.
    """
    # `history` is intentionally unused. Its values are still useful input for
    # future research, but not sufficient evidence for a public explanation.
    _ = row, instrument, history
    return {
        "cause_type": "no_verified_catalyst",
        "dominant_angle": "unresolved",
        "headline": "--",
        "why_it_matters": "",
        "confidence": "low",
        "searched_externally": True,
        "external_source": None,
        "evidence": [],
    }


def _is_final_explanation(row: dict[str, Any]) -> bool:
    """Source-backed reasons stay put; unresolved rows are retried next run."""
    explanation = row.get("move_explanation") if isinstance(row.get("move_explanation"), dict) else {}
    return (
        row.get("narrative_status") == "verified"
        and bool(explanation)
        and str(explanation.get("cause_type") or "").strip().lower()
        not in {"price_context", "no_verified_catalyst"}
    )


def _research_row(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    current_items: list[dict[str, Any]],
    price_history: list[dict[str, Any]],
) -> dict[str, Any] | None:
    day_change = row.get("day_change_pct")
    if not isinstance(day_change, (int, float)):
        return None
    explanation = _llm_move_explanation(
        instrument=instrument,
        day_change_pct=float(day_change),
        articles=current_items,
    )
    if explanation:
        explanation["searched_externally"] = True
        explanation["external_source"] = "mover_research"
        return explanation
    return _price_context_explanation(row=row, instrument=instrument, history=price_history)


def main() -> None:
    parser = argparse.ArgumentParser(description="Research reasons for the current daily mover snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--expected-price-session-phase", default=None)
    parser.add_argument("--require-web-revalidate", action="store_true")
    parser.add_argument(
        "--price-context-only",
        action="store_true",
        help="Skip web acquisition and fill unresolved movers from retained price history only.",
    )
    parser.add_argument(
        "--only-unresolved",
        action="store_true",
        help="Research unresolved and provisional price-context rows; preserve source-backed evidence.",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    feed_ref = store.db.collection("tm_daily_anomalies").document(f"{args.market}__latest")
    snapshot = feed_ref.get()
    if not snapshot.exists:
        raise RuntimeError("No anomaly snapshot exists to research")
    payload = snapshot.to_dict() or {}
    snapshot_generated_at = str(payload.get("generated_at") or "")
    if not snapshot_generated_at:
        raise RuntimeError("Anomaly snapshot is missing generated_at")
    if args.expected_price_session_phase and payload.get("price_session_phase") != args.expected_price_session_phase:
        raise RuntimeError(
            "Refusing to research a different price session: "
            f"expected {args.expected_price_session_phase}, got {payload.get('price_session_phase') or 'missing'}"
        )
    rows = [deepcopy(row) for row in (payload.get("anomalies") or []) if isinstance(row, dict)]
    if not rows:
        print({"market": args.market, "researched": 0, "reasoned": 0})
        return
    reference = _parse_timestamp(payload.get("generated_at"))
    if reference is None:
        raise RuntimeError("Anomaly snapshot generated_at is invalid")

    research_rows = [
        row
        for row in rows
        if not (args.only_unresolved and _is_final_explanation(row))
    ]
    tickers = [str(row.get("ticker") or "").strip().upper() for row in research_rows]
    instruments = {
        str(item.get("ticker") or "").strip().upper(): item
        for item in store.list_instruments(args.market, [str(row.get("instrument_id") or "") for row in rows])
        if str(item.get("ticker") or "").strip()
    }
    intelligence = store.get_stock_intelligence_docs_batch(
        args.market, args.universe, [str(row.get("instrument_id") or "") for row in rows]
    )
    research_instruments = {
        ticker: instruments[ticker]
        for ticker in tickers
        if ticker in instruments
    }
    price_docs = store.get_latest_prices([str(row.get("instrument_id") or "") for row in rows])
    source_items = {} if args.price_context_only else _source_items_by_ticker(tickers, market=args.market, reference=reference)
    web_items = (
        {}
        if args.price_context_only
        else _context_items_by_ticker(
            research_instruments,
            market=args.market,
            reference=reference,
        )
    )

    reasoned = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in rows:
        already_final = _is_final_explanation(row)
        if args.only_unresolved and already_final:
            reasoned += 1
            continue
        # The anomaly feed is a move-reasoning product. Never carry old
        # generic brief prose forward merely because its timestamp was recent.
        # Every row is reset to this exact snapshot. This source pass writes a
        # reason only when it finds dated evidence for the move; otherwise it
        # writes an explicit unresolved marker, never speculative prose.
        row["narrative_status"] = "unverified"
        row["narrative_as_of"] = None
        row["move_explanation"] = None
        for key in (
            "headline",
            "thesis",
            "today_brief",
            "catalyst",
            "risk",
            "key_points",
            "visual_summary",
            "overall_verdict",
            "comparative_context",
        ):
            row[key] = [] if key == "key_points" else None
        ticker = str(row.get("ticker") or "").strip().upper()
        instrument = instruments.get(ticker)
        row_reference = _snapshot_reference(row, payload)
        if not ticker or not instrument or row_reference is None:
            continue
        evidence = _timeline_items(
            intelligence.get(str(row.get("instrument_id") or "")), reference=row_reference
        ) + source_items.get(ticker, []) + web_items.get(ticker, [])
        explanation = _research_row(
            row=row,
            instrument=instrument,
            current_items=_fresh_items(evidence, reference=row_reference),
            price_history=list((price_docs.get(str(row.get("instrument_id") or "")) or {}).get("history_window") or []),
        )
        if not explanation:
            continue
        row["move_explanation"] = explanation
        # This explanation is tied to the current price snapshot. It is either
        # source-backed or an explicitly-labelled price-action read.
        row["narrative_status"] = "verified"
        row["narrative_as_of"] = now_iso
        reasoned += 1

    # A later price materialization wins. Never let a slow source lookup write
    # researched prose into a newer session's mover list.
    latest = feed_ref.get()
    latest_payload = latest.to_dict() if latest.exists else None
    if not isinstance(latest_payload, dict) or str(latest_payload.get("generated_at") or "") != snapshot_generated_at:
        raise RuntimeError("Anomaly snapshot changed while researching reasons; refusing stale write")
    updated = dict(payload)
    updated["anomalies"] = rows
    updated["reasoned_at"] = now_iso
    updated["reasoned_count"] = reasoned
    feed_ref.set(updated)
    _write_ticker_read_models(store, args.market, updated)
    store.save_stage_watermark(
        market=args.market,
        stage_key="research_daily_anomaly_reasons",
        universe_id=args.universe,
        expected_count=len(rows),
        success_count=reasoned,
        error_count=max(0, len(rows) - reasoned),
        metadata={
            "snapshot_generated_at": snapshot_generated_at,
            "expected_price_session_phase": args.expected_price_session_phase,
            "unresolved_count": max(0, len(rows) - reasoned),
        },
    )
    revalidated = trigger_web_revalidate(ANOMALY_REVALIDATE_PATHS, force=True)
    if args.require_web_revalidate and not revalidated:
        raise RuntimeError("anomaly reasons were saved, but the web refresh failed")
    print({"market": args.market, "researched": len(rows), "reasoned": reasoned})


if __name__ == "__main__":
    main()
