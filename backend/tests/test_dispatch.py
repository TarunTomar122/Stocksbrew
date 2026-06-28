from __future__ import annotations

import unittest

from backend.cloudrun.orchestrator.dispatch import _lane_universe_id, _run_sharded_lane, _run_single_job_lane


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


if __name__ == "__main__":
    unittest.main()
