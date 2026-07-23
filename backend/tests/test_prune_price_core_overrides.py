from __future__ import annotations

import unittest

from backend.scripts.prune_price_core_overrides import retained_override_ids


class RetainedOverrideIdsTests(unittest.TestCase):
    def test_newly_tracked_and_recent_ids_are_added_before_pruning(self) -> None:
        result = retained_override_ids(
            ["US_OLD", "US_TAIL"],
            tracked={"US_NEW_TRACKED"},
            recent={"US_NEW_RECENT"},
            target_cap=3,
            floor=1,
        )

        self.assertIn("US_NEW_TRACKED", result)
        self.assertIn("US_NEW_RECENT", result)
        self.assertNotIn("US_OLD", result)

    def test_protected_ids_are_never_dropped_when_they_exceed_cap(self) -> None:
        result = retained_override_ids(
            ["US_A", "US_B", "US_C"],
            tracked={"US_A", "US_B", "US_C"},
            recent=set(),
            target_cap=2,
            floor=1,
        )

        self.assertEqual(result, ["US_A", "US_B", "US_C"])


if __name__ == "__main__":
    unittest.main()
