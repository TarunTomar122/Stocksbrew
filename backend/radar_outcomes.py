"""Deterministic outcome measurements for historical Radar directives."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any


def _date(value: Any) -> date | None:
    raw = str(value or "")[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _price(point: dict[str, Any]) -> float | None:
    quote = point.get("quote") if isinstance(point.get("quote"), dict) else {}
    raw = quote.get("current")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _points(history: list[dict[str, Any]]) -> list[tuple[date, float]]:
    rows: list[tuple[date, float]] = []
    for point in history:
        captured = _date(point.get("captured_at"))
        price = _price(point)
        if captured and price is not None:
            rows.append((captured, price))
    rows.sort(key=lambda item: item[0])
    return rows


def _first_on_or_after(
    rows: list[tuple[date, float]],
    target: date,
) -> tuple[date, float] | None:
    return next((row for row in rows if row[0] >= target), None)


def measure_directive_outcome(
    call: dict[str, Any],
    history: list[dict[str, Any]],
    *,
    horizon_days: int,
    benchmark_history: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    call_date = _date(call.get("generated_at"))
    try:
        call_price = float(call.get("price_at_call"))
    except (TypeError, ValueError):
        return None
    if call_date is None or call_price <= 0:
        return None
    target_date = call_date + timedelta(days=max(1, horizon_days))
    rows = [(day, price) for day, price in _points(history) if day >= call_date]
    target = _first_on_or_after(rows, target_date)
    if target is None:
        return None
    observed = [(day, price) for day, price in rows if day <= target[0]]
    if not observed:
        return None
    return_pct = (target[1] - call_price) / call_price * 100.0
    lowest = min(price for _, price in observed)
    highest = max(price for _, price in observed)
    outcome: dict[str, Any] = {
        "horizon_days": horizon_days,
        "target_date": target_date.isoformat(),
        "observed_date": target[0].isoformat(),
        "price_at_call": round(call_price, 4),
        "price_at_horizon": round(target[1], 4),
        "return_pct": round(return_pct, 2),
        "max_drawdown_pct": round((lowest - call_price) / call_price * 100.0, 2),
        "max_gain_pct": round((highest - call_price) / call_price * 100.0, 2),
    }

    benchmark_rows = _points(benchmark_history or [])
    benchmark_start = _first_on_or_after(benchmark_rows, call_date)
    benchmark_end = _first_on_or_after(benchmark_rows, target_date)
    if benchmark_start and benchmark_end:
        benchmark_return = (
            (benchmark_end[1] - benchmark_start[1]) / benchmark_start[1] * 100.0
        )
        outcome["benchmark_return_pct"] = round(benchmark_return, 2)
        outcome["relative_return_pct"] = round(return_pct - benchmark_return, 2)
    return outcome


def horizon_key(days: int) -> str:
    return f"{max(1, int(days))}d"
