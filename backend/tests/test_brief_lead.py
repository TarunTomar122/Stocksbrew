from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.brief_lead import (
    BODY_LEAD_PROMPT_RULES,
    FORBIDDEN_BODY_OPENERS,
    coverage_lead_pattern,
    fix_coverage_lead,
    split_sentences,
)
from backend.scripts.repair_brief_coverage_leads import classify, requeue_order, summarize
from backend.stock_intelligence import (
    NO_NEWS_BRIEF_CACHE_VERSION,
    NO_NEWS_BRIEF_SYSTEM_PROMPT,
    STOCK_BRIEF_CACHE_VERSION,
    STOCK_BRIEF_ENGINE_SYSTEM_PROMPT,
    STOCK_BRIEF_SYSTEM_PROMPT,
    build_no_news_intelligence_doc,
)

PROMPTS = {
    "stock": STOCK_BRIEF_SYSTEM_PROMPT,
    "engine": STOCK_BRIEF_ENGINE_SYSTEM_PROMPT,
    "no_news": NO_NEWS_BRIEF_SYSTEM_PROMPT,
}


class BriefPromptTest(unittest.TestCase):
    def test_every_brief_prompt_names_the_forbidden_openers(self) -> None:
        for name, prompt in PROMPTS.items():
            with self.subTest(prompt=name):
                self.assertIn(BODY_LEAD_PROMPT_RULES, prompt)
                self.assertIn("BODY FIRST SENTENCE - ABOUT THE COMPANY, NOT THE NEWS:", prompt)
                for phrase in (
                    "coverage highlights",
                    "news centers on",
                    "recent coverage",
                    "headlines suggest",
                    "the narrative",
                    "sentiment is",
                ):
                    self.assertIn(f'"{phrase}"', prompt)
                self.assertIn("a number, a date, or a named event", prompt)

    def test_forbidden_list_covers_the_briefed_phrases(self) -> None:
        for phrase in ("coverage highlights", "news centers on", "recent coverage", "headlines suggest", "the narrative", "sentiment is"):
            self.assertIn(phrase, FORBIDDEN_BODY_OPENERS)

    def test_prompts_no_longer_ask_for_a_coverage_lead(self) -> None:
        for name, prompt in PROMPTS.items():
            with self.subTest(prompt=name):
                self.assertNotIn("say coverage has gone quiet", prompt)
                self.assertNotIn("say coverage has quieted", prompt)
                self.assertNotIn("State that no company-specific development was verified, then", prompt)

    def test_the_rule_sits_outside_the_sections_the_engine_prompt_swaps(self) -> None:
        # The engine prompt replaces DIRECTIVE REASONS and BRIEF STABILITY; the lead rule must survive it, once.
        header = "BODY FIRST SENTENCE - ABOUT THE COMPANY, NOT THE NEWS:"
        self.assertEqual(STOCK_BRIEF_ENGINE_SYSTEM_PROMPT.count(header), 1)
        self.assertEqual(STOCK_BRIEF_SYSTEM_PROMPT.count(header), 1)

    def test_cache_versions_moved_with_the_prompt(self) -> None:
        # The cache key hashes the version, not the prompt, so a prompt change needs a new version.
        self.assertNotEqual(STOCK_BRIEF_CACHE_VERSION, "2026-11-10-stock-brief-v23-call-reasons")
        self.assertNotEqual(NO_NEWS_BRIEF_CACHE_VERSION, "2026-11-10-no-news-brief-v9-call-reasons")


