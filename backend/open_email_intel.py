"""Helpers for the after-open brief email."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.email_content import clean_optional_email_text
from backend.storage import TraceMoneyStore

OPEN_BOOK_MOVE_THRESHOLD = 2.0
OPEN_SNAPSHOT_MAX_AGE_MINUTES = 90
OPEN_QUOTE_MAX_AGE_MINUTES = 45
MARKET_TZ = {"US": "America/New_York", "IN": "Asia/Kolkata"}
WEAK_MOVE_HEADLINE_PREFIXES = (
    "no clear company-specific",
    "no clear driver",
)


def parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        parsed = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def timestamp_is_fresh(
    value: Any,
    *,
    now: datetime | None = None,
    max_age_minutes: int,
) -> bool:
    parsed = parse_iso_datetime(value)
    if parsed is None:
        return False
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    age_seconds = (reference - parsed).total_seconds()
    return -300 <= age_seconds <= max(1, max_age_minutes) * 60


def fresh_anomaly_rows(
    anomalies_doc: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    return [
        row
        for row in list((anomalies_doc or {}).get("anomalies") or [])
        if isinstance(row, dict)
        and timestamp_is_fresh(
            row.get("price_as_of"),
            now=now,
            max_age_minutes=OPEN_QUOTE_MAX_AGE_MINUTES,
        )
    ]


def has_fresh_open_snapshot(
    anomalies_doc: dict[str, Any] | None,
    *,
    market: str = "US",
    now: datetime | None = None,
) -> bool:
    if not anomalies_doc:
        return False
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    market_key = str(market or "US").upper()
    market_date = reference.astimezone(ZoneInfo(MARKET_TZ.get(market_key, MARKET_TZ["US"]))).date().isoformat()
    if str(anomalies_doc.get("date") or "") != market_date:
        return False
    if not timestamp_is_fresh(
        anomalies_doc.get("generated_at"),
        now=reference,
        max_age_minutes=OPEN_SNAPSHOT_MAX_AGE_MINUTES,
    ):
        return False
    return bool(fresh_anomaly_rows(anomalies_doc, now=reference))


def sector_summary_from_anomalies(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        sector = str(row.get("sector") or "Other").strip() or "Other"
        try:
            move = float(row.get("day_change_pct") or 0)
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


def fresh_sector_summary_from_prices(
    instruments: list[dict[str, Any]],
    prices: dict[str, dict[str, Any]],
    *,
    now: datetime | None = None,
) -> tuple[list[dict[str, Any]], str | None, int]:
    """Build real sector breadth from fresh quotes, not just anomaly picks."""
    rows: list[dict[str, Any]] = []
    captured: list[datetime] = []
    for instrument in instruments:
        instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
        if not instrument_id or "_MAC_" in instrument_id or "_IDX_" in instrument_id:
            continue
        sector = str(instrument.get("sector") or "").strip()
        if not sector:
            continue
        price_doc = prices.get(instrument_id) or {}
        price_as_of = price_doc.get("captured_at") or price_doc.get("updated_at")
        if not timestamp_is_fresh(
            price_as_of,
            now=now,
            max_age_minutes=OPEN_QUOTE_MAX_AGE_MINUTES,
        ):
            continue
        quote = price_doc.get("quote") if isinstance(price_doc.get("quote"), dict) else {}
        try:
            move = float(quote.get("day_change_pct"))
        except (TypeError, ValueError):
            continue
        parsed = parse_iso_datetime(price_as_of)
        if parsed is not None:
            captured.append(parsed)
        rows.append({"sector": sector, "day_change_pct": move})

    summary = sector_summary_from_anomalies(rows)
    # The oldest included quote is the honest freshness bound for the table.
    oldest_price_as_of = min(captured).isoformat() if captured else None
    return summary, oldest_price_as_of, len(rows)


def is_weak_move_explanation(row: dict[str, Any]) -> bool:
    move = row.get("move_explanation")
    if not isinstance(move, dict):
        return False
    if str(move.get("cause_type") or "").lower() == "unclear":
        return True
    headline = str(move.get("headline") or "").strip().lower()
    if any(headline.startswith(prefix) for prefix in WEAK_MOVE_HEADLINE_PREFIXES):
        return True
    why = str(move.get("why_it_matters") or "").strip()
    return why.startswith("The move is large, but current internal")


def anomaly_tape_line(row: dict[str, Any]) -> str:
    move = row.get("move_explanation")
    if isinstance(move, dict) and not is_weak_move_explanation(row):
        why = clean_optional_email_text(move.get("why_it_matters"), max_chars=220)
        headline = clean_optional_email_text(move.get("headline"), max_chars=220)
        if why and why != headline:
            return why[:220]
        if headline:
            return headline[:220]

    for key in ("today_brief", "thesis"):
        text = clean_optional_email_text(row.get(key), max_chars=220)
        if text:
            return text[:220]

    visual = row.get("visual_summary")
    if isinstance(visual, dict):
        for key in ("why_it_matters", "what_changed"):
            text = clean_optional_email_text(visual.get(key), max_chars=220)
            if text:
                return text

    headline = clean_optional_email_text(row.get("headline"), max_chars=220)
    if headline and not headline.lower().startswith("top "):
        return headline

    # The price/move already appears in the table.  Without an evidence-backed
    # explanation there is no additional narrative to send.
    return ""


def anomalies_by_ticker(anomalies_doc: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in list((anomalies_doc or {}).get("anomalies") or []):
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker:
            out[ticker] = row
    return out


def load_daily_anomalies(store: TraceMoneyStore, market: str) -> dict[str, Any] | None:
    doc = store.db.collection("tm_daily_anomalies").document(f"{market.upper()}__latest").get()
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    return data if isinstance(data, dict) else None
