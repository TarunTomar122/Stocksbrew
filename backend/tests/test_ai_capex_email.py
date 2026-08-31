from __future__ import annotations

import unittest

from backend.emails._assets import logo_src
from backend.emails.ai_capex_watch import build_ai_capex_watch_email


class AiCapexEmailTests(unittest.TestCase):
    def test_email_contains_the_five_name_research_note_and_two_targets(self) -> None:
        names = [
            {
                "ticker": "LRCX",
                "company": "Lam Research Corporation",
                "role": "Equipment",
                "why_benefits": "Advanced equipment supports HBM and logic expansion.",
                "risk": "Chipmakers pause equipment spending.",
                "current_price": 314.67,
                "day_change_pct": 1.45,
                "analyst_target": 395,
                "analyst_count": 23,
                "stocksbrew_target": 353.32,
                "stocksbrew_score": 76.6,
            },
        ]
        subject, body = build_ai_capex_watch_email(
            first_name="Tarun",
            names=names,
            as_of="2026-08-26",
        )

        self.assertEqual(subject, "5 less-obvious AI-capex names to watch")
        self.assertIn("LRCX", body)
        self.assertIn("Stocksbrew target", body)
        self.assertIn("+12.3%", body)
        self.assertIn("Stocksbrew score", body)
        self.assertIn("<strong style='color:#292929'>Stocksbrew score: 76.6</strong>", body)
        self.assertNotIn("Analyst target", body)
        self.assertNotIn("What breaks it", body)
        self.assertNotIn("Analyst runway", body)
        self.assertNotIn("Both can change as prices", body)
        self.assertIn("Explore these names in stocksbrew", body)
        self.assertIn("https://www.stocksbrew.online/explore", body)
        self.assertIn("Manage email preferences", body)
        self.assertNotIn("Market data and targets checked", body)
        self.assertNotIn("The angle", body)

    def test_ceg_uses_a_stable_logo_source(self) -> None:
        self.assertIn("companiesmarketcap.com", logo_src(ticker="CEG"))


if __name__ == "__main__":
    unittest.main()
