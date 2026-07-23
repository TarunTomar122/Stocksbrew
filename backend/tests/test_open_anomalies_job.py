from __future__ import annotations

from unittest.mock import patch

from backend.cloudrun.jobs import open_anomalies_job


def test_close_anomalies_requires_post_close_price_phase() -> None:
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
    ]

    with patch("sys.argv", argv), patch.object(
        open_anomalies_job,
        "_run",
        side_effect=lambda command: calls.append(list(command)),
    ):
        open_anomalies_job.main()

    anomaly = calls[0]
    assert "backend.scripts.build_daily_anomalies" in anomaly
    phase_index = anomaly.index("--require-price-session-phase")
    assert anomaly[phase_index + 1] == "post_close"
    assert "--require-web-revalidate" in anomaly
    assert "--enrich-missing" not in anomaly
    assert "--explain-hard-moves" not in anomaly


def test_open_anomalies_keeps_intelligence_enrichment() -> None:
    calls: list[list[str]] = []
    argv = [
        "open_anomalies_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
    ]

    with patch("sys.argv", argv), patch.object(
        open_anomalies_job,
        "_run",
        side_effect=lambda command: calls.append(list(command)),
    ):
        open_anomalies_job.main()

    anomaly = calls[0]
    assert "--enrich-missing" in anomaly
    assert "--explain-hard-moves" in anomaly
