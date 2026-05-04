from __future__ import annotations

import unittest

from backend.landing_metrics import (
    build_market_breadth_doc,
    build_stock_technical_doc,
    build_user_alert_flags,
)


class LandingMetricsTest(unittest.TestCase):
    def test_build_stock_technical_doc(self) -> None:
        instrument = {"instrument_id": "US_NVDA", "market": "US", "ticker": "NVDA"}
        latest = {
            "captured_at": "2026-04-19T10:00:00Z",
            "quote": {"current": 110.0, "volume": 1500, "day_change_pct": 2.0},
            "fundamentals": {"week_52_high": 140.0, "week_52_low": 70.0},
        }
        history = []
        for i in range(1, 80):
            history.append({
                "captured_at": f"2026-01-{i:02d}T10:00:00Z",
                "quote": {"current": 80 + i * 0.3, "volume": 900 + i},
            })

        doc = build_stock_technical_doc(instrument, latest, history, "2026-04-19")
        self.assertEqual(doc["instrument_id"], "US_NVDA")
        self.assertIn(doc["rsi_14"]["state"], {"overbought", "oversold", "neutral"})
        self.assertIsNotNone(doc["moving_averages"]["sma_20"])
        self.assertIsNotNone(doc["moving_averages"]["sma_50"])
        self.assertIsNone(doc["moving_averages"]["sma_200"])

    def test_build_market_breadth(self) -> None:
        latest_prices = {
            "US_A": {"quote": {"day_change_pct": 2.2, "volume": 1000, "current": 105}, "fundamentals": {"week_52_high": 104, "week_52_low": 80}},
            "US_B": {"quote": {"day_change_pct": -1.1, "volume": 2000, "current": 90}, "fundamentals": {"week_52_high": 120, "week_52_low": 90}},
            "US_C": {"quote": {"day_change_pct": 0.0, "volume": 500, "current": 50}, "fundamentals": {"week_52_high": 65, "week_52_low": 40}},
        }
        technical_docs = {
            "US_A": {"moving_averages": {"sma_20": 100, "price_vs_sma_20": "above", "sma_50": 95, "price_vs_sma_50": "above", "sma_200": None, "price_vs_sma_200": "insufficient_data"}},
            "US_B": {"moving_averages": {"sma_20": 95, "price_vs_sma_20": "below", "sma_50": 96, "price_vs_sma_50": "below", "sma_200": None, "price_vs_sma_200": "insufficient_data"}},
            "US_C": {"moving_averages": {"sma_20": 48, "price_vs_sma_20": "above", "sma_50": None, "price_vs_sma_50": "insufficient_data", "sma_200": None, "price_vs_sma_200": "insufficient_data"}},
        }
        breadth = build_market_breadth_doc("US", "us_test_5", "2026-04-19", latest_prices, technical_docs)
        self.assertEqual(breadth["advancers"], 1)
        self.assertEqual(breadth["decliners"], 1)
        self.assertEqual(breadth["unchanged"], 1)
        self.assertIsNotNone(breadth["pct_above_20dma"])

    def test_build_user_alert_flags(self) -> None:
        latest = {
            "US_NVDA": {"ticker": "NVDA", "quote": {"day_change_pct": -5.2, "volume": 3000, "current": 95}},
        }
        stock_intel = {
            "US_NVDA": {
                "overall_label": "bearish",
                "overall_score": 35,
                "timeline": [{"title": "Large downgrade", "sentiment_label": "bearish", "impact_score": 4}],
            }
        }
        technical = {"US_NVDA": {"rsi_14": {"state": "oversold", "value": 28.2}}}
        history = {
            "US_NVDA": [
                {"captured_at": f"2026-04-{day:02d}T10:00:00Z", "quote": {"current": 100 + day, "volume": 900}}
                for day in range(1, 15)
            ]
        }
        flags = build_user_alert_flags(
            user_id="u1",
            market="US",
            instrument_ids=["US_NVDA"],
            as_of_date="2026-04-19",
            latest_prices=latest,
            stock_intelligence=stock_intel,
            technical_docs=technical,
            price_histories=history,
        )
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["status"], "alert")
        self.assertGreater(flags[0]["flag_count"], 0)


if __name__ == "__main__":
    unittest.main()
