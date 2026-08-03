from __future__ import annotations

from unittest import TestCase

from backend.market_daily import (
    latest_market_days,
    market_daily_cover_index,
    market_daily_cover_query,
    validate_article,
)


def evidence() -> dict:
    return {
        "edition_date": "2026-07-31",
        "previous_session_date": "2026-07-30",
        "evidence_hash": "abc",
        "tape": {
            "as_of": "2026-07-30T20:00:00+00:00",
            "markets": [{"label": "S&P 500", "change_pct": 1.66}],
        },
        "premarket": {
            "available": True,
            "as_of": "2026-07-31T09:25:00+00:00",
            "futures": [{"label": "S&P futures", "change_pct": 0.25}],
        },
        "sources": [
            {
                "id": "sb-close",
                "title": "Stocksbrew close",
                "excerpt": "S&P 500 1.66% on July 30 2026.",
                "research_text": "The S&P 500 gained 1.66% with broad participation.",
            },
            {
                "id": "sb-premarket",
                "title": "Stocksbrew premarket",
                "excerpt": "Futures 0.25% at 09:25.",
                "research_text": "S&P futures rose 0.25% at 09:25 UTC.",
            },
            {
                "id": "web-01",
                "title": "Fed decision resets the tape",
                "excerpt": "Markets rebounded after the policy decision.",
                "research_text": "Markets rebounded after the policy decision as investors reconsidered rates.",
            },
        ],
    }


def article() -> dict:
    filler = (
        "The rebound had a wider base than the headline index suggested. "
        "Participation can say more about conviction than one giant stock."
    )
    paragraph = f"{filler} {filler} {filler} {filler} {filler}"
    sections = []
    for index, marker in enumerate(
        ("{{INDEX_CHART}}", "{{SECTOR_CHART}}", "{{PREMARKET_BOARD}}"),
        start=1,
    ):
        sections.append(
            "\n\n".join(
                [
                    f"## A market idea develops in chapter {index}",
                    paragraph,
                    paragraph,
                    marker,
                    paragraph,
                    paragraph,
                    paragraph,
                ]
            )
        )
    return {
        "headline": "The rebound got wider, but the rate question did not leave",
        "dek": "Yesterday's breadth improved while the next policy clue stayed in charge.",
        "thesis": "A broader rebound is useful evidence, not a promise.",
        "article_markdown": "\n\n".join(
            [
                "Stocks recovered with more parts of the market participating. The more interesting story was how leadership changed while investors were still uneasy.",
                *sections,
            ]
        ),
        "source_ids": ["sb-close", "sb-premarket", "web-01"],
    }


class MarketDailyValidationTests(TestCase):
    def test_good_article_passes(self) -> None:
        result = validate_article(article(), evidence())
        self.assertTrue(result.passed, result.blockers)
        self.assertGreaterEqual(result.score, 90)

    def test_em_dash_fails_closed(self) -> None:
        draft = article()
        draft["headline"] += " — for now"
        result = validate_article(draft, evidence())
        self.assertFalse(result.passed)
        self.assertIn("em dash present", result.blockers)

    def test_unknown_source_fails_closed(self) -> None:
        draft = article()
        draft["source_ids"].append("web-99")
        result = validate_article(draft, evidence())
        self.assertFalse(result.passed)
        self.assertTrue(any("web-99" in blocker for blocker in result.blockers))

    def test_latest_market_days_skips_weekend(self) -> None:
        from datetime import date

        self.assertEqual(
            latest_market_days(3, reference=date(2026, 8, 3)),
            ["2026-07-30", "2026-07-31", "2026-08-03"],
        )

    def test_cover_query_tracks_the_story_topic(self) -> None:
        self.assertEqual(
            market_daily_cover_query("AI spending hits chipmakers", "Data centers are in focus."),
            "server room",
        )

    def test_cover_index_varies_by_edition_and_is_stable(self) -> None:
        query = "server room"
        first = market_daily_cover_index("2026-07-28", query, 20)
        self.assertEqual(first, market_daily_cover_index("2026-07-28", query, 20))
        self.assertNotEqual(first, market_daily_cover_index("2026-07-29", query, 20))

    def test_cover_query_varies_the_visual_subject_by_edition(self) -> None:
        first = market_daily_cover_query(
            "AI spending hits chipmakers",
            "Data centers are in focus.",
            "2026-07-28",
        )
        second = market_daily_cover_query(
            "AI spending hits chipmakers",
            "Data centers are in focus.",
            "2026-07-29",
        )
        self.assertNotEqual(first, second)
