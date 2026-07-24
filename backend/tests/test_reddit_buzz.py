import unittest

from backend.scripts.build_reddit_buzz import (
    _deduplicate_posts,
    _enrich_ticker_audit,
    _should_publish_snapshot,
)


class RedditBuzzPublishGateTest(unittest.TestCase):
    def test_cross_posts_and_near_duplicate_titles_are_collapsed(self) -> None:
        posts = [
            {
                "id": "new",
                "title": "NVDA guidance sends shares higher after earnings",
                "subreddit": "stocks",
                "published": "2026-07-24T09:00:00+00:00",
            },
            {
                "id": "cross",
                "title": "[Crosspost] NVDA guidance sends shares higher after earnings!",
                "subreddit": "wallstreetbets",
                "published": "2026-07-24T08:00:00+00:00",
            },
        ]

        unique, duplicate_count = _deduplicate_posts(posts)

        self.assertEqual(len(unique), 1)
        self.assertEqual(duplicate_count, 1)
        self.assertEqual(unique[0]["source_subreddits"], ["stocks", "wallstreetbets"])
        self.assertEqual(unique[0]["duplicate_count"], 1)

    def test_ticker_audit_uses_supported_us_tickers_and_latest_post_time(self) -> None:
        posts = [
            {
                "id": "1",
                "title": "$NVDA earnings discussion",
                "selftext": "",
                "subreddit": "stocks",
                "published": "2026-07-24T09:00:00+00:00",
            },
            {
                "id": "2",
                "title": "NVDA valuation thread",
                "selftext": "",
                "subreddit": "investing",
                "published": "2026-07-23T09:00:00+00:00",
            },
        ]

        rows = _enrich_ticker_audit(
            [{"ticker": "NVDA", "source": "heuristic", "summary": ""}],
            posts,
            {"NVDA"},
            window_hours=120,
        )

        self.assertEqual(rows[0]["mention_count"], 2)
        self.assertEqual(rows[0]["latest_post_at"], "2026-07-24T09:00:00+00:00")
        self.assertEqual(rows[0]["source_subreddits"], ["investing", "stocks"])
        self.assertEqual(rows[0]["window_hours"], 120)

    def test_degraded_heuristic_snapshot_does_not_replace_llm_snapshot(self) -> None:
        previous = {
            "post_count": 175,
            "ticker_count": 8,
            "llm_ticker_count": 8,
            "heuristic_only": False,
        }
        candidate = {
            "post_count": 15,
            "ticker_count": 2,
            "llm_ticker_count": 0,
            "heuristic_only": True,
        }

        publish, reason = _should_publish_snapshot(candidate, previous)

        self.assertFalse(publish)
        self.assertEqual(reason, "degraded_candidate_preserved_previous_llm_snapshot")

    def test_first_snapshot_can_publish_even_if_heuristic(self) -> None:
        candidate = {
            "post_count": 15,
            "ticker_count": 2,
            "llm_ticker_count": 0,
            "heuristic_only": True,
        }

        publish, reason = _should_publish_snapshot(candidate, None)

        self.assertTrue(publish)
        self.assertEqual(reason, "publishable")


if __name__ == "__main__":
    unittest.main()