class CoverageLeadPatternTest(unittest.TestCase):
    def test_coverage_openers_are_named(self) -> None:
        cases = {
            "Recent company-specific coverage is thin for AA.": "coverage_is_thin",
            "Coverage has gone quiet for Jackson Financial: today’s sole article concerns LifeStance Health.": "coverage_is_thin",
            "Coverage has otherwise gone quiet, leaving investors focused on demand.": "coverage_is_thin",
            "Coterra’s lack of recent news suggests a pause as investors digest prior moves.": "coverage_is_thin",
            "Recent coverage highlights Advance Auto Parts’ restructuring under new management.": "coverage_highlights",
            "Fresh coverage is focused on Fulton Financial’s $0.17 dividend.": "news_centers_on",
            "November 4 coverage links renewed interest in Opendoor to lower Treasury yields.": "coverage_highlights",
            "JPMorgan’s fresh news centers on a partnership with OpenAI intended to improve coding efficiency.": "news_centers_on",
            "Lockheed Martin’s latest coverage centers on CEO Jim Taiclet’s leadership.": "news_centers_on",
            "Headlines suggest Tesla demand is cooling.": "headlines_suggest",
            "The narrative around Snowflake has shifted toward AI spending.": "the_narrative",
            "Investor sentiment is mixed after the guidance cut.": "sentiment_is",
            "No company-specific development was verified.": "no_development_verified",
            "No company-specific SITC development appeared today.": "no_development_verified",
            "A single article argues Tandem Diabetes Care looks underpriced.": "single_article",
            "Today’s only report concerns television networks suspending White House pool coverage.": "single_article",
            "The feed covers official press releases for over 10,000 US-listed stocks.": "the_feed",
            "Gallagher is the subject of the article.": "about_the_article",
            "Use the current fundamentals rather than treating stale headlines as a fresh catalyst.": "stale_headlines",
            "Analysts remain bullish on Nvidia’s long-term value, while coverage highlights its sharp discount.": "coverage_mid_sentence",
        }
        for sentence, expected in cases.items():
            with self.subTest(sentence=sentence):
                self.assertEqual(coverage_lead_pattern(sentence), expected)

    def test_company_sentences_are_left_alone(self) -> None:
        for sentence in (
            "JPMorgan signed a partnership with OpenAI on Nov 10 to speed up its coding work.",
            "Costco’s July sales grew 10.7%, showing members continue spending.",
            "No debt matures before 2028, so the company has room to keep buying back shares.",
            "One plant restarted on Monday after a two-week outage.",
            "Raymond James initiated American Healthcare REIT coverage with a Strong Buy rating and a $62 target.",
            "AEP enters next week after BTIG upgraded the stock to Buy and the company raised its dividend to $0.97.",
            "McDonald’s beat earnings expectations, while expanded Uber delivery coverage across 14 markets adds orders.",
            "Marvell announced an $80 billion acquisition of Lumentum on November 11.",
            "One report from the FDA cleared the drug for sale.",
            "One item stood out: the CEO quit.",
            "No new development permits were approved in Texas.",
            "The feed business at Tyson grew.",
            "Shares fell after Goldman's coverage highlights weaker demand.",
            "",
        ):
            with self.subTest(sentence=sentence):
                self.assertIsNone(coverage_lead_pattern(sentence))

    def test_sentences_split_without_breaking_abbreviations(self) -> None:
        self.assertEqual(
            split_sentences("Recent U.S. coverage of J. P. Morgan Inc. is thin. Shares rose 2.5% on Nov. 3 after the report."),
            ["Recent U.S. coverage of J. P. Morgan Inc. is thin.", "Shares rose 2.5% on Nov. 3 after the report."],
        )
        self.assertEqual(split_sentences("  "), [])


class FixCoverageLeadTest(unittest.TestCase):
    def test_a_lead_about_the_company_is_unchanged(self) -> None:
        body = "Apple raised its dividend to $0.27 on Oct 30. Services revenue grew 12% in the quarter."
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, body)
        self.assertEqual(fix.issue, "")
        self.assertEqual(fix.dropped, ())

    def test_a_coverage_only_opener_is_dropped_when_the_rest_stands(self) -> None:
        body = (
            "Recent coverage highlights Advance Auto Parts’ restructuring under new management. "
            "The company closed 700 stores this year and expects margins to recover in 2027."
        )
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, "The company closed 700 stores this year and expects margins to recover in 2027.")
        self.assertEqual(fix.issue, "")
        self.assertEqual(fix.dropped, ("Recent coverage highlights Advance Auto Parts’ restructuring under new management.",))

    def test_two_coverage_sentences_in_a_row_are_both_dropped(self) -> None:
        body = (
            "Coverage is quiet: the latest article only reviews Amphenol’s long-term returns. "
            "Coverage has otherwise gone quiet. "
            "Amphenol’s data-center orders keep growing faster than its other businesses."
        )
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, "Amphenol’s data-center orders keep growing faster than its other businesses.")
        self.assertEqual(len(fix.dropped), 2)

    def test_an_opener_with_a_figure_is_flagged_not_dropped(self) -> None:
        body = (
            "East West Bancorp’s latest coverage highlights a quarterly dividend of $0.80. "
            "The bank keeps paying out less than a third of its profit."
        )
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, body)
        self.assertEqual(fix.issue, "coverage_highlights")
        self.assertEqual(fix.dropped, ())

    def test_nothing_left_that_stands_is_flagged(self) -> None:
        for body in (
            "Recent company-specific coverage is thin for AA.",
            "Recent company-specific coverage is thin for AA. "
            "Use the current fundamentals, analyst target, and technical context rather than treating stale headlines as a fresh catalyst.",
            "No company-specific development was verified. Shares are quiet.",
            "Recent coverage highlights Chubb’s scale as a leading insurer. However, only one source supports the bullish view.",
        ):
            with self.subTest(body=body):
                fix = fix_coverage_lead(body)
                self.assertEqual(fix.body, body)
                self.assertTrue(fix.issue)
                self.assertEqual(fix.dropped, ())

    def test_a_fact_first_sentence_that_turns_to_the_coverage_is_flagged(self) -> None:
        body = (
            "Analysts remain bullish on Nvidia’s long-term value, while coverage highlights its sharp discount from prior highs. "
            "Data-center sales grew 66% last quarter."
        )
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, body)
        self.assertEqual(fix.issue, "coverage_mid_sentence")

    def test_a_narrative_or_sentiment_opener_is_flagged_not_dropped(self) -> None:
        for body in (
            "The narrative shifted after the FDA approved the drug. Sales start in the spring across most of Europe.",
            "Investor sentiment is improving after the upgrade. The company also won a large defense contract this week.",
        ):
            with self.subTest(body=body):
                fix = fix_coverage_lead(body)
                self.assertEqual(fix.body, body)
                self.assertIn(fix.issue, {"the_narrative", "sentiment_is"})

    def test_a_rest_that_tells_the_reader_what_to_do_does_not_lead(self) -> None:
        body = (
            "Recent company-specific coverage is thin for AA. "
            "Use price, fundamentals, and analyst context until fresh stock-specific news appears."
        )
        fix = fix_coverage_lead(body)
        self.assertEqual(fix.body, body)
        self.assertEqual(fix.issue, "coverage_is_thin")

    def test_empty_body(self) -> None:
        self.assertEqual(fix_coverage_lead(""), ("", "", ()))
        self.assertEqual(fix_coverage_lead(None), ("", "", ()))  # type: ignore[arg-type]


