from __future__ import annotations

import unittest

from backend.emails.healthcare_watch import build_healthcare_watch_email


class HealthcareEmailTests(unittest.TestCase):
    def test_email_uses_healthcare_copy_and_live_data_slots(self) -> None:
        names = [
            {
                "ticker": "LLY",
                "company": "Eli Lilly and Company",
                "role": "GLP-1 medicines",
                "why_benefits": "Obesity and diabetes therapies are scaling.",
                "risk": "Pricing pressure could slow growth.",
                "current_price": 900,
                "day_change_pct": 1.2,
                "analyst_target": 950,
                "analyst_count": 22,
                "stocksbrew_target": 980,
                "stocksbrew_score": 76.8,
            },
        ]
        subject, body = build_healthcare_watch_email(
            first_name="Tarun",
            names=names,
            as_of="2026-08-31",
        )

        self.assertEqual(subject, "5 healthcare names worth a closer look")
        self.assertIn("LLY", body)
        self.assertIn("GLP-1 medicines", body)
        self.assertIn("Analyst target", body)
        self.assertIn("Stocksbrew target", body)
        self.assertIn("https://www.stocksbrew.online/explore", body)
        self.assertIn("Manage email preferences", body)


if __name__ == "__main__":
    unittest.main()
