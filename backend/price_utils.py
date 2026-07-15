from __future__ import annotations

import math
from typing import Any


def as_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def normalize_quote_change(quote: dict[str, Any]) -> dict[str, Any]:
    """Recompute day change fields from current and previous close when possible."""
    out = dict(quote)
    current = as_float(out.get("current"))
    previous_close = as_float(out.get("previous_close"))
    if current is None or previous_close is None or previous_close <= 0:
        return out
    change_abs = round(current - previous_close, 4)
    out["day_change_abs"] = change_abs
    out["day_change_pct"] = round((change_abs / previous_close) * 100.0, 2)
    return out


def has_valid_quote_change(quote: dict[str, Any]) -> bool:
    current = as_float(quote.get("current"))
    previous_close = as_float(quote.get("previous_close"))
    change_abs = as_float(quote.get("day_change_abs"))
    change_pct = as_float(quote.get("day_change_pct"))
    return bool(
        current is not None
        and current > 0
        and previous_close is not None
        and previous_close > 0
        and change_abs is not None
        and change_pct is not None
    )
