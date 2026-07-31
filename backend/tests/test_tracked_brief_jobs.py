from __future__ import annotations

import sys
import unittest
from contextlib import ExitStack
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from backend.cloudrun.jobs import tracked_news_prep_job, tracked_open_briefs_job


class TrackedBriefJobsTest(unittest.TestCase):
    def _run_job(self, module) -> tuple[list[str], dict]:
        argv = [
            module.__name__,
            "--run-id", "test-run",
            "--market", "US",
            "--universe", "us_core_100",
            "--shard-id", "001",
            "--instrument-ids", "US_AAPL",
        ]
        patches = [patch.object(sys, "argv", argv), patch.object(module.subprocess, "run")]
        if module is tracked_open_briefs_job:
            store_patch = patch.object(module, "TraceMoneyStore")
            patches.extend([store_patch, patch.object(module, "materialize_views", return_value={})])
        with ExitStack() as stack:
            entered = [stack.enter_context(item) for item in patches]
            run = entered[1]
            if module is tracked_open_briefs_job:
                store = entered[2].return_value
                market_day = datetime.now(ZoneInfo("America/New_York")).date().isoformat()
                store.get_latest_prices.return_value = {
                    "US_AAPL": {
                        "session_phase": "open_check",
                        "captured_at": f"{market_day}T14:00:00+00:00",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                }
                store.get_news_freshness_docs.return_value = {
                    "US_AAPL": {"last_discovery_at": "2999-01-01T00:00:00+00:00"}
                }
            module.main()
        return run.call_args.args[0], run.call_args.kwargs

    def test_prep_records_only_changed_tracked_tickers(self) -> None:
        command, _kwargs = self._run_job(tracked_news_prep_job)
        self.assertIn("--enrich-only", command)
        self.assertIn("--incremental", command)

    def test_open_synthesizes_only_changed_tracked_tickers(self) -> None:
        command, kwargs = self._run_job(tracked_open_briefs_job)
        self.assertIn("--synthesis-only", command)
        self.assertIn("--incremental", command)
        self.assertIn("--price-trigger-phase", command)
        self.assertIn("--include-no-news", command)
        self.assertIn("--require-complete", command)
        self.assertEqual(kwargs["timeout"], 900)

    def test_open_refreshes_stale_news_before_synthesis(self) -> None:
        argv = [
            tracked_open_briefs_job.__name__,
            "--run-id", "test-run",
            "--market", "US",
            "--universe", "us_core_100",
            "--shard-id", "001",
            "--instrument-ids", "US_AAPL",
        ]
        market_day = datetime.now(ZoneInfo("America/New_York")).date().isoformat()
        store = MagicMock()
        store.get_latest_prices.return_value = {
            "US_AAPL": {
                "session_phase": "open_check",
                "captured_at": f"{market_day}T14:00:00+00:00",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }
        store.get_news_freshness_docs.side_effect = [
            {"US_AAPL": {"last_discovery_at": "2020-01-01T00:00:00+00:00"}},
            {"US_AAPL": {"last_discovery_at": "2999-01-01T00:00:00+00:00"}},
        ]

        with patch.object(sys, "argv", argv), patch.object(
            tracked_open_briefs_job,
            "TraceMoneyStore",
            return_value=store,
        ), patch.object(
            tracked_open_briefs_job.subprocess,
            "run",
        ) as run, patch.object(
            tracked_open_briefs_job,
            "materialize_views",
            return_value={},
        ):
            tracked_open_briefs_job.main()

        refresh_cmd = run.call_args_list[0].args[0]
        synthesis_cmd = run.call_args_list[1].args[0]
        self.assertIn("--enrich-only", refresh_cmd)
        self.assertNotIn("--synthesis-only", refresh_cmd)
        self.assertIn("--synthesis-only", synthesis_cmd)
        self.assertEqual(run.call_args_list[0].kwargs["timeout"], 900)

    def test_same_phase_price_from_yesterday_is_rejected(self) -> None:
        class Store:
            def get_latest_prices(self, _instrument_ids):
                return {
                    "US_AAPL": {
                        "session_phase": "open_check",
                        "captured_at": "2026-07-29T13:30:00+00:00",
                        "updated_at": "2026-07-29T13:31:00+00:00",
                    }
                }

        fresh, stale = tracked_open_briefs_job._fresh_price_ids(
            Store(),
            ["US_AAPL"],
            market="US",
            session_phase="open_check",
            max_age_hours=3,
            now=datetime(2026, 7, 30, 14, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(fresh, [])
        self.assertEqual(stale, ["US_AAPL"])
