from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.email_content import clean_optional_email_text, limit_optional_email_sentences
from backend.emails.newsletter_brief import build_newsletter_brief_email
from backend.emails.open_brief import build_open_brief_email
from backend.emails.premarket_brief import build_premarket_brief_email
from backend.emails.price_alert import build_price_alert_email
from backend.emails.radar_alert import build_radar_alert_email
from backend.emails.weekly_brief import build_weekly_brief_email


MISSING_CATALYST = "No clear overnight catalyst surfaced."


class EmailContentSafetyTests(unittest.TestCase):
    def test_stock_copy_keeps_three_complete_sentences(self) -> None:
        text = "U.S. demand grew through the quarter. Revenue rose. Margins improved. Shares gained."
        self.assertEqual(
            limit_optional_email_sentences(text),
            "U.S. demand grew through the quarter. Revenue rose. Margins improved.",
        )
        long_sentence = "Revenue " + ("grew steadily " * 60).strip() + "."
        self.assertEqual(limit_optional_email_sentences(long_sentence), long_sentence)
        self.assertEqual(
            limit_optional_email_sentences('"Revenue rose." Margins improved. Orders grew. Shares gained.'),
            '"Revenue rose." Margins improved. Orders grew.',
        )
        self.assertEqual(
            limit_optional_email_sentences("Foo Inc. Revenue rose. Margins improved. Shares gained."),
            "Foo Inc. Revenue rose. Margins improved.",
        )

    def test_cleaner_removes_only_the_missing_information_sentence(self) -> None:
        text = clean_optional_email_text(
            "Revenue guidance increased. No clear overnight catalyst surfaced. Margins also improved."
        )

        self.assertEqual(text, "Revenue guidance increased. Margins also improved.")

    def test_premarket_email_omits_book_names_without_a_real_catalyst(self) -> None:
        premarket = {
            "by_ticker": {
                "SMCI": {"pre_market_change_pct": 4.1},
                "DELL": {"pre_market_change_pct": 3.2},
                "COHR": {"pre_market_change_pct": 2.8},
            },
        }
        _, html = build_premarket_brief_email(
            first_name="Arun",
            premarket=premarket,
            rows=[
                {"ticker": "SMCI", "instrument_name": "Super Micro Computer"},
                {"ticker": "DELL", "instrument_name": "Dell Technologies"},
                {"ticker": "COHR", "instrument_name": "Coherent"},
            ],
            premarket_context={
                "by_ticker": {
                    "SMCI": {
                        "headline": "Super Micro raises quarterly revenue outlook",
                        "tape_line": "Super Micro raised its quarterly revenue outlook.",
                    },
                    "COHR": {"headline": "Coherent has no confirmed catalyst", "tape_line": MISSING_CATALYST},
                }
            },
            overnight_headlines={
                "DELL": {
                    "headline": "Dell wins enterprise AI infrastructure contract",
                    "tape_line": "Dell announced a new enterprise AI infrastructure contract.",
                },
            },
        )

        self.assertIn("Super Micro raised its quarterly revenue outlook.", html)
        self.assertIn("Dell announced a new enterprise AI infrastructure contract.", html)
        self.assertNotIn(MISSING_CATALYST, html)
        self.assertNotIn("COHR</span><span", html)

    def test_open_email_omits_a_weak_move_explanation(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        _, html = build_open_brief_email(
            first_name="Arun",
            anomalies_doc={
                "market": "US",
                "generated_at": now,
                "anomalies": [
                    {
                        "ticker": "DELL",
                        "price": 140,
                        "day_change_pct": 4.0,
                        "price_as_of": now,
                        "move_explanation": {
                            "cause_type": "unclear",
                            "headline": "No clear company-specific driver surfaced yet.",
                        },
                    }
                ],
            },
            rows=[{"ticker": "DELL"}],
        )

        self.assertNotIn("Moves on your book", html)
        self.assertNotIn("No clear company-specific driver", html)
        self.assertIn("Biggest open movers", html)

    def test_daily_newsletter_omits_no_data_sections_and_stories(self) -> None:
        _, html = build_newsletter_brief_email(
            email="reader@example.com",
            snapshot={
                "session_date": "2026-07-22",
                "brief": {
                    "overview": "Semiconductors led the session. No clear driver surfaced.",
                    "global_forces": "Not available.",
                    "outlook": "No fresh catalyst confirmed.",
                },
                "gainers": [
                    {
                        "ticker": "DELL",
                        "day_change_pct": 4.0,
                        "move_explanation": {
                            "cause_type": "unclear",
                            "headline": "No clear driver surfaced.",
                        },
                    }
                ],
            },
        )

        self.assertIn("Semiconductors led the session.", html)
        self.assertNotIn("No clear driver", html)
        self.assertNotIn("Macro forces", html)
        self.assertNotIn("What to watch", html)
        self.assertNotIn("Stories behind the moves", html)

    def test_weekly_email_omits_cached_no_catalyst_story(self) -> None:
        _, html = build_weekly_brief_email(
            first_name="Arun",
            weekly={"week_label": "Jul 20–24, 2026"},
            weekly_stories={
                "week_lede": MISSING_CATALYST,
                "stories": [
                    {
                        "ticker": "DELL",
                        "headline": "DELL had a big week",
                        "story": "DELL rallied with no clear single catalyst in our feed.",
                        "week_change_pct": 8.0,
                    }
                ],
            },
        )

        self.assertNotIn("Stories of the week", html)
        self.assertNotIn("no clear single catalyst", html.lower())
        self.assertNotIn(MISSING_CATALYST, html)

    def test_alert_emails_omit_optional_no_data_copy(self) -> None:
        _, radar_html = build_radar_alert_email(
            "setup_changed",
            {"ticker": "DELL", "new_stance": "watch", "directive_text": MISSING_CATALYST},
        )
        _, price_html = build_price_alert_email(
            ticker="DELL",
            condition="above",
            target_price=140,
            current_price=142,
            row={"ai_directive": {"text": MISSING_CATALYST}},
        )

        self.assertNotIn(MISSING_CATALYST, radar_html)
        self.assertNotIn(MISSING_CATALYST, price_html)


if __name__ == "__main__":
    unittest.main()
