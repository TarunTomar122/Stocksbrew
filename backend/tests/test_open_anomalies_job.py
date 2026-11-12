from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from backend.cloudrun.jobs import open_anomalies_job


def test_close_anomalies_publishes_prices_then_runs_dedicated_mover_research() -> None:
    calls: list[list[str]] = []
    argv = [
        "open_anomalies_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
        "--price-session-phase",
        "post_close",
        "--skip-session-barrier",
    ]

    with patch("sys.argv", argv), patch.object(
        open_anomalies_job,
        "_run",
        side_effect=lambda command: calls.append(list(command)),
    ):
        open_anomalies_job.main()

    price_pass, research_pass = calls[:2]
    assert "backend.scripts.build_daily_anomalies" in price_pass
    phase_index = price_pass.index("--require-price-session-phase")
    assert price_pass[phase_index + 1] == "post_close"
    assert "--require-web-revalidate" in price_pass
    assert "--mover-reasoning-only" in price_pass
    assert "--enrich-missing" not in price_pass
    assert "--explain-hard-moves" not in price_pass
    assert "--mover-reasoning-only" in price_pass
    assert "backend.scripts.research_daily_anomaly_reasons" in research_pass
    assert "--only-unresolved" in research_pass
    assert "--require-complete" in research_pass
    assert "--enrich-missing" not in research_pass
    assert "--explain-hard-moves" not in research_pass
    research_phase = research_pass.index("--expected-price-session-phase")
    assert research_pass[research_phase + 1] == "post_close"
    assert not any("backend.scripts.send_open_briefs" in command for command in calls)


def test_open_anomalies_runs_dedicated_mover_research() -> None:
    calls: list[list[str]] = []
    argv = [
        "open_anomalies_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
        "--price-session-phase",
        "open_check",
        "--skip-session-barrier",
    ]

    with patch("sys.argv", argv), patch.object(
        open_anomalies_job,
        "_run",
        side_effect=lambda command: calls.append(list(command)),
    ):
        open_anomalies_job.main()

    price_pass, research_pass, email_pass = calls[:3]
    assert "--enrich-missing" not in price_pass
    assert "--explain-hard-moves" not in price_pass
    assert "backend.scripts.research_daily_anomaly_reasons" in research_pass
    assert "--only-unresolved" in research_pass
    assert "--require-complete" in research_pass
    assert "backend.scripts.send_open_briefs" in email_pass
    assert email_pass[email_pass.index("--market") + 1] == "US"


def test_open_barrier_does_not_wait_for_briefs_that_now_wait_for_it() -> None:
    assert open_anomalies_job.barrier_stages("open_check") == ["price"]
    assert open_anomalies_job.barrier_stages("post_close") == ["price", "briefs"]


def test_midday_barrier_waits_on_prices_only() -> None:
    # No brief run happens at midday; waiting on one would hang an hour and fail.
    assert open_anomalies_job.barrier_stages("mid_check") == ["price"]


_NY = ZoneInfo("America/New_York")


def _midday_argv(*, skip_barrier: bool = True) -> list[str]:
    argv = [
        "open_anomalies_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
        "--price-session-phase",
        "mid_check",
    ]
    return [*argv, "--skip-session-barrier"] if skip_barrier else argv


def test_midday_rebuild_carries_reasons_researches_the_rest_and_sends_no_email() -> None:
    calls: list[list[str]] = []
    with patch("sys.argv", _midday_argv()), patch.object(
        open_anomalies_job, "midday_rebuild_allowed", return_value=True
    ), patch.object(open_anomalies_job, "_run", side_effect=lambda command: calls.append(list(command))):
        open_anomalies_job.main()

    assert len(calls) == 2
    price_pass, research_pass = calls
    assert price_pass[price_pass.index("--require-price-session-phase") + 1] == "mid_check"
    assert "--carry-session-reasons" in price_pass
    assert "--only-unresolved" in research_pass
    assert research_pass[research_pass.index("--expected-price-session-phase") + 1] == "mid_check"
    assert not any("send_open_briefs" in " ".join(command) for command in calls)


