import unittest

from backend.scripts.build_reddit_buzz import _should_publish_snapshot


class RedditBuzzPublishGateTest(unittest.TestCase):
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
