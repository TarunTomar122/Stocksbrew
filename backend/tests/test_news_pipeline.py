from __future__ import annotations

import unittest

from backend.news_pipeline import build_universe_sources


class NewsPipelineTest(unittest.TestCase):
    def test_build_universe_sources_for_test_5(self) -> None:
        sources = build_universe_sources("US", "us_test_5")
        source_ids = {source.id for source in sources}
        self.assertIn("nasdaq-markets", source_ids)
        self.assertIn("core-nasdaq-nvda", source_ids)
        self.assertIn("core-nasdaq-tsla", source_ids)
        self.assertGreaterEqual(len(sources), 10)


if __name__ == "__main__":
    unittest.main()
