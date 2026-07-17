from __future__ import annotations

import unittest

from backend.stock_scoring import score_stock


class StockScoringCoverageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.instrument = {
            "instrument_id": "US_TEST",
            "ticker": "TEST",
            "sector": "Technology",
            "industry": "Software",
        }
        self.benchmarks = {
            "benchmarks": {
                "technology": {
                    "pe": 30.0,
                    "fwd_pe": 25.0,
                }
            }
        }

    def score(self, metrics: dict[str, float]) -> dict:
        return score_stock(
            self.instrument,
            {
                "metrics": metrics,
                "sector_slug": "technology",
                "sector_label": "Technology",
            },
            None,
            self.benchmarks,
        )

    def test_analyst_target_alone_does_not_become_valuation_score(self) -> None:
        result = self.score({"price": 71.5, "target_price": 87.8})
        valuation = result["pillars"]["valuation"]

        self.assertEqual(valuation["raw_score"], 92.8)
        self.assertEqual(valuation["coverage"], 0.3)
        self.assertEqual(valuation["score"], 50.0)
        self.assertEqual(valuation["verdict"], "insufficient data")
        self.assertEqual(valuation["available_metrics"], 1)
        self.assertEqual(valuation["total_metrics"], 4)

    def test_partial_coverage_is_shrunk_toward_neutral(self) -> None:
        result = self.score({"pe": 18.0, "fwd_pe": 15.0})
        valuation = result["pillars"]["valuation"]

        self.assertEqual(valuation["raw_score"], 100.0)
        self.assertEqual(valuation["coverage"], 0.5)
        self.assertEqual(valuation["score"], 75.0)
        self.assertEqual(valuation["verdict"], "strong")

    def test_no_evidence_is_neutral_and_insufficient(self) -> None:
        result = self.score({})
        valuation = result["pillars"]["valuation"]

        self.assertIsNone(valuation["raw_score"])
        self.assertEqual(valuation["coverage"], 0.0)
        self.assertEqual(valuation["score"], 50.0)
        self.assertEqual(valuation["verdict"], "insufficient data")
        self.assertEqual(result["overall"]["score"], 50.0)
        self.assertEqual(result["overall"]["verdict"], "insufficient data")


if __name__ == "__main__":
    unittest.main()
