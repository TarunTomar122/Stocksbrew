from __future__ import annotations

import unittest

from backend.cloudrun.orchestrator.dispatch import _lane_universe_id


class _StubStore:
    def __init__(self, active_universe: str) -> None:
        self.active_universe = active_universe

    def get_active_price_universe(self, market: str) -> str:
        assert market == "US"
        return self.active_universe


class DispatchUniverseScopeTest(unittest.TestCase):
    def test_pre_earnings_intel_does_not_inherit_runtime_universe(self) -> None:
        store = _StubStore("us_core_100")
        self.assertEqual(_lane_universe_id(store, "US", "pre_earnings_intel", None), "")

    def test_pre_earnings_intel_honors_explicit_override(self) -> None:
        store = _StubStore("us_core_100")
        self.assertEqual(
            _lane_universe_id(store, "US", "pre_earnings_intel", "us_core_100"),
            "us_core_100",
        )

    def test_other_lanes_keep_runtime_universe_default(self) -> None:
        store = _StubStore("us_core_100")
        self.assertEqual(_lane_universe_id(store, "US", "earnings_intel", None), "us_core_100")


if __name__ == "__main__":
    unittest.main()
