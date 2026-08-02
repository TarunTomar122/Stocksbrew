from __future__ import annotations

import json
import sys
from subprocess import CompletedProcess
from unittest.mock import patch
import unittest

from backend.cloudrun.jobs import tracked_incremental_refresh_job
from backend.scripts import run_incremental_tracked_refresh


class _Store:
    def get_active_ai_universe(self, market: str) -> str:
        assert market == "US"
        return "us_core_100"

    def list_subscribed_users(self) -> list[dict]:
        return [
            {
                "is_subscribed": True,
                "subscriptionId": "sub_active",
                "subscriptionStatus": "active",
                "tracked_stocks": ["US_AAPL", "US_NVDA"],
            }
        ]


class TrackedIncrementalRefreshTests(unittest.TestCase):
    def test_tracked_incremental_refresh_is_discovery_only_even_when_tickers_changed(self) -> None:
        commands: list[list[str]] = []

        def fake_run(command: list[str]) -> CompletedProcess[str]:
            commands.append(command)
            changed_path = command[command.index("--emit-changed-instrument-ids-path") + 1]
            with open(changed_path, "w", encoding="utf-8") as handle:
                json.dump(["US_AAPL"], handle)
            return CompletedProcess(command, 0, stdout="discovery complete", stderr="")

        argv = ["run_incremental_tracked_refresh", "--market", "US"]
        with patch.object(sys, "argv", argv), patch.object(run_incremental_tracked_refresh, "TraceMoneyStore", return_value=_Store()), patch.object(
            run_incremental_tracked_refresh, "_run", side_effect=fake_run
        ):
            run_incremental_tracked_refresh.main()

        self.assertEqual(len(commands), 1)
        command = commands[0]
        self.assertEqual(command[command.index("-m") + 1], "backend.scripts.build_per_stock_intelligence")
        self.assertIn("--discovery-only", command)
        self.assertNotIn("--enrich-only", command)
        self.assertNotIn("--synthesis-only", command)
        self.assertNotIn("backend.scripts.build_watchlist_views", command)

    def test_tracked_incremental_worker_does_not_pass_a_synthesis_flag(self) -> None:
        commands: list[list[str]] = []
        argv = [
            "tracked_incremental_refresh_job",
            "--run-id",
            "run-1",
            "--market",
            "US",
            "--universe",
            "us_core_100",
        ]

        with patch.object(sys, "argv", argv), patch.object(
            tracked_incremental_refresh_job.subprocess, "run", side_effect=lambda command, **_kwargs: commands.append(command)
        ):
            tracked_incremental_refresh_job.main()

        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0][commands[0].index("-m") + 1], "backend.scripts.run_incremental_tracked_refresh")
        self.assertNotIn("--no-llm", commands[0])
