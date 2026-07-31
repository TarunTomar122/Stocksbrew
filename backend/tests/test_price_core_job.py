from unittest.mock import patch

import pytest

from backend.cloudrun.jobs import price_core_job


def test_price_core_worker_does_not_publish_a_low_coverage_batch() -> None:
    argv = [
        "price_core_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
        "--shard-id",
        "001",
        "--instrument-ids",
        "US_AAPL,US_MSFT,US_NVDA",
        "--session-phase",
        "open_check",
    ]

    with (
        patch("sys.argv", argv),
        patch.object(price_core_job, "TraceMoneyStore"),
        patch.object(
            price_core_job,
            "sync_price_snapshots",
            return_value={"input_count": 3, "saved_count": 1},
        ),
        patch.object(price_core_job, "materialize_views") as materialize,
        pytest.raises(RuntimeError, match="33.3%.*98%"),
    ):
        price_core_job.main()

    materialize.assert_not_called()
