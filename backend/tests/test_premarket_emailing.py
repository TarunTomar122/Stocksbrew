from __future__ import annotations

import unittest

from backend.lifecycle_emailing import email_pre_market_brief


class PremarketEmailingTest(unittest.TestCase):
    def test_dedupes_book_tickers_from_marketwide_and_reporting(self) -> None:
        premarket = {
            "by_ticker": {
                "NVDA": {"pre_market_change_pct": 2.1, "pre_market_price": 210.0},
                "ARM": {"pre_market_change_pct": 3.2, "pre_market_price": 140.0},
                "MU": {"pre_market_change_pct": -2.8, "pre_market_price": 98.0},
            },
            "gappers_up": [
                {"ticker": "NVDA", "name": "NVIDIA Corporation", "pre_market_change_pct": 2.1, "logo_url": ""},
                {"ticker": "ARM", "name": "Arm Holdings plc", "pre_market_change_pct": 3.2, "logo_url": ""},
            ],
            "gappers_down": [
                {"ticker": "MU", "name": "Micron Technology, Inc.", "pre_market_change_pct": -2.8, "logo_url": ""},
            ],
        }
        rows = [
            {"ticker": "NVDA", "position_type": "holding", "ai_directive_text": "Hold while above $210", "logo_url": ""},
            {"ticker": "ARM", "position_type": "watchlist", "ai_directive_text": "Watch breakout above 140", "logo_url": ""},
        ]
        reporting = [{"ticker": "NVDA"}, {"ticker": "MU"}]

        subject, html = email_pre_market_brief("Tarun", premarket, rows, reporting_today=reporting)
        self.assertIn("Before the open", subject)
        self.assertIn("On your book before the bell", html)
        self.assertIn("Moving before the bell", html)
        self.assertNotIn("Reporting before the open", html)
        self.assertIn("MU", html)
        self.assertEqual(html.count("Hold while above $210"), 1)
        self.assertEqual(html.count("Watch breakout above 140"), 1)

    def test_marketwide_section_keeps_non_book_names(self) -> None:
        premarket = {
            "by_ticker": {
                "NVDA": {"pre_market_change_pct": 2.1, "pre_market_price": 210.0},
            },
            "gappers_up": [
                {"ticker": "NVDA", "name": "NVIDIA Corporation", "pre_market_change_pct": 2.1, "logo_url": ""},
                {"ticker": "SMCI", "name": "Super Micro Computer Inc.", "pre_market_change_pct": 5.0, "logo_url": ""},
            ],
            "gappers_down": [],
        }
        rows = [
            {"ticker": "NVDA", "position_type": "holding", "ai_directive_text": "Hold while above $210", "logo_url": ""},
        ]

        _, html = email_pre_market_brief("Tarun", premarket, rows, reporting_today=[])
        self.assertIn("Moving before the bell", html)
        self.assertIn("SMCI", html)
        self.assertNotIn("Super Micro Computer Inc.", html[: html.find("Moving before the bell")])


if __name__ == "__main__":
    unittest.main()
