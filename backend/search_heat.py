"""Demand-ranked long-tail stock coverage selection."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable


def _parse_iso(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def rank_search_heat_rows(
    rows: Iterable[dict[str, Any]],
    *,
    market: str,
    valid_ids: set[str],
    now: datetime | None = None,
    cap: int = 20,
    min_unique_24h: int = 3,
    min_unique_72h: int = 5,
) -> list[dict[str, Any]]:
    """Rank genuine multi-user demand while ignoring raw refresh volume.

    tm_stock_views is already bucketed by actor/instrument/hour. We count each
    actor once per ticker so one person refreshing cannot promote a stock.
    """
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cutoff_24h = current - timedelta(hours=24)
    cutoff_72h = current - timedelta(hours=72)
    actors_24h: dict[str, set[str]] = defaultdict(set)
    actors_72h: dict[str, set[str]] = defaultdict(set)
    last_seen: dict[str, datetime] = {}
    tickers: dict[str, str] = {}

    for row in rows:
        row_market = str(row.get("market") or "").strip().upper()
        if row_market and row_market != market.upper():
            continue
        instrument_id = str(row.get("instrument_id") or "").strip().upper()
        if not instrument_id or instrument_id not in valid_ids:
            continue
        seen_at = _parse_iso(row.get("updated_at") or row.get("created_at"))
        if not seen_at or seen_at < cutoff_72h or seen_at > current:
            continue
        uid = str(row.get("uid") or "").strip()
        anon_id = str(row.get("anon_id") or "").strip()
        actor = f"u:{uid}" if uid else (f"a:{anon_id}" if anon_id else "")
        if not actor:
            continue
        actors_72h[instrument_id].add(actor)
        if seen_at >= cutoff_24h:
            actors_24h[instrument_id].add(actor)
        if instrument_id not in last_seen or seen_at > last_seen[instrument_id]:
            last_seen[instrument_id] = seen_at
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker:
            tickers[instrument_id] = ticker

    ranked: list[dict[str, Any]] = []
    for instrument_id, actors in actors_72h.items():
        unique_24h = len(actors_24h.get(instrument_id, set()))
        unique_72h = len(actors)
        if unique_24h < min_unique_24h and unique_72h < min_unique_72h:
            continue
        seen_at = last_seen[instrument_id]
        recency_hours = max(0.0, (current - seen_at).total_seconds() / 3600.0)
        recency_bonus = max(0.0, 24.0 - min(24.0, recency_hours)) / 24.0
        score = unique_24h * 5.0 + unique_72h + recency_bonus
        ranked.append(
            {
                "instrument_id": instrument_id,
                "ticker": tickers.get(instrument_id, instrument_id.split("_", 1)[-1]),
                "unique_actors_24h": unique_24h,
                "unique_actors_72h": unique_72h,
                "score": round(score, 3),
                "last_seen_at": seen_at.isoformat(),
            }
        )

    ranked.sort(
        key=lambda row: (
            float(row["score"]),
            int(row["unique_actors_24h"]),
            str(row["instrument_id"]),
        ),
        reverse=True,
    )
    return ranked[: max(0, cap)]
