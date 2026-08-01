from __future__ import annotations

from backend.interesting_stocks import (
    MIN_INTERESTING_SCORE,
    TOP_ROW_COUNT,
    _apply_sector_cap,
    risk_reward_ratio,
    score_interesting_row,
    session_move_stats,
)


def _intel_doc(stance: str = "accumulate", target: float = 110.0, break_price: float = 92.0) -> dict:
    return {
        "instrument_id": "US_TEST",
        "ticker": "TEST",
        "current_price": 100.0,
        "directive_v2": {
            "stance": stance,
            "action": {"label": "Accumulate setup", "summary": "The setup remains actionable."},
            "zones": {"trim_above": target, "accumulate_below": break_price},
            "setup": {"risk_reward": "favorable"},
        },
        "visual_summary": {"why_it_matters": "Clean pullback into support with improving sentiment."},
    }


def test_session_move_stats_detects_big_jump() -> None:
    price_doc = {
        "history_window": [
            {"quote": {"current": 100.0}},
            {"quote": {"current": 112.0}},
        ],
        "quote": {"day_change_pct": 12.0, "current": 112.0},
    }
    stats = session_move_stats(price_doc, lookback=5)
    assert stats["big_jump"] is True
    assert stats["max_abs_pct"] >= 10.0


def test_risk_reward_ratio_from_directive() -> None:
    intel = _intel_doc(target=115.0, break_price=95.0)
    ratio = risk_reward_ratio(intel, 100.0)
    assert ratio is not None
    assert ratio > 1.0


def test_score_rejects_unfavorable_setup() -> None:
    intel = {
        "current_price": 100.0,
        "overall_score": 22,
        "overall_label": "bearish",
        "setup_state": "exhaustion",
        "visual_summary": {
            "drivers": [{"direction": "down", "strength": 6}],
            "risk_cards": [{"detail": "risk one"}, {"detail": "risk two"}, {"detail": "risk three"}],
        },
        "news_digest": {"direction": "negative", "hard_catalyst": True},
        "directive_v2": {
            "stance": "avoid",
            "action": {"label": "Avoid for now", "summary": "The setup is unfavorable."},
            "zones": {"trim_above": 102.0, "accumulate_below": 98.0},
            "setup": {"risk_reward": "unfavorable"},
        },
    }
    score, _tags, _setup, _headline, eligible = score_interesting_row(
        instrument_id="US_TEST",
        intel_doc=intel,
        intel_pro={"overall_score": 22},
        price_doc={"quote": {"current": 100.0, "day_change_pct": -2.0}},
        rsi_14=55.0,
        anomaly=None,
        reddit=None,
        instrument_meta=None,
    )
    assert eligible is False
    assert score == 0.0


def test_score_accepts_favorable_accumulate_setup() -> None:
    intel = _intel_doc(stance="accumulate", target=120.0, break_price=94.0)
    score, tags, setup, _headline, eligible = score_interesting_row(
        instrument_id="US_TEST",
        intel_doc=intel,
        intel_pro={"overall_score": 72},
        price_doc={
            "quote": {"current": 100.0, "day_change_pct": 1.8},
            "history_window": [
                {"quote": {"current": 96.0}},
                {"quote": {"current": 100.0}},
            ],
        },
        rsi_14=58.0,
        anomaly={"day_change_pct": 4.2},
        reddit={"mention_count": 4},
        instrument_meta=None,
    )
    assert eligible is True
    assert score >= MIN_INTERESTING_SCORE
    assert setup in {"accumulate_setup", "momentum_setup", "breakout_watch"}
    assert any("R/R" in tag or "Accumulate" in tag for tag in tags)


def test_sector_cap_ignores_unknown_bucket_and_backfills_to_ten() -> None:
    rows = [
        {
            "instrument_id": f"US_T{i}",
            "ticker": f"T{i}",
            "sector": "Unknown",
            "interesting_score": 100 - i,
        }
        for i in range(12)
    ]
    selected = _apply_sector_cap(rows, TOP_ROW_COUNT)
    assert len(selected) == TOP_ROW_COUNT
    assert {row["ticker"] for row in selected} == {f"T{i}" for i in range(TOP_ROW_COUNT)}
