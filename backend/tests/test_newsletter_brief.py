from __future__ import annotations

import unittest

from backend.emails.newsletter_brief import build_newsletter_brief_email


class NewsletterBriefTemplateTests(unittest.TestCase):
    def test_newsletter_layout_includes_sections_and_movers(self) -> None:
        snapshot = {
            "session_date": "2026-07-09",
            "phase_line": "The market is trending up, risk-on.",
            "indices": [
                {"label": "S&P 500", "day_change_pct": 0.8},
                {"label": "Nasdaq", "day_change_pct": 1.1},
            ],
            "brief": {
                "overview": "Tech led again.\n\nBreadth improved into the close.",
                "global_forces": "Rates stayed anchored while oil softened.",
                "outlook": "Watch whether chip strength holds into tomorrow's open.",
            },
            "gainers": [
                {
                    "ticker": "NVDA",
                    "price": 142.5,
                    "day_change_pct": 4.2,
                    "move_explanation": {
                        "headline": "Micron earnings lift chip complex",
                        "why_it_matters": "Chip stocks rallied after Micron posted strong earnings.",
                    },
                }
            ],
            "losers": [
                {
                    "ticker": "INTC",
                    "price": 21.0,
                    "day_change_pct": -3.1,
                    "headline": "INTC is a top down mover in Semiconductors.",
                }
            ],
        }
        subject, html = build_newsletter_brief_email(
            email="reader@example.com",
            snapshot=snapshot,
            display_name="Arun",
        )
        self.assertIn("NVDA", subject)
        self.assertIn("Daily market brief", html)
        self.assertIn("What happened", html)
        self.assertIn("Biggest movers", html)
        self.assertIn("Stories behind the moves", html)
        self.assertIn("Macro forces", html)
        self.assertIn("What to watch", html)
        self.assertIn("Chip stocks rallied after Micron posted strong earnings.", html)
        self.assertIn("Open your Watchlist", html)


if __name__ == "__main__":
    unittest.main()
