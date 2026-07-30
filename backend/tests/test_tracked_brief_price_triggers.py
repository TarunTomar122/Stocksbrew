from __future__ import annotations

import unittest

from backend.scripts.build_per_stock_intelligence import (
    _material_price_signal,
    _price_signal_changed_materially,
)


def _price_doc(*, current: float, day_change: float, prior: list[tuple[str, float]]) -> dict:
    return {
        "captured_at": "2026-07-30T14:00:00+00:00",
        "quote": {
            "current": current,
            "day_change_pct": day_change,
            "captured_at": "2026-07-30T14:00:00+00:00",
        },
        "recent_sessions": [
            {
                "date": day,
                "close": price,
            }
            for day, price in prior
        ],
    }


class TrackedBriefPriceTriggerTest(unittest.TestCase):
    def test_large_move_against_prior_five_sessions_is_a_reversal_trigger(self) -> None:
        signal = _material_price_signal(
            _price_doc(
                current=130,
                day_change=8.3,
                prior=[
                    ("2026-07-23", 180),
                    ("2026-07-24", 170),
                    ("2026-07-27", 160),
                    ("2026-07-28", 150),
                    ("2026-07-29", 120),
                ],
            ),
            phase="open_check",
        )

        self.assertIsNotNone(signal)
        self.assertTrue(signal["reversal"])
        self.assertEqual(signal["day_change_pct"], 8.3)
        self.assertEqual(signal["prior_five_session_change_pct"], -33.33)

    def test_small_quote_tick_does_not_trigger_an_ai_refresh(self) -> None:
        signal = _material_price_signal(
            _price_doc(
                current=101,
                day_change=1.0,
                prior=[
                    ("2026-07-23", 99),
                    ("2026-07-24", 100),
                    ("2026-07-27", 99),
                    ("2026-07-28", 100),
                    ("2026-07-29", 100),
                ],
            ),
            phase="open_check",
        )

        self.assertIsNone(signal)

    def test_sparse_fetch_history_is_not_treated_as_session_tape(self) -> None:
        price_doc = {
            "captured_at": "2026-07-30T14:00:00+00:00",
            "quote": {
                "current": 130,
                "day_change_pct": 8.3,
                "captured_at": "2026-07-30T14:00:00+00:00",
            },
            "history_window": [
                {
                    "captured_at": "2026-07-01T20:00:00+00:00",
                    "quote": {"current": 100},
                },
                {
                    "captured_at": "2026-07-22T20:00:00+00:00",
                    "quote": {"current": 120},
                },
            ],
        }

        self.assertIsNone(_material_price_signal(price_doc, phase="open_check"))

    def test_phase_change_alone_does_not_change_price_fingerprint(self) -> None:
        price_doc = _price_doc(
            current=130,
            day_change=8.3,
            prior=[
                ("2026-07-23", 180),
                ("2026-07-24", 170),
                ("2026-07-27", 160),
                ("2026-07-28", 150),
                ("2026-07-29", 120),
            ],
        )

        open_signal = _material_price_signal(price_doc, phase="open_check")
        close_signal = _material_price_signal(price_doc, phase="postclose")

        self.assertEqual(open_signal["fingerprint"], close_signal["fingerprint"])

    def test_small_same_day_tape_drift_reuses_existing_brief(self) -> None:
        previous_signal = {
            "captured_day": "2026-07-30",
            "phase": "open_check",
            "day_change_pct": 8.3,
            "prior_five_session_change_pct": -33.33,
            "five_session_change_pct": -27.78,
            "reversal": True,
            "continuation": False,
            "breakout": False,
            "fingerprint": "open",
        }
        close_signal = dict(
            previous_signal,
            phase="postclose",
            day_change_pct=8.8,
            five_session_change_pct=-27.3,
            fingerprint="close",
        )

        self.assertFalse(
            _price_signal_changed_materially(
                close_signal,
                {"price_brief_signal": previous_signal},
            )
        )

    def test_material_same_day_tape_change_refreshes_brief(self) -> None:
        previous_signal = {
            "captured_day": "2026-07-30",
            "phase": "open_check",
            "day_change_pct": 5.2,
            "prior_five_session_change_pct": 3.0,
            "five_session_change_pct": 8.3,
            "reversal": False,
            "continuation": False,
            "breakout": False,
            "fingerprint": "open",
        }
        close_signal = dict(
            previous_signal,
            phase="postclose",
            day_change_pct=10.4,
            five_session_change_pct=13.9,
            continuation=True,
            fingerprint="close",
        )

        self.assertTrue(
            _price_signal_changed_materially(
                close_signal,
                {"price_brief_signal": previous_signal},
            )
        )
