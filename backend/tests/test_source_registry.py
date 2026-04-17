from __future__ import annotations

import unittest

from backend.source_registry import list_sources_for_market, list_tracked_sources_for_market


class SourceRegistryTest(unittest.TestCase):
    def test_active_in_sources(self) -> None:
        active = list_sources_for_market("IN")
        self.assertEqual(len(active), 11)
        self.assertTrue(all(source.usage_status == "enabled" for source in active))

    def test_tracked_us_sources(self) -> None:
        tracked = list_tracked_sources_for_market("US")
        self.assertGreaterEqual(len(tracked), 4)


if __name__ == "__main__":
    unittest.main()
