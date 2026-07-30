from __future__ import annotations

import sys
import unittest
from contextlib import ExitStack
from unittest.mock import patch

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
                store.get_latest_prices.return_value = {
                    "US_AAPL": {"session_phase": "open_check"}
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
        self.assertEqual(kwargs["timeout"], 480)