def test_midday_rebuild_records_its_stage_after_waiting_on_prices_only() -> None:
    barrier = MagicMock()
    with patch("sys.argv", _midday_argv(skip_barrier=False)), patch.object(
        open_anomalies_job, "midday_rebuild_allowed", return_value=True
    ), patch.object(open_anomalies_job, "MarketSessionState", return_value=barrier), patch.object(
        open_anomalies_job, "_run"
    ):
        open_anomalies_job.main()

    waited = [call.kwargs["stages"] for call in barrier.wait_for_stages.call_args_list]
    assert waited == [["price"]]
    barrier.record_stage.assert_called_once()
    assert barrier.record_stage.call_args.kwargs["phase"] == "mid_check"


def test_open_and_close_runs_never_carry_reasons() -> None:
    for phase in ("open_check", "post_close"):
        calls: list[list[str]] = []
        argv = [*_midday_argv()]
        argv[argv.index("mid_check")] = phase
        with patch("sys.argv", argv), patch.object(
            open_anomalies_job, "_run", side_effect=lambda command: calls.append(list(command))
        ):
            open_anomalies_job.main()
        assert "--carry-session-reasons" not in calls[0], phase


def test_late_midday_catch_up_skips_instead_of_replacing_the_close_feed() -> None:
    with patch("sys.argv", _midday_argv()), patch.object(
        open_anomalies_job, "midday_rebuild_allowed", return_value=False
    ), patch.object(open_anomalies_job, "_run") as run:
        open_anomalies_job.main()
    run.assert_not_called()


def test_midday_window_is_checked_again_after_the_barrier_wait() -> None:
    barrier = MagicMock()
    with patch("sys.argv", _midday_argv(skip_barrier=False)), patch.object(
        open_anomalies_job, "midday_rebuild_allowed", side_effect=[True, False]
    ), patch.object(open_anomalies_job, "MarketSessionState", return_value=barrier), patch.object(
        open_anomalies_job, "_run"
    ) as run:
        open_anomalies_job.main()
    barrier.wait_for_stages.assert_called_once()
    run.assert_not_called()
    barrier.record_stage.assert_not_called()


def test_midday_window() -> None:
    allowed = open_anomalies_job.midday_rebuild_allowed
    assert allowed("US", datetime(2026, 11, 11, 12, 20, tzinfo=_NY))
    assert allowed("US", datetime(2026, 11, 11, 14, 25, tzinfo=_NY))
    assert allowed("US", datetime(2026, 11, 11, 15, 29, tzinfo=_NY))
    assert not allowed("US", datetime(2026, 11, 11, 15, 30, tzinfo=_NY))
    assert not allowed("US", datetime(2026, 11, 11, 17, 0, tzinfo=_NY))
    assert not allowed("US", datetime(2026, 11, 11, 9, 0, tzinfo=_NY))
    assert not allowed("US", datetime(2026, 11, 14, 12, 20, tzinfo=_NY))  # Saturday
    # An aware UTC instant is judged in New York time: 17:20 UTC is 12:20 ET.
    assert allowed("US", datetime(2026, 11, 11, 17, 20, tzinfo=ZoneInfo("UTC")))


def test_open_email_waits_for_prices_and_anomalies_only() -> None:
    barrier = MagicMock()
    argv = [
        "open_anomalies_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
        "--price-session-phase",
        "open_check",
    ]
    with patch("sys.argv", argv), patch.object(
        open_anomalies_job, "MarketSessionState", return_value=barrier
    ), patch.object(open_anomalies_job, "_run"):
        open_anomalies_job.main()

    waited = [call.kwargs["stages"] for call in barrier.wait_for_stages.call_args_list]
    assert waited == [["price"], ["price", "anomalies"]]
    barrier.record_stage.assert_called_once()
