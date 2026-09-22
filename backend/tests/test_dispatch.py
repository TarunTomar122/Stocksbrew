from __future__ import annotations

import argparse
from datetime import datetime, timezone
import unittest

from unittest.mock import patch

from backend.cloudrun.orchestrator.dispatch import (
    _ai_brief_ids,
    _brief_base_universe_id,
    _fresh_open_brief_ids,
    _lane_universe_id,
    _price_core_ids,
    _search_heat_ids,
    _search_heat_valid_ids,
    _run_sharded_lane,
    _run_single_job_lane,
    _tracked_ids,
    _tracked_lane_extra_args,
)
from backend.cloudrun.orchestrator.local_api import LocalJobsClient


class _StubStore:
    def __init__(self, active_universe: str) -> None:
        self.active_universe = active_universe

    def get_active_price_universe(self, market: str) -> str:
        assert market == "US"
        return self.active_universe


class DispatchUniverseScopeTest(unittest.TestCase):
    def test_open_brief_dispatch_drops_stale_ids_before_sharding(self) -> None:
        now = datetime.now(timezone.utc).isoformat()

        class Store:
            def get_latest_prices(self, _instrument_ids):
                return {
                    "US_AAPL": {
                        "session_phase": "open_check",
                        "captured_at": now,
                        "updated_at": now,
                    }
                }

        fresh = _fresh_open_brief_ids(
            Store(),
            ["US_AAPL", "US_DEAD"],
            market="US",
            session_phase="open_check",
            max_age_hours=3,
        )

        self.assertEqual(fresh, ["US_AAPL"])

    def test_open_brief_dispatch_rejects_an_all_stale_cohort(self) -> None:
        class Store:
            def get_latest_prices(self, _instrument_ids):
                return {}

        with self.assertRaisesRegex(RuntimeError, "all-stale brief run"):
            _fresh_open_brief_ids(
                Store(),
                ["US_DEAD"],
                market="US",
                session_phase="open_check",
                max_age_hours=3,
            )

    def test_search_heat_accepts_any_active_live_catalog_stock(self) -> None:
        class Store:
            def list_instruments(self, market):
                self.market = market
                return [
                    {"instrument_id": "US_AAPL", "status": "active"},
                    {"instrument_id": "US_NOK"},
                    {"instrument_id": "US_DEAD", "status": "inactive"},
                ]

        self.assertEqual(
            _search_heat_valid_ids(Store(), "US"),
            {"US_AAPL", "US_NOK"},
        )

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

    def test_brief_lanes_use_runtime_base_when_price_namespace_is_broad(self) -> None:
        self.assertEqual(
            _brief_base_universe_id("US", "us_core_155", None),
            "us_core_100",
        )

    def test_brief_lanes_honor_explicit_base_override(self) -> None:
        self.assertEqual(
            _brief_base_universe_id("US", "us_core_155", "us_core_155"),
            "us_core_155",
        )

    def test_ai_brief_cohort_is_active_ai_universe_plus_pro_tracked(self) -> None:
        store = object()
        with patch(
            "backend.cloudrun.orchestrator.dispatch.list_instruments",
            return_value=[
                {"instrument_id": "US_AAPL"},
                {"instrument_id": "US_NVDA"},
            ],
        ), patch(
            "backend.cloudrun.orchestrator.dispatch._tracked_ids",
            return_value=["US_NVDA", "US_SNDK"],
        ), patch(
            "backend.cloudrun.orchestrator.dispatch._search_heat_ids",
            return_value=["US_SNDK", "US_NOK"],
        ):
            self.assertEqual(
                _ai_brief_ids(store, "US", "us_core_100"),
                ["US_AAPL", "US_NVDA", "US_SNDK", "US_NOK"],
            )

    def test_tracked_cohort_only_uses_active_paid_accounts(self) -> None:
        class Store:
            def list_subscribed_users(self):
                return [
                    {
                        "is_subscribed": True,
                        "subscriptionId": "sub_active",
                        "subscriptionStatus": "active",
                        "tracked_stocks": ["US_AAPL"],
                    },
                    {
                        "is_subscribed": True,
                        "subscriptionId": "sub_paid_through",
                        "subscriptionStatus": "active",
                        "cancelAtPeriodEnd": True,
                        "tracked_stocks": ["US_NVDA"],
                    },
                    {
                        "is_subscribed": True,
                        "subscriptionStatus": "active",
                        "tracked_stocks": ["US_SNDK"],
                    },
                    {
                        "is_subscribed": True,
                        "subscriptionId": "sub_expired",
                        "subscriptionStatus": "expired",
                        "tracked_stocks": ["US_RKLB"],
                    },
                ]

        self.assertEqual(_tracked_ids(Store(), "US"), ["US_AAPL", "US_NVDA", "US_SNDK"])

    def test_price_cohort_ranks_the_broad_coverage_universe(self) -> None:
        class Store:
            def get_price_core_overrides(self, _market):
                return ["US_EXTRA"]

            def list_instruments(self, _market, _ids):
                return [{"instrument_id": "US_EXTRA"}]

        store = Store()
        with patch(
            "backend.cloudrun.orchestrator.dispatch.get_coverage_universe_id",
            return_value="us_core_155",
        ), patch(
            "backend.cloudrun.orchestrator.dispatch._rank_instruments",
            return_value=[
                {"instrument_id": "US_AAPL"},
                {"instrument_id": "US_NVDA"},
            ],
        ) as rank:
            ids = _price_core_ids(store, "US", "us_core_100", 500)

        rank.assert_called_once_with(store, "US", "us_core_155", 500)
        self.assertEqual(ids, ["US_AAPL", "US_NVDA", "US_EXTRA"])

    def test_brief_workers_receive_required_price_phase(self) -> None:
        args = argparse.Namespace(
            lane="tracked_open_briefs",
            per_stock_cap=4,
            chunk_workers=2,
            session_phase="post_close",
            max_workers=6,
        )

        self.assertEqual(
            _tracked_lane_extra_args(args),
            [
                "--per-stock-cap",
                "4",
                "--chunk-workers",
                "2",
                "--session-phase",
                "post_close",
                "--max-workers",
                "6",
            ],
        )


