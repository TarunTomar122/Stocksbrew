from __future__ import annotations

import unittest

from backend.emails.premarket_brief import build_premarket_brief_email


class PremarketBriefTemplateTests(unittest.TestCase):
    def test_tape_layout_includes_news_gaps_and_sectors(self) -> None:
        premarket = {
            "by_ticker": {
                "NVDA": {
                    "pre_market_price": 142.5,
                    "previous_close": 138.0,
                    "pre_market_change_pct": 3.2,
                }
            },
            "gappers_up": [
                {
                    "ticker": "NVDA",
                    "sector": "Semiconductors",
                    "pre_market_price": 142.5,
                    "pre_market_change_pct": 3.2,
                }
            ],
            "gappers_down": [
                {
                    "ticker": "INTC",
                    "sector": "Semiconductors",
                    "pre_market_price": 21.0,
                    "pre_market_change_pct": -2.5,
                }
            ],
            "sector_summary": [{"sector": "Semiconductors", "avg_gap_pct": 2.1, "count": 4}],
        }
        subject, html = build_premarket_brief_email(
            first_name="Arun",
            premarket=premarket,
            rows=[{"ticker": "NVDA", "name": "NVIDIA"}],
            premarket_context={
                "by_ticker": {
                    "NVDA": {
                        "headline": "Nvidia launches its next data-center platform",
                        "why": "Nvidia's new platform expands its enterprise AI offering.",
                        "tape_line": "Nvidia launched a new data-center platform aimed at expanding enterprise AI demand.",
                        "source": "IBD",
                    },
                }
            },
            overnight_headlines={
                "NVDA": {"headline": "Overnight headline should not override mover context", "source": "Yahoo"},
            },
        )
        self.assertIn("NVDA", subject)
        self.assertIn("News on your book", html)
        self.assertNotIn("Your book gapping", html)
        self.assertIn("Biggest pre-market movers", html)
        self.assertIn("Top gainers", html)
        self.assertIn("Top losers", html)
        self.assertIn("Sectors pre-market", html)
        self.assertIn("Nvidia launched a new data-center platform", html)
        self.assertNotIn("action_now", html.lower())
        self.assertNotIn("trim", html.lower())


if __name__ == "__main__":
    unittest.main()
