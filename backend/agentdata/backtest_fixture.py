"""Builds the shared fixture that keeps the two backtest engines honest.

    python3 -m backend.agentdata.backtest_fixture           # check expected.json
    python3 -m backend.agentdata.backtest_fixture --write   # regenerate all three files

Files, in ``lib/backtest/fixtures``:

* ``panel.json``    synthetic prices (integer random walk, no real data), size
                    factors, congress-style events and a fundamentals snapshot
* ``cases.json``    rule specs with the universe each one runs on
* ``expected.json`` the Python engine's answers, digested

``backend/tests/test_agentdata_backtest.py`` and ``lib/backtest/engine.test.ts``
both run their engine over the panel and compare with ``expected.json``.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from . import backtest

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "lib" / "backtest" / "fixtures"
SESSIONS = 1000

# symbol: (seed, drift per session in 1/100000, swing in 1/100000, start session, start price)
_SERIES = {
    "SPY": (11, 45, 900, 0, 250.0),
    "AAA": (23, 90, 1800, 0, 40.0),
    "BBB": (37, 20, 700, 0, 95.0),
    "CCC": (41, -10, 1500, 0, 60.0),
    "DDD": (53, 70, 2600, 0, 12.0),
    "EEE": (67, 35, 600, 0, 150.0),
    "FFF": (79, 55, 1200, 0, 33.0),
    "GGG": (83, 110, 3200, 0, 8.0),
    "HHH": (97, 15, 500, 0, 210.0),
    "III": (101, 60, 1400, 380, 25.0),  # lists part way through
    "JJJ": (113, 40, 1100, 0, 72.0),  # stops trading before the end
    "KKK": (127, 65, 1700, 0, 18.0),  # has a two week hole
    "LLL": (131, 25, 800, 0, 44.0),
}
_JJJ_LAST_SESSION = 820
_KKK_HOLE = (500, 510)


def _calendar() -> list[str]:
    days: list[str] = []
    cursor = date(2019, 1, 2)
    while len(days) < SESSIONS:
        if cursor.weekday() < 5:
            days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return days


def build_panel() -> dict[str, Any]:
    calendar = _calendar()
    series: dict[str, dict[str, Any]] = {}
    for symbol, (seed, drift, swing, start, price) in _SERIES.items():
        state = seed
        dates: list[str] = []
        closes: list[float] = []
        for index in range(start, SESSIONS):
            state = (state * 1103515245 + 12345) % 2147483648
            step = ((state >> 8) % 2001) - 1000  # -1000..1000
            price = price * (1.0 + (drift + swing * step / 1000.0) / 100000.0)
            if symbol == "JJJ" and index > _JJJ_LAST_SESSION:
                break
            if symbol == "KKK" and _KKK_HOLE[0] <= index < _KKK_HOLE[1]:
                continue
            dates.append(calendar[index])
            closes.append(round(price, 2))
        series[symbol] = {"dates": dates, "closes": closes}

    size_factors = {
        "AAA": 5.0e9, "BBB": 2.0e9, "CCC": 1.2e9, "DDD": 9.0e9, "EEE": 0.8e9, "FFF": 3.0e9,
        "GGG": 4.0e9, "HHH": 0.6e9, "III": 7.0e9, "JJJ": 1.0e9, "KKK": 2.5e9,
    }  # LLL has no size factor on purpose

    events: list[dict[str, str]] = []
    state = 7
    for index in range(520, SESSIONS, 3):
        state = (state * 1103515245 + 12345) % 2147483648
        symbol = sorted(size_factors.keys())[(state >> 8) % len(size_factors)]
        side = "buy" if (state >> 5) % 3 != 0 else "sell"
        events.append({"symbol": symbol, "date": calendar[index], "side": side})

    fundamentals = {
        "AAA": {"fcf_yield": 3.1, "roic": 22.0, "shareholder_yield": 1.2},
        "BBB": {"fcf_yield": 7.4, "roic": 9.5, "shareholder_yield": 4.0},
        "CCC": {"fcf_yield": 9.9, "roic": 17.0, "shareholder_yield": 6.5},
        "DDD": {"fcf_yield": -1.5, "roic": 31.0, "shareholder_yield": 0.0},
        "EEE": {"fcf_yield": 5.5, "roic": 16.0, "shareholder_yield": 2.2},
        "FFF": {"fcf_yield": 6.1, "roic": 15.0},
        "HHH": {"fcf_yield": 4.4, "roic": 40.0, "shareholder_yield": 3.3},
        "KKK": {"fcf_yield": 8.0, "roic": 12.0, "shareholder_yield": 5.1},
    }
    return {
        "note": "Synthetic prices for engine parity tests. Not market data.",
        "prices": series,
        "size_factors": size_factors,
        "events": events,
        "fundamentals": fundamentals,
    }


_STOCKS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ", "KKK", "LLL"]


def build_cases() -> dict[str, Any]:
    stocks = {"universe": _STOCKS, "universe_label": "test companies", "universe_kind": "stocks", "universe_partial": True}
    return {
        "backtests": [
            {
                "name": "momentum",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "rank": [{"type": "momentum", "months": 6, "skip_months": 1}],
                    "holdings": 4,
                },
            },
            {
                "name": "low_volatility_rank_weighted_quarterly",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "rank": [{"type": "low_volatility", "days": 120}],
                    "holdings": 3,
                    "weighting": "rank",
                    "rebalance": "quarterly",
                    "cost_bps": 25,
                },
            },
            {
                "name": "trend_with_market_filter",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "filters": [{"type": "trend", "ma_days": 100, "min": 0}],
                    "rank": [{"type": "momentum", "months": 3, "skip_months": 0}],
                    "market_filter": {"symbol": "SPY", "ma_days": 100},
                    "holdings": 4,
                },
            },
            {
                "name": "near_high_weekly_free",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "filters": [{"type": "near_high", "days": 120, "min": -0.08}],
                    "rank": [
                        {"type": "near_high", "days": 120, "weight": 1},
                        {"type": "momentum", "months": 3, "skip_months": 0, "weight": 2},
                    ],
                    "holdings": 5,
                    "rebalance": "weekly",
                    "cost_bps": 0,
                },
            },
            {
                "name": "largest_six_momentum",
                **stocks,
                "spec": {
                    "universe": {"id": "test", "top_by_size": 6},
                    "rank": [{"type": "momentum", "months": 6, "skip_months": 1}],
                    "holdings": 2,
                },
            },
            {
                "name": "congress_net_buying",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "filters": [
                        {"type": "congress_net_buying", "window_days": 90, "min": 1},
                        {"type": "trend", "ma_days": 50, "min": 0},
                    ],
                    "rank": [
                        {"type": "congress_net_buying", "window_days": 90, "weight": 2},
                        {"type": "momentum", "months": 3, "skip_months": 0, "weight": 1},
                    ],
                    "holdings": 3,
                },
            },
            {
                "name": "momentum_and_calm_bounded",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "rank": [
                        {"type": "momentum", "months": 12, "skip_months": 1},
                        {"type": "low_volatility", "days": 252},
                    ],
                    "holdings": 3,
                    "start": "2020-06-01",
                    "end": "2022-03-31",
                },
            },
            {
                "name": "funds_short_window",
                "universe": ["BBB", "EEE", "HHH", "LLL"],
                "universe_label": "sector funds",
                "universe_kind": "funds",
                "universe_partial": False,
                "spec": {
                    "universe": {"symbols": ["BBB", "EEE", "HHH", "LLL"]},
                    "rank": [{"type": "momentum", "months": 6, "skip_months": 0}],
                    "holdings": 2,
                    "start": "2022-01-03",
                },
            },
            {
                "name": "buy_the_dip",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "filters": [{"type": "trend", "ma_days": 200, "min": 0}],
                    "rank": [{"type": "pullback", "days": 21}],
                    "holdings": 3,
                },
            },
        ],
        "weights": [
            {
                "name": "three_names_monthly",
                "input": {
                    "holdings": [
                        {"symbol": "AAA", "weight": 50},
                        {"symbol": "DDD", "weight": 30},
                        {"symbol": "HHH", "weight": 20},
                    ],
                    "rebalance": "monthly",
                },
            },
            {
                "name": "late_listing_never_rebalanced",
                "input": {
                    "holdings": [{"symbol": "III", "weight": 1}, {"symbol": "BBB", "weight": 3}],
                    "rebalance": "never",
                    "start": "2019-06-03",
                    "cost_bps": 0,
                },
            },
            {
                "name": "yearly_bounded_stops_trading",
                "input": {
                    "holdings": [
                        {"symbol": "JJJ", "weight": 0.25},
                        {"symbol": "KKK", "weight": 0.25},
                        {"symbol": "LLL", "weight": 0.5},
                    ],
                    "rebalance": "yearly",
                    "benchmark": "AAA",
                    "start": "2020-03-02",
                    "end": "2022-11-30",
                    "cost_bps": 25,
                },
            },
            {
                "name": "single_quarterly",
                "input": {"holdings": [{"symbol": "GGG", "weight": 1}], "rebalance": "quarterly"},
            },
        ],
        "picks": [
            {
                "name": "cheap_quality_today",
                **stocks,
                "spec": {
                    "universe": {"id": "test"},
                    "filters": [{"type": "fundamental", "field": "roic", "min": 15}],
                    "rank": [
                        {"type": "fundamental", "field": "fcf_yield"},
                        {"type": "fundamental", "field": "roic"},
                    ],
                    "holdings": 3,
                },
            },
            {
                "name": "largest_five_payout_today",
                **stocks,
                "spec": {
                    "universe": {"id": "test", "top_by_size": 5},
                    "rank": [{"type": "fundamental", "field": "shareholder_yield"}],
                    "holdings": 2,
                    "weighting": "rank",
                },
            },
        ],
    }


def case_data(panel: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    return {
        "prices": panel["prices"],
        "universe": case["universe"],
        "universe_label": case["universe_label"],
        "universe_kind": case["universe_kind"],
        "universe_partial": case["universe_partial"],
        "size_factors": panel["size_factors"],
        "events": panel["events"],
        "fundamentals": panel["fundamentals"],
    }


def digest(result: dict[str, Any]) -> dict[str, Any]:
    """Shrink a backtest result to something worth committing. Mirrored in engine.test.ts."""
    curve = result["curve"]
    strategy_sum = 0.0
    benchmark_sum = 0.0
    for value in curve["strategy"]:
        strategy_sum += value
    for value in curve["benchmark"]:
        benchmark_sum += value
    out = dict(result)
    out["curve"] = {
        "points": len(curve["dates"]),
        "first_date": curve["dates"][0],
        "last_date": curve["dates"][-1],
        "strategy_sum": backtest.r4(strategy_sum),
        "benchmark_sum": backtest.r4(benchmark_sum),
        "strategy_samples": curve["strategy"][::50],
        "benchmark_samples": curve["benchmark"][::50],
    }
    return out


def digest_weights(result: dict[str, Any]) -> dict[str, Any]:
    return digest(result)


def build_expected(panel: dict[str, Any], cases: dict[str, Any]) -> dict[str, Any]:
    return {
        "backtests": {
            case["name"]: digest(backtest.run_backtest(case["spec"], case_data(panel, case)))
            for case in cases["backtests"]
        },
        "weights": {
            case["name"]: digest_weights(backtest.run_weights_backtest(case["input"], panel["prices"]))
            for case in cases["weights"]
        },
        "picks": {
            case["name"]: backtest.current_picks(case["spec"], case_data(panel, case)) for case in cases["picks"]
        },
    }


def _dump(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n")


def main() -> int:
    panel = build_panel()
    cases = build_cases()
    expected = build_expected(panel, cases)
    if "--write" in sys.argv:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
        _dump(FIXTURE_DIR / "panel.json", panel)
        _dump(FIXTURE_DIR / "cases.json", cases)
        _dump(FIXTURE_DIR / "expected.json", expected)
        print(f"wrote fixture to {FIXTURE_DIR}")
        return 0
    stored = json.loads((FIXTURE_DIR / "expected.json").read_text())
    same = json.dumps(stored, sort_keys=True) == json.dumps(json.loads(json.dumps(expected)), sort_keys=True)
    print("expected.json matches the engine" if same else "expected.json is out of date: rerun with --write")
    return 0 if same else 1


if __name__ == "__main__":
    raise SystemExit(main())
