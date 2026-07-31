"""Daily price-history views over mutable latest-price documents."""
from __future__ import annotations

import math
from typing import Any, Mapping


def history_day_key(value: object) -> str | None:
    raw = str(value or "").strip()
    day = raw[:10]
    if len(day) != 10 or day[4:5] != "-" or day[7:8] != "-":
        return None
    return day


def latest_price_history(
    latest_price: Mapping[str, Any] | None,
    *,
    limit: int = 0,
) -> list[dict[str, Any]]:
    """Return one daily point per provider date with the live quote overlaid.

    Firestore keeps the mutable intraday quote at the document top level and
    updates the heavier rolling array only at daily boundaries. Consumers must
    therefore read the two fields as one logical series. The overlay strips
    container-only fields so a latest document is never nested recursively.
    """
    payload = latest_price or {}
    by_day: dict[str, dict[str, Any]] = {}
    for raw_row in payload.get("history_window") or []:
        if not isinstance(raw_row, Mapping):
            continue
        day = history_day_key(raw_row.get("captured_at"))
        if day:
            by_day[day] = dict(raw_row)

    quote = payload.get("quote")
    current = quote.get("current") if isinstance(quote, Mapping) else None
    latest_day = history_day_key(payload.get("captured_at"))
    if (
        latest_day
        and (not by_day or latest_day >= max(by_day))
        and isinstance(current, (int, float))
        and math.isfinite(float(current))
    ):
        by_day[latest_day] = {
            key: value
            for key, value in payload.items()
            if key not in {"history_window", "history_window_size", "updated_at"}
        }

    rows = [by_day[day] for day in sorted(by_day)]
    if limit > 0:
        rows = rows[-limit:]
    return rows
