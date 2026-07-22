from __future__ import annotations

from unittest.mock import patch

from backend.cloudrun.jobs import daily_postclose_job


class _Store:
    def get_price_core_overrides(self, _market: str) -> list[str]:
        return ["US_SNDK"]


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

    materialize = next(
        command
        for command in calls
        if "backend.scripts.materialize_views" in command and "--activate" in command
    )
    watchlists = next(command for command in calls if "backend.scripts.build_watchlist_views" in command)
    assert "--allow-missing-context" in materialize
    assert "--no-llm" in watchlists

    override_price_index = next(
        index
        for index, command in enumerate(calls)
        if "backend.scripts.sync_price_snapshots" in command and "--instrument-ids" in command
    )
    shared_materialize_index = calls.index(materialize)
    search_index = next(
        index
        for index, command in enumerate(calls)
        if "backend.scripts.materialize_search_index" in command
    )
    watchlist_index = calls.index(watchlists)
    assert override_price_index < shared_materialize_index < search_index < watchlist_index

    override_price = calls[override_price_index]
    assert override_price[override_price.index("--instrument-ids") + 1] == "US_SNDK"
    assert "--merge-market-snapshot" in override_price
