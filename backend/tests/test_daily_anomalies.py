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

    def test_latest_timeline_items_uses_three_freshest_articles(self) -> None:
        rows = build_daily_anomalies._latest_timeline_items(
            {
                "timeline": [
                    {"timestamp": "2026-06-10T10:00:00Z", "title": "old", "summary": "old summary"},
                    {"timestamp": "2026-06-12T12:00:00Z", "title": "new", "summary": "new summary"},
                    {"timestamp": "2026-06-11T12:00:00Z", "title": "middle", "summary": "middle summary"},
                    {"timestamp": "2026-06-09T12:00:00Z", "title": "older", "summary": "older summary"},
                ]
            }
        )

        self.assertEqual([row["title"] for row in rows], ["new", "middle", "old"])

    def test_move_explanation_uses_llm_decision_over_articles(self) -> None:
        with patch.object(
            build_daily_anomalies,
            "_llm_move_explanation",
            return_value={
                "cause_type": "earnings",
                "headline": "ABC cuts guidance",
                "why_it_matters": "ABC cut guidance after orders slowed, giving investors a direct reason for the selloff.",
                "confidence": "high",
                "searched_externally": False,
                "evidence": [],
            },
        ) as explain:
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"timeline": [{"timestamp": "2026-06-12T12:00:00Z", "title": "ABC cuts guidance", "summary": "Orders slowed."}]},
                day_change_pct=-6.2,
                external_search=True,
            )

        explain.assert_called_once()
        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["headline"], "ABC cuts guidance")
        self.assertFalse(explanation["searched_externally"])

    def test_move_explanation_falls_back_when_llm_cannot_explain(self) -> None:
        with patch.object(build_daily_anomalies, "_llm_move_explanation", return_value=None):
            explanation = build_daily_anomalies._move_explanation(
                instrument={"ticker": "ABC", "name": "ABC Corp"},
                intel_doc={"timeline": [{"timestamp": "2026-06-12T12:00:00Z", "title": "Unrelated item", "summary": "No stock catalyst."}]},
                day_change_pct=8.1,
                external_search=True,
            )

        self.assertIsNotNone(explanation)
        self.assertEqual(explanation["cause_type"], "unclear")
        self.assertFalse(explanation["searched_externally"])


if __name__ == "__main__":
    unittest.main()
