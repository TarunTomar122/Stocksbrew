from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.scripts.process_on_demand_news_jobs import _claim_job, _is_runnable_job


class _Snapshot:
    exists = True

    def __init__(self, data: dict) -> None:
        self.data = data

    def to_dict(self) -> dict:
        return dict(self.data)


class _Reference:
    def __init__(self, data: dict) -> None:
        self.data = data

    def get(self, transaction=None):
        return _Snapshot(self.data)


class _Transaction:
    def set(self, ref, payload, merge=False):
        ref.data.update(payload)


class _Database:
    def transaction(self):
        return _Transaction()


class _Store:
    db = _Database()


class OnDemandNewsRetryPolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 4, 12, 0, tzinfo=timezone.utc)

    def row(self, status: str, age_minutes: int, attempts: int = 1) -> dict:
        return {
            "status": status,
            "attempts": attempts,
            "updated_at": (self.now - timedelta(minutes=age_minutes)).isoformat(),
            "started_at": (self.now - timedelta(minutes=age_minutes)).isoformat(),
        }

    def test_queued_jobs_run_and_completed_jobs_do_not(self) -> None:
        self.assertTrue(_is_runnable_job({"status": "queued", "attempts": 0}, self.now))
        self.assertFalse(_is_runnable_job({"status": "complete", "attempts": 1}, self.now))

    def test_failed_job_retries_after_fifteen_minutes(self) -> None:
        self.assertFalse(_is_runnable_job(self.row("failed", 14), self.now))
        self.assertTrue(_is_runnable_job(self.row("failed", 15), self.now))

    def test_empty_coverage_waits_two_hours_before_retry(self) -> None:
        self.assertFalse(_is_runnable_job(self.row("no_articles", 119), self.now))
        self.assertTrue(_is_runnable_job(self.row("no_articles", 120), self.now))

    def test_stale_running_claim_is_recovered_and_attempts_are_bounded(self) -> None:
        self.assertFalse(_is_runnable_job(self.row("running", 29), self.now))
        self.assertTrue(_is_runnable_job(self.row("running", 30), self.now))
        self.assertFalse(_is_runnable_job(self.row("failed", 60, attempts=6), self.now))

    def test_atomic_claim_coalesces_overlapping_workers(self) -> None:
        ref = _Reference({
            "status": "queued",
            "attempts": 0,
            "requested_at": self.now.isoformat(),
        })
        with patch(
            "backend.scripts.process_on_demand_news_jobs.firestore.transactional",
            side_effect=lambda function: function,
        ):
            first = _claim_job(_Store(), ref, "claim-one")
            second = _claim_job(_Store(), ref, "claim-two")

        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(ref.data["processing_claim_id"], "claim-one")
        self.assertEqual(ref.data["attempts"], 1)


if __name__ == "__main__":
    unittest.main()
