from __future__ import annotations

from backend.radar_outcomes import measure_directive_outcome


def _point(day: str, price: float) -> dict:
    return {"captured_at": f"{day}T21:00:00+00:00", "quote": {"current": price}}


def test_outcome_measures_return_drawdown_and_benchmark() -> None:
    call = {
        "generated_at": "2026-06-01T21:00:00+00:00",
        "price_at_call": 100,
    }
    outcome = measure_directive_outcome(
        call,
        [
            _point("2026-06-01", 100),
            _point("2026-06-03", 95),
            _point("2026-06-08", 110),
        ],
        horizon_days=7,
        benchmark_history=[
            _point("2026-06-01", 5000),
            _point("2026-06-08", 5050),
        ],
    )
    assert outcome is not None
    assert outcome["return_pct"] == 10.0
    assert outcome["max_drawdown_pct"] == -5.0
    assert outcome["max_gain_pct"] == 10.0
    assert outcome["benchmark_return_pct"] == 1.0
    assert outcome["relative_return_pct"] == 9.0


def test_outcome_waits_until_horizon_is_observable() -> None:
    outcome = measure_directive_outcome(
        {
            "generated_at": "2026-06-01T21:00:00+00:00",
            "price_at_call": 100,
        },
        [_point("2026-06-02", 101)],
        horizon_days=7,
    )
    assert outcome is None
