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
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.news_marketaux import fetch_marketaux_news_for_tickers
from backend.scripts.build_daily_anomalies import (
    ANOMALY_CONTEXT_RESCUE_LOOKBACK_HOURS,
    ANOMALY_REVALIDATE_PATHS,
    _article_to_move_item,
    _context_rescue_move_explanation,
    _llm_move_explanation,
    _parse_timestamp,
    _write_ticker_read_models,
)
from backend.scripts.trigger_web_revalidate import trigger_web_revalidate
from backend.storage import TraceMoneyStore


REASON_LOOKBACK_HOURS = 48


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
    fetched = fetch_finnhub_news_for_tickers(
        tickers, market=market, lookback_days=3, max_per_ticker=8, sleep_between=0.2
    )
    fetched.extend(
        fetch_marketaux_news_for_tickers(
            tickers, market=market, lookback_hours=REASON_LOOKBACK_HOURS, sleep_between_calls=0.1
        )
    )
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for article in fetched:
        ticker = str(getattr(article, "focus_ticker", "") or "").strip().upper()
        if ticker:
            grouped[ticker].append(_article_to_move_item(article))
    return {
        ticker: _fresh_items(rows, reference=reference)
        for ticker, rows in grouped.items()
    }


def _research_row(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    current_items: list[dict[str, Any]],
    market: str,
    universe_id: str,
    store: TraceMoneyStore,
    reference: datetime,
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
        explanation["external_source"] = "company_news"
        return explanation

    # This is the expensive last mile: only names without evidence in the
    # current company-news feeds receive a web/context lookup and Firecrawl
    # extraction. The helper is evidence-bound and returns None when it cannot
    # support a move-specific explanation.
    return _context_rescue_move_explanation(
        instrument=instrument,
        market=market,
        universe_id=universe_id,
        day_change_pct=float(day_change),
        store=store,
        limit=5,
        lookback_hours=ANOMALY_CONTEXT_RESCUE_LOOKBACK_HOURS,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Research reasons for the current daily mover snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--expected-price-session-phase", default=None)
    parser.add_argument("--require-web-revalidate", action="store_true")
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

    tickers = [str(row.get("ticker") or "").strip().upper() for row in rows]
    instruments = {
        str(item.get("ticker") or "").strip().upper(): item
        for item in store.list_instruments(args.market, [str(row.get("instrument_id") or "") for row in rows])
        if str(item.get("ticker") or "").strip()
    }
    intelligence = store.get_stock_intelligence_docs_batch(
        args.market, args.universe, [str(row.get("instrument_id") or "") for row in rows]
    )
    source_items = _source_items_by_ticker(tickers, market=args.market, reference=reference)

    reasoned = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in rows:
        # The anomaly feed is a move-reasoning product. Never carry old
        # generic brief prose forward merely because its timestamp was recent.
        # A row becomes displayable only after this job finds move-specific
        # evidence for the snapshot it was given.
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
        ) + source_items.get(ticker, [])
        explanation = _research_row(
            row=row,
            instrument=instrument,
            current_items=_fresh_items(evidence, reference=row_reference),
            market=args.market,
            universe_id=args.universe,
            store=store,
            reference=row_reference,
        )
        if not explanation:
            continue
        row["move_explanation"] = explanation
        # `narrative_status` gates display. Here it means an evidence-backed
        # explanation for this exact price snapshot, not a generic stock brief.
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
