from __future__ import annotations

import unittest

from backend.scripts.build_per_stock_intelligence import _material_price_signal


def _price_doc(*, current: float, day_change: float, prior: list[tuple[str, float]]) -> dict:
    return {
        "captured_at": "2026-07-30T14:00:00+00:00",
        "quote": {
            "current": current,
            "day_change_pct": day_change,
            "captured_at": "2026-07-30T14:00:00+00:00",
        },
        "history_window": [
            {
                "captured_at": f"{day}T20:00:00+00:00",
                "quote": {"current": price},
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
