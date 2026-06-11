from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.scripts import build_daily_anomalies


class DailyAnomaliesTest(unittest.TestCase):
    def test_move_explanation_ignores_small_moves(self) -> None:
        explanation = build_daily_anomalies._move_explanation(
            instrument={"ticker": "ABC", "name": "ABC Corp"},
            intel_doc={"headline": "ABC earnings beat estimates", "news_count": 3},
            day_change_pct=3.9,
            external_search=False,
        )

        self.assertIsNone(explanation)

    def test_move_explanation_uses_fresh_internal_evidence(self) -> None:
        explanation = build_daily_anomalies._move_explanation(
            instrument={"ticker": "ABC", "name": "ABC Corp"},
            intel_doc={
                "headline": "ABC shares fall after earnings miss",
                "today_brief": "Revenue missed estimates and management cut its outlook.",
                "news_count": 2,
            },
            day_change_pct=-6.2,
            external_search=True,
        )

        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["cause_type"], "earnings")
        self.assertEqual(explanation["confidence"], "high")
        self.assertFalse(explanation["searched_externally"])

    def test_move_explanation_rejects_directionally_stale_internal_text(self) -> None:
        with patch.object(build_daily_anomalies, "_search_move_explanation", return_value=None) as search:
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={
                    "headline": "ABC shares rally after product launch",
                    "today_brief": "Shares rose on strong demand.",
                    "news_count": 3,
                },
                day_change_pct=-5.1,
                external_search=True,
            )

        search.assert_called_once()
        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["cause_type"], "unclear")
        self.assertEqual(explanation["confidence"], "low")
        self.assertTrue(explanation["searched_externally"])


if __name__ == "__main__":
    unittest.main()
