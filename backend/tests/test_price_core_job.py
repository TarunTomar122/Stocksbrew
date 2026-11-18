from unittest.mock import patch

import pytest

from backend.cloudrun.jobs import price_core_job


def test_open_worker_does_not_publish_a_low_coverage_batch() -> None:
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
        pytest.raises(RuntimeError, match="33.3%.*90%"),
    ):
        price_core_job.main()

    materialize.assert_not_called()


def _run(phase: str, price_result: dict) -> object:
    argv = [
        "price_core_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_155",
        "--shard-id",
        "002",
        "--instrument-ids",
        "US_AAPL,US_MSFT,US_NVDA",
        "--session-phase",
        phase,
    ]
    with (
        patch("sys.argv", argv),
        patch.object(price_core_job, "TraceMoneyStore"),
        patch.object(price_core_job, "sync_price_snapshots", return_value=price_result),
        patch.object(price_core_job, "materialize_views", return_value={}) as materialize,
    ):
        price_core_job.main()
    return materialize


# Nov 17's open shard: 344 of 366 priced (94.0%), the misses thin ETFs and small caps with no trade yet.
NOV_17_OPEN = {"input_count": 391, "saved_count": 344, "coverage_input_count": 366}


def test_open_run_publishes_a_shard_whose_thin_names_have_not_traded_yet() -> None:
    materialize = _run("open_check", NOV_17_OPEN)
    materialize.assert_called_once()


def test_open_run_still_stops_on_a_feed_outage() -> None:
    with pytest.raises(RuntimeError, match="below the 90% publish floor"):
        _run("open_check", {"input_count": 391, "saved_count": 300, "coverage_input_count": 366})


@pytest.mark.parametrize("phase", ["mid_check", "close_check", "manual"])
def test_later_runs_keep_the_full_floor(phase: str) -> None:
    with pytest.raises(RuntimeError, match="94.0% is below the 96% publish floor"):
        _run(phase, NOV_17_OPEN)


def test_open_floor_boundary() -> None:
    _run("open_check", {"input_count": 391, "saved_count": 330, "coverage_input_count": 366}).assert_called_once()  # 90.2%
    with pytest.raises(RuntimeError, match="89.9% is below the 90% publish floor"):
        _run("open_check", {"input_count": 391, "saved_count": 329, "coverage_input_count": 366})
