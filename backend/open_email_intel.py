"""Helpers for the after-open brief email."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from backend.storage import TraceMoneyStore

OPEN_BOOK_MOVE_THRESHOLD = 2.0
WEAK_MOVE_HEADLINE_PREFIXES = (
    "no clear company-specific",
    "no clear driver",
)


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
        why = str(move.get("why_it_matters") or "").strip()
        headline = str(move.get("headline") or "").strip()
        if why and why != headline:
            return why[:220]
        if headline:
            return headline[:220]

    for key in ("today_brief", "thesis"):
        text = str(row.get(key) or "").strip()
        if text:
            return text[:220]

    visual = row.get("visual_summary")
    if isinstance(visual, dict):
        text = str(visual.get("why_it_matters") or visual.get("what_changed") or "").strip()
        if text:
            return text[:220]

    headline = str(row.get("headline") or "").strip()
    if headline and not headline.lower().startswith("top "):
        return headline[:220]

    ticker = str(row.get("ticker") or "").strip().upper()
    direction = "up" if float(row.get("day_change_pct") or 0) >= 0 else "down"
    sector = str(row.get("sector") or "").strip()
    if sector:
        return f"{ticker} is a top {direction} mover in {sector}."
    return f"{ticker} is moving sharply after the open."


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
