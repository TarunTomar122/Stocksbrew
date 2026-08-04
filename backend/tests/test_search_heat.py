from __future__ import annotations

from datetime import datetime, timedelta, timezone
import unittest

from backend.search_heat import rank_search_heat_rows


class SearchHeatTest(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 4, 12, tzinfo=timezone.utc)
        self.valid = {"US_NOK", "US_AAPL", "US_ASO"}

    def row(self, instrument_id: str, actor: str, hours_ago: int = 1) -> dict:
        return {
            "instrument_id": instrument_id,
            "ticker": instrument_id.removeprefix("US_"),
            "market": "US",
            "anon_id": actor,
            "created_at": (self.now - timedelta(hours=hours_ago)).isoformat(),
        }

    def test_requires_distinct_people_not_refresh_count(self) -> None:
        rows = [self.row("US_NOK", "same-person") for _ in range(20)]
        self.assertEqual(
            rank_search_heat_rows(rows, market="US", valid_ids=self.valid, now=self.now),
            [],
        )

    def test_promotes_multi_user_long_tail_demand(self) -> None:
        rows = [self.row("US_NOK", f"person-{index}") for index in range(3)]
        ranked = rank_search_heat_rows(rows, market="US", valid_ids=self.valid, now=self.now)
        self.assertEqual([row["instrument_id"] for row in ranked], ["US_NOK"])
        self.assertEqual(ranked[0]["unique_actors_24h"], 3)

    def test_decays_old_demand_and_ignores_unknown_instruments(self) -> None:
        rows = [self.row("US_NOK", f"old-{index}", hours_ago=80) for index in range(6)]
        rows += [self.row("US_FAKE", f"fake-{index}") for index in range(8)]
        self.assertEqual(
            rank_search_heat_rows(rows, market="US", valid_ids=self.valid, now=self.now),
            [],
        )

    def test_caps_and_ranks_by_recent_unique_demand(self) -> None:
        rows = [self.row("US_NOK", f"nok-{index}") for index in range(4)]
        rows += [self.row("US_ASO", f"aso-{index}") for index in range(3)]
        ranked = rank_search_heat_rows(
            rows,
            market="US",
            valid_ids=self.valid,
            now=self.now,
            cap=1,
        )
        self.assertEqual([row["instrument_id"] for row in ranked], ["US_NOK"])


if __name__ == "__main__":
    unittest.main()
