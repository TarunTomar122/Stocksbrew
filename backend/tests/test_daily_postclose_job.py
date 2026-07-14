from __future__ import annotations

from unittest.mock import patch

from backend.cloudrun.jobs import daily_postclose_job


class _Store:
    def get_price_core_overrides(self, _market: str) -> list[str]:
        return []


def test_postclose_materializes_without_llm_context_dependency() -> None:
    calls: list[list[str]] = []
    argv = [
        "daily_postclose_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
    ]

    with patch("sys.argv", argv), patch.object(
        daily_postclose_job,
        "_run",
        side_effect=lambda command: calls.append(list(command)),
    ), patch.object(
        daily_postclose_job,
        "get_coverage_universe_id",
        return_value="us_core_100",
    ), patch.object(
        daily_postclose_job,
        "TraceMoneyStore",
        return_value=_Store(),
    ):
        daily_postclose_job.main()

    materialize = next(command for command in calls if "backend.scripts.materialize_views" in command)
    watchlists = next(command for command in calls if "backend.scripts.build_watchlist_views" in command)
    assert "--allow-missing-context" in materialize
    assert "--no-llm" in watchlists
