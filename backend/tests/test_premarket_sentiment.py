from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.premarket_sentiment import context_matches_movers, score_opening, summarize_social
from backend.scripts.run_premarket_intel import _is_us_premarket_window


class PremarketSentimentTests(unittest.TestCase):
    def test_social_snapshot_supports_map_shape_and_weights_mentions(self) -> None:
        social = summarize_social({
            "generated_at": "2026-07-20T04:30:00+00:00",
            "tickers": {
                "NVDA": {"mention_count": 12, "sentiment": "bullish", "summary": "AI demand is in focus."},
                "TSLA": {"mention_count": 3, "sentiment": "bearish", "summary": "Margins are the debate."},
            },
        })

        self.assertTrue(social["available"])
        self.assertEqual(social["positive_mentions"], 12)
        self.assertEqual(social["negative_mentions"], 3)
        self.assertEqual(social["sentiment_score"], 60.0)
        self.assertEqual(social["top_tickers"][0]["ticker"], "NVDA")

    def test_score_opening_rewards_broadly_constructive_inputs(self) -> None:
        cues = [
            {"id": "US_OPEN_ES", "group": "futures", "change_pct": 0.8},
            {"id": "US_OPEN_NQ", "group": "futures", "change_pct": 1.1},
            {"id": "US_OPEN_NIKKEI", "group": "asia", "change_pct": 0.7},
            {"id": "US_OPEN_NIFTY", "group": "asia", "change_pct": 0.5},
            {"id": "US_OPEN_STOXX", "group": "europe", "change_pct": 0.3},
            {"id": "US_OPEN_VIX", "group": "macro", "change_pct": -2.0},
        ]
        premarket = {"available": True, "breadth_score": 45.0}
        social = {"available": True, "sentiment_score": 30.0}
        sessions = [{"date": "2026-07-17", "close": 6200.0, "change_pct": 0.6}]

        scorecard = score_opening(cues, premarket, social, sessions)

        self.assertGreaterEqual(scorecard["score"], 64)
        self.assertEqual(scorecard["label"], "Constructive open setup")
        self.assertEqual(scorecard["confidence"], "high")

    def test_score_opening_remains_mixed_without_a_live_premarket_snapshot(self) -> None:
        scorecard = score_opening(
            [{"id": "US_OPEN_ES", "group": "futures", "change_pct": 0.0}],
            {"available": False, "breadth_score": 0.0},
            {"available": False, "sentiment_score": 0.0},
            [],
        )

        self.assertGreaterEqual(scorecard["score"], 44)
        self.assertLessEqual(scorecard["score"], 56)
        self.assertEqual(scorecard["label"], "Mixed open setup")
        self.assertEqual(scorecard["confidence"], "low")

    def test_two_pass_runner_only_runs_full_chain_during_us_premarket(self) -> None:
        self.assertFalse(_is_us_premarket_window(datetime(2026, 7, 20, 0, 30, tzinfo=ZoneInfo("America/New_York"))))
        self.assertTrue(_is_us_premarket_window(datetime(2026, 7, 20, 6, 0, tzinfo=ZoneInfo("America/New_York"))))

    def test_context_must_come_from_the_exact_mover_snapshot(self) -> None:
        movers = {
            "date": "2026-07-22",
            "generated_at": "2026-07-22T08:30:00+00:00",
        }
        matched = {
            "source_movers_date": "2026-07-22",
            "source_movers_generated_at": "2026-07-22T08:30:00+00:00",
        }

        self.assertTrue(context_matches_movers(matched, movers))
        self.assertFalse(context_matches_movers({**matched, "source_movers_generated_at": "2026-07-21T08:30:00+00:00"}, movers))
        self.assertFalse(context_matches_movers({}, movers))
