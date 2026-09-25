from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from backend.emails.weekly_brief import build_weekly_brief_email
from backend.weekly_email import has_sendable_weekly_snapshot
from backend.weekly_tape_llm import generate_weekly_stories


class WeeklyBriefTemplateTests(unittest.TestCase):
    def test_weekly_snapshot_gate_requires_current_week_and_recent_generation(self) -> None:
        snapshot = {
            "week_key": "2026-W27",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "quoted_count": 10,
        }

        self.assertTrue(has_sendable_weekly_snapshot(snapshot, week_key="2026-W27"))
        self.assertFalse(has_sendable_weekly_snapshot({**snapshot, "week_key": "2026-W26"}, week_key="2026-W27"))
        self.assertFalse(
            has_sendable_weekly_snapshot(
                {**snapshot, "generated_at": (datetime.now(timezone.utc) - timedelta(hours=40)).isoformat()},
                week_key="2026-W27",
            )
        )

    def test_weekly_layout_includes_stories_book_movers_and_sectors(self) -> None:
        weekly = {
            "week_label": "Jun 23–27, 2026",
            "by_ticker": {
                "NVDA": {"week_change_pct": 5.4, "price": 142.5},
            },
            "indices": {
                "S&P 500": {"week_change_pct": 1.8, "price": 7398},
                "Nasdaq": {"week_change_pct": 2.6, "price": 26247},
            },
            "movers_up": [{"ticker": "NVDA", "week_change_pct": 5.4, "price": 142.5}],
            "movers_down": [{"ticker": "INTC", "week_change_pct": -4.1, "price": 21.0}],
            "sector_summary": [{"sector": "Semiconductors", "avg_move_pct": 3.2, "count": 5}],
        }
        weekly_stories = {
            "week_lede": "Memory chips led the tape while software cooled off.",
            "stories": [
                {
                    "ticker": "NVDA",
                    "headline": "Micron earnings lifted the chip complex",
                    "story": "Memory names rallied after Micron posted strong results. Nvidia rode the read-through as investors repriced AI infrastructure demand. Orders improved. Shares gained.",
                    "week_change_pct": 5.4,
                    "on_book": True,
                }
            ],
        }
        subject, html = build_weekly_brief_email(
            first_name="Arun",
            weekly=weekly,
            rows=[{"ticker": "NVDA", "name": "NVIDIA"}],
            market_phase_line="The market is trending up, risk-on.",
            upcoming_earnings=[{"ticker": "AAPL", "event_date": "2026-06-30", "time": "amc"}],
            weekly_stories=weekly_stories,
        )
        self.assertIn("NVDA", subject)
        self.assertIn("Your week in stocks", subject)
        self.assertTrue(subject.startswith(("🗞️", "📊", "🧭")))
        self.assertIn("/stocksbrew-email-mark.png", html)
        self.assertIn("Stories of the week", html)
        self.assertIn("Micron earnings lifted the chip complex", html)
        self.assertIn("Orders improved.", html)
        self.assertNotIn("Shares gained.", html)
        self.assertIn("/api/logo-proxy?ticker=NVDA&amp;fallback=1", html)
        self.assertIn("/api/logo-proxy?ticker=INTC&amp;fallback=1", html)
        self.assertIn("On your book", html)
        self.assertIn("Your book this week", html)
        self.assertIn("Biggest weekly movers", html)
        self.assertNotIn("Finished the week", html)
        self.assertNotIn("action_now", html.lower())

    def test_generate_weekly_stories_uses_llm_output(self) -> None:
        candidates = [
            {
                "ticker": "MU",
                "company": "Micron",
                "week_change_pct": 12.4,
                "on_book": False,
                "raw_headline": "Micron beats estimates",
                "raw_detail": "DRAM pricing stayed firm through the week.",
            }
        ]
        with patch("backend.weekly_tape_llm._llm_weekly_stories") as llm:
            llm.return_value = {
                "week_lede": "Memory led the week.",
                "stories": [
                    {
                        "ticker": "MU",
                        "headline": "Micron rides memory pricing",
                        "story": "Micron rallied after earnings showed firmer DRAM pricing. The move pulled other memory names higher with it.",
                    }
                ],
            }
            result = generate_weekly_stories(None, market="US", week_key="2026-W26", candidates=candidates)
        self.assertEqual(result["week_lede"], "Memory led the week.")
        self.assertEqual(result["stories"][0]["ticker"], "MU")
        self.assertIn("Micron rallied", result["stories"][0]["story"])


if __name__ == "__main__":
    unittest.main()
