from __future__ import annotations

from unittest.mock import MagicMock, patch

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
