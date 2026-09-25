from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.emails.open_brief import build_open_brief_email
from backend.open_email_intel import anomaly_tape_line


class OpenBriefTemplateTests(unittest.TestCase):
    def test_open_layout_includes_book_moves_movers_and_sectors(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        anomalies_doc = {
            "market": "US",
            "generated_at": now,
            "sector_price_as_of": now,
            "sector_quoted_count": 3,
            "sector_summary": [
                {"sector": "Semiconductors", "avg_move_pct": 1.7, "count": 3},
            ],
            "anomalies": [
                {
                    "ticker": "NVDA",
                    "sector": "Semiconductors",
                    "price": 142.5,
                    "day_change_pct": 4.2,
                    "price_as_of": now,
                    "move_explanation": {
                        "cause_type": "company_news",
                        "headline": "Micron earnings lift chip complex",
                        "why_it_matters": "Chip stocks are rallying after Micron posted strong earnings.",
                        "confidence": "high",
                        "evidence": [{"url": "https://example.com/nvda"}],
                    },
                },
                {
                    "ticker": "INTC",
                    "sector": "Semiconductors",
                    "price": 21.0,
                    "day_change_pct": -3.1,
                    "price_as_of": now,
                    "headline": "INTC is a top down mover in Semiconductors.",
                },
                {
                    "ticker": "ORCL",
                    "sector": "Technology",
                    "price": 134.8,
                    "day_change_pct": -3.7,
                    "price_as_of": now,
                    "move_explanation": {
                        "cause_type": "company_news",
                        "headline": "Financing costs rise",
                        "why_it_matters": "Higher financing costs may pressure Oracle's AI infrastructure plans.",
                        "evidence": [{"url": "https://example.com/orcl"}],
                    },
                },
            ]
        }
        subject, html = build_open_brief_email(
            first_name="Arun",
            anomalies_doc=anomalies_doc,
            rows=[{"ticker": "NVDA", "name": "NVIDIA"}, {"ticker": "ORCL", "name": "Oracle"}],
            market_phase_line="The market is trending up, risk-on.",
        )
        self.assertIn("NVDA", subject)
        self.assertIn("At the open", subject)
        self.assertTrue(subject.startswith(("⚡", "👀", "📣")))
        self.assertIn("/stocksbrew-email-mark.png", html)
        self.assertIn("Moves on your book", html)
        self.assertIn("Biggest open movers", html)
        self.assertIn("Top gainers", html)
        self.assertIn("Top losers", html)
        self.assertIn("Sector moves now", html)
        self.assertIn("Fresh prices across 3 stocks", html)
        self.assertIn("Coverage", html)
        self.assertIn("Chip stocks are rallying after Micron posted strong earnings.", html)
        self.assertIn("Positive catalyst", html)
        self.assertIn("Negative catalyst", html)
        self.assertIn("/api/logo-proxy?ticker=NVDA&amp;fallback=1", html)
        self.assertIn("/api/logo-proxy?ticker=INTC&amp;fallback=1", html)
        self.assertNotIn("action_now", html.lower())
        self.assertNotIn("trim", html.lower())

    def test_open_layout_omits_sector_section_without_fresh_rows(self) -> None:
        subject, html = build_open_brief_email(
            first_name="Arun",
            anomalies_doc={"market": "US", "anomalies": []},
        )
        self.assertIn("The biggest moves at the open", subject)
        self.assertNotIn("Sector moves now", html)
        self.assertNotIn("Fresh sector prices are still updating", html)
        self.assertNotIn("Avg move", html)

    def test_anomaly_tape_line_prefers_move_explanation(self) -> None:
        line = anomaly_tape_line(
            {
                "ticker": "AAPL",
                "move_explanation": {
                    "headline": "Apple raises prices",
                    "why_it_matters": "Services pricing is supporting the move.",
                },
            }
        )
        self.assertEqual(line, "Services pricing is supporting the move.")

    def test_internal_context_is_not_labeled_a_catalyst(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        _, html = build_open_brief_email(
            first_name="Arun",
            anomalies_doc={
                "market": "US",
                "generated_at": now,
                "anomalies": [{
                    "ticker": "NBIS",
                    "day_change_pct": 5.1,
                    "price_as_of": now,
                    "move_explanation": {
                        "cause_type": "internal_context",
                        "headline": "Sentiment improves",
                        "why_it_matters": "Optimistic coverage could encourage buying.",
                        "confidence": "low",
                        "evidence": [],
                    },
                }],
            },
            rows=[{"ticker": "NBIS"}],
        )
        self.assertIn("Optimistic coverage could encourage buying.", html)
        self.assertNotIn("Positive catalyst", html)

    def test_long_move_copy_reaches_email_without_truncation(self) -> None:
        long_copy = (
            "Supermicro raised its fiscal 2027 revenue outlook and expanded a new infrastructure partnership, "
            "which could support demand across liquid cooled systems and strengthen the company position with "
            "large enterprise customers through the next reporting period."
        )
        extended_copy = long_copy + " Orders grew. Margins improved. Shares gained."
        _, html = build_open_brief_email(
            first_name="Arun",
            anomalies_doc={
                "market": "US",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "anomalies": [{
                    "ticker": "SMCI",
                    "day_change_pct": 4.0,
                    "price": 100.0,
                    "price_as_of": datetime.now(timezone.utc).isoformat(),
                    "move_explanation": {"headline": "SMCI outlook improves", "why_it_matters": extended_copy},
                }],
            },
            rows=[{"ticker": "SMCI"}],
        )

        self.assertIn(long_copy, html)
        self.assertIn("Orders grew. Margins improved.", html)
        self.assertNotIn("Shares gained.", html)
        self.assertNotIn("Positive catalyst", html)


if __name__ == "__main__":
    unittest.main()