class _FakeClient:
    def __init__(self) -> None:
        self.wait_calls = 0
        self.run_calls: list[tuple[str, list[str]]] = []

    def run_job(self, *, job_name: str, args: list[str], wait_for_execution_name: bool = True) -> str:
        self.run_calls.append((job_name, args))
        if not wait_for_execution_name:
            return f"projects/p/locations/r/operations/{len(self.run_calls)}"
        return f"{job_name}/executions/{len(self.run_calls)}"

    def wait_execution(self, execution_resource_name: str) -> dict:
        self.wait_calls += 1
        return {"succeededCount": 1, "failedCount": 0, "cancelledCount": 0}


class _FakeState:
    def __init__(self) -> None:
        self.planned: list[dict] = []
        self.started: list[tuple[str, str]] = []

    def upsert_shard_plan(self, *, ref, instrument_ids, task_args) -> None:
        self.planned.append({"ref": ref, "instrument_ids": instrument_ids, "task_args": task_args})

    def mark_shard_started(self, ref, execution_name: str) -> None:
        self.started.append((ref.shard_id, execution_name))

    def mark_shard_finished(self, *args, **kwargs) -> None:
        raise AssertionError("async dispatch should not wait for shard completion")


class DispatchAsyncTest(unittest.TestCase):
    def test_single_job_dispatch_does_not_wait_by_default(self) -> None:
        client = _FakeClient()
        out = _run_single_job_lane(
            lane="reddit_buzz",
            market="US",
            universe_id="us_core_100",
            run_id="run_1",
            job_name="tikrr-reddit-buzz",
            extra_args=[],
            client=client,
        )
        self.assertEqual(out["status"], "dispatched")
        self.assertIn("operation", out)
        self.assertEqual(client.wait_calls, 0)

    def test_sharded_dispatch_does_not_wait_by_default(self) -> None:
        client = _FakeClient()
        state = _FakeState()
        out = _run_sharded_lane(
            lane="price_core_intraday",
            market="US",
            universe_id="us_core_100",
            run_id="run_1",
            job_name="tikrr-price-core-intraday",
            instrument_ids=["US_AAPL", "US_MSFT", "US_NVDA"],
            shard_size=2,
            extra_args=[],
            max_parallel=2,
            client=client,
            state=state,
        )
        self.assertEqual(out["status"], "dispatched")
        self.assertEqual(out["shard_count"], 2)
        self.assertEqual(client.wait_calls, 0)
        self.assertEqual(len(state.started), 2)
        self.assertTrue(all("operation" in row for row in out["results"]))


class LocalJobsClientTest(unittest.TestCase):
    def test_local_job_result_matches_cloudrun_execution_counts(self) -> None:
        client = LocalJobsClient()
        execution = client.run_job(
            job_name="tikrr-test",
            args=["-c", "print('ok')"],
        )
        payload = client.wait_execution(execution)
        self.assertEqual(payload["succeededCount"], 1)
        self.assertEqual(payload["failedCount"], 0)


if __name__ == "__main__":
    unittest.main()