class RepairScriptTest(unittest.TestCase):
    def test_classify_and_summarize(self) -> None:
        docs = [
            {"instrument_id": "us_aa", "coverage_type": "on_demand_no_news", "body": "Recent company-specific coverage is thin for AA."},
            {
                "instrument_id": "US_AAP",
                "coverage_type": "on_demand_news",
                "body": "Recent coverage highlights Advance Auto Parts’ restructuring. The company closed 700 stores this year to lift margins.",
            },
            {"instrument_id": "US_AAPL", "coverage_type": "on_demand_news", "body": "Apple raised its dividend to $0.27 on Oct 30."},
            {"instrument_id": "US_X", "body": ""},
        ]
        rows = [row for row in (classify(doc) for doc in docs) if row]
        self.assertEqual([row["instrument_id"] for row in rows], ["US_AA", "US_AAP"])
        self.assertEqual([row["action"] for row in rows], ["flag", "drop"])
        self.assertEqual(rows[1]["fixed_body"], "The company closed 700 stores this year to lift margins.")
        self.assertEqual(rows[1]["pattern"], "coverage_highlights")
        self.assertEqual([row["instrument_id"] for row in requeue_order(rows)], ["US_AA"])
        summary = summarize(rows, len(docs))
        self.assertEqual(summary["coverage_leads"], 2)
        self.assertEqual(summary["by_pattern"], {"coverage_is_thin": 1, "coverage_highlights": 1})


class NoNewsDocLeadTest(unittest.TestCase):
    def _doc(self, brief: dict) -> dict:
        with patch("backend.stock_intelligence.generate_no_news_brief", return_value=brief):
            doc = build_no_news_intelligence_doc(
                instrument={"instrument_id": "US_AA", "ticker": "AA", "name": "Alcoa"},
                market="US",
                universe_id="us_core_155",
                latest_price_doc={"quote": {"current": 40.0, "day_change_pct": 0.4}},
                technical_doc=None,
                intel_pro_doc=None,
                store=None,
            )
        assert doc is not None
        return doc

    def _brief(self, body: str) -> dict:
        return {
            "headline": "Alcoa sits well below its high",
            "body": body,
            "thesis": "Alcoa trades below its high",
            "setup_state": "unclear",
            "drivers": [{"label": "Margins", "detail": "Alcoa's smelters earn more when aluminum prices rise.", "direction": "up"}],
            "catalyst_cards": [],
            "risk_cards": [],
        }

    def test_rsi_in_the_body_no_longer_replaces_the_brief(self) -> None:
        body = "Alcoa's shares sit 18% below their 52-week high, with an RSI of 41 after a slow month. Analysts rate it Buy."
        doc = self._doc(self._brief(body))
        self.assertEqual(doc["body"], body)
        self.assertEqual(doc["body_lead_issue"], "")
        self.assertEqual(doc["body_lead_dropped"], [])

    def test_another_ticker_still_falls_back_and_is_flagged(self) -> None:
        doc = self._doc(self._brief("Alcoa trails CENX after the tariff news. Analysts rate it Buy."))
        self.assertTrue(doc["body"].startswith("Recent company-specific coverage is thin for AA."))
        self.assertEqual(doc["body_lead_issue"], "coverage_is_thin")

    def test_a_pure_coverage_opener_is_dropped_from_the_stored_body(self) -> None:
        doc = self._doc(self._brief(
            "No company-specific development was verified. "
            "Alcoa's shares sit 18% below their 52-week high while analysts still rate the stock Buy."
        ))
        self.assertEqual(doc["body"], "Alcoa's shares sit 18% below their 52-week high while analysts still rate the stock Buy.")
        self.assertEqual(doc["body_lead_dropped"], ["No company-specific development was verified."])
        self.assertEqual(doc["body_lead_issue"], "")


if __name__ == "__main__":
    unittest.main()
