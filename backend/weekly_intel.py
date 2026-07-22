"""Shared helpers for the weekly report email pipeline."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.email_content import clean_optional_email_text

WEEKLY_BOOK_MOVE_THRESHOLD = 2.0
INDEX_INSTRUMENT_IDS = ("US_IDX_SPX", "US_IDX_NDX")


def week_label_ending(ref: datetime | None = None) -> str:
    ref = ref or datetime.now(timezone.utc)
    end = ref.date()
    while end.weekday() > 4:
        end -= timedelta(days=1)
    start = end - timedelta(days=4)
    if start.month == end.month:
        return f"{start.strftime('%b %d')}–{end.strftime('%d, %Y')}"
    return f"{start.strftime('%b %d')}–{end.strftime('%b %d, %Y')}"


def iso_week_dedupe_key(ref: datetime | None = None) -> str:
    ref = ref or datetime.now(timezone.utc)
    year, week, _ = ref.isocalendar()
    return f"{year}-W{week:02d}"


def sector_summary_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        sector = str(row.get("sector") or "Other").strip() or "Other"
        try:
            move = float(row.get("week_change_pct") or 0)
        except (TypeError, ValueError):
            continue
        buckets[sector].append(move)

    summary: list[dict[str, Any]] = []
    for sector, moves in buckets.items():
        if not moves:
            continue
        avg = sum(moves) / len(moves)
        summary.append({
            "sector": sector,
            "avg_move_pct": round(avg, 2),
            "count": len(moves),
        })
    summary.sort(key=lambda item: abs(float(item["avg_move_pct"])), reverse=True)
    return summary[:8]


def book_tape_line(row: dict[str, Any]) -> str:
    for key in ("today_brief", "thesis", "summary"):
        text = clean_optional_email_text(row.get(key), max_chars=220)
        if text and not _is_generic_weekly_tape(text):
            return text[:220]
    headline = clean_optional_email_text(row.get("headline") or row.get("anomaly_headline"), max_chars=220)
    if headline and not _is_generic_weekly_tape(headline):
        return headline[:220]
    catalyst = clean_optional_email_text(row.get("catalyst"), max_chars=220)
    if catalyst and not _is_generic_weekly_tape(catalyst):
        return catalyst[:220]
    return ""


def _is_generic_weekly_tape(text: str) -> bool:
    lowered = str(text or "").strip().lower()
    if not lowered:
        return True
    generic_prefixes = (
        "finished the week",
        "is a top up mover",
        "is a top down mover",
        "is moving sharply",
        "move is driven by price momentum",
        "watch for follow-through",
    )
    return any(lowered.startswith(prefix) or prefix in lowered for prefix in generic_prefixes)


def intel_tape_line(intel_doc: dict[str, Any] | None) -> str:
    intel_doc = intel_doc or {}
    for key in ("today_brief", "body", "thesis"):
        text = clean_optional_email_text(intel_doc.get(key), max_chars=220)
        if text and not _is_generic_weekly_tape(text):
            return text[:220]
    headline = clean_optional_email_text(intel_doc.get("headline"), max_chars=220)
    if headline and not _is_generic_weekly_tape(headline):
        return headline[:220]
    catalyst = clean_optional_email_text(intel_doc.get("catalyst"), max_chars=220)
    if catalyst and not _is_generic_weekly_tape(catalyst):
        return catalyst[:220]
    visual = intel_doc.get("visual_summary")
    if isinstance(visual, dict):
        text = clean_optional_email_text(visual.get("why_it_matters") or visual.get("what_changed"), max_chars=220)
        if text and not _is_generic_weekly_tape(text):
            return text[:220]
    return ""


def resolve_weekly_book_tape(
    *,
    row: dict[str, Any],
    intel_doc: dict[str, Any] | None = None,
    anomaly_item: dict[str, Any] | None = None,
) -> str:
    from backend.open_email_intel import anomaly_tape_line, is_weak_move_explanation

    if anomaly_item:
        tape = anomaly_tape_line(anomaly_item)
        if tape and not _is_generic_weekly_tape(tape):
            if not is_weak_move_explanation(anomaly_item):
                return tape

    tape = intel_tape_line(intel_doc)
    if tape:
        return tape

    return book_tape_line(row)


def load_weekly_book_context(
    store: Any,
    *,
    market: str,
    rows: list[dict[str, Any]],
) -> dict[str, str]:
    market = market.upper()
    tickers = [
        str(row.get("ticker") or "").strip().upper()
        for row in rows
        if str(row.get("ticker") or "").strip()
    ]
    if not tickers:
        return {}

    universe_id = str(store.get_active_ai_universe(market) or "").strip()
    instrument_ids = [
        str(row.get("instrument_id") or "").strip().upper()
        for row in rows
        if str(row.get("instrument_id") or "").strip()
    ]

    intel_by_id: dict[str, dict[str, Any]] = {}
    if universe_id and instrument_ids:
        intel_by_id = store.get_stock_intelligence_docs_batch(market, universe_id, instrument_ids)

    anomaly_docs = store.get_daily_anomaly_ticker_docs_batch(market, tickers)

    out: dict[str, str] = {}
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        iid = str(row.get("instrument_id") or "").strip().upper()
        anomaly_doc = anomaly_docs.get(f"{market}__{ticker}") or {}
        anomaly_item = anomaly_doc.get("anomaly") if isinstance(anomaly_doc.get("anomaly"), dict) else None
        tape = resolve_weekly_book_tape(
            row=row,
            intel_doc=intel_by_id.get(iid),
            anomaly_item=anomaly_item,
        )
        if tape:
            out[ticker] = tape
    return out


def book_sector_summary_line(
    book_hits: list[tuple[dict[str, Any], dict[str, Any], float]],
    *,
    sector_summary: list[dict[str, Any]],
) -> str:
    if not book_hits:
        return ""
    sector_counts: dict[str, int] = defaultdict(int)
    for row, _hit, _move in book_hits:
        sector = str(row.get("sector") or "").strip()
        if sector:
            sector_counts[sector] += 1
    if not sector_counts:
        return ""

    lead_sector, count = max(sector_counts.items(), key=lambda item: item[1])
    if count < 2:
        return ""

    avg_by_sector = {
        str(item.get("sector") or ""): float(item.get("avg_move_pct") or 0)
        for item in sector_summary
        if str(item.get("sector") or "").strip()
    }
    avg = avg_by_sector.get(lead_sector)
    if avg is None:
        return f"{count} names on your book sit in {lead_sector}."
    direction = "gained" if avg >= 0 else "fell"
    return f"{count} names on your book are {lead_sector} — the group {direction} {abs(avg):.1f}% this week."


def upcoming_earnings_on_book(
    store: Any,
    *,
    market: str,
    tickers: list[str],
    days: int = 7,
) -> list[dict[str, Any]]:
    market = market.upper()
    ticker_set = {str(t or "").strip().upper() for t in tickers if str(t or "").strip()}
    if not ticker_set:
        return []

    start = datetime.now(timezone.utc).date()
    end = start + timedelta(days=max(1, days))
    out: list[dict[str, Any]] = []
    try:
        snap = (
            store.db.collection("tm_earnings_events")
            .where("market", "==", market)
            .where("event_date", ">=", start.isoformat())
            .where("event_date", "<=", end.isoformat())
            .get()
        )
    except Exception:
        return []

    for doc in snap:
        row = doc.to_dict() or {}
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker not in ticker_set:
            continue
        out.append({
            "ticker": ticker,
            "event_date": str(row.get("event_date") or ""),
            "time": str(row.get("time") or row.get("event_time") or "").strip(),
            "company": str(row.get("company") or row.get("name") or ticker).strip(),
        })

    out.sort(key=lambda item: (item.get("event_date") or "", item.get("ticker") or ""))
    return out[:6]
