from __future__ import annotations

from unittest.mock import patch

from backend.cloudrun.jobs import daily_postclose_job


class _Store:
    def get_price_core_overrides(self, _market: str) -> list[str]:
        return ["US_SNDK"]

    def save_stage_watermark(self, **_kwargs) -> None:
        return None

    def list_instruments(self, _market: str, instrument_ids: list[str]) -> list[dict]:
        return [{"instrument_id": instrument_id} for instrument_id in instrument_ids]


def test_postclose_is_price_only_and_leaves_fundamentals_to_weekly_job() -> None:
    calls: list[tuple[str, list[str]]] = []
    argv = [
        "daily_postclose_job",
        "--run-id",
        "test-run",
        "--market",
        "US",
        "--universe",
        "us_core_100",
    ]

    def fake_run(stage: str, command: list[str]) -> dict[str, object]:
        calls.append((stage, list(command)))
        return {"stage": stage, "elapsed_seconds": 0.1}

    with patch("sys.argv", argv), patch.object(
        daily_postclose_job,
        "_run",
        side_effect=fake_run,
    ), patch.object(
        daily_postclose_job,
        "list_instruments",
        return_value=[{"instrument_id": "US_AAPL"}],
    ), patch.object(
        daily_postclose_job,
        "get_coverage_universe_id",
        return_value="us_core_155",
    ), patch.object(
        daily_postclose_job,
        "sync_price_snapshots",
        return_value={
            "input_count": 2,
            "saved_count": 2,
            "instrument_ids": ["US_AAPL", "US_SNDK"],
        },
    ) as price_sync, patch.object(
        daily_postclose_job,
        "TraceMoneyStore",
        return_value=_Store(),
    ):
        daily_postclose_job.main()

    assert price_sync.call_count == 1
    assert price_sync.call_args.kwargs["instrument_ids"] == ["US_AAPL", "US_SNDK"]
    assert price_sync.call_args.kwargs["session_phase"] == "post_close"

    commands = [command for _stage, command in calls]
    materialize = next(
        command
        for command in commands
        if "backend.scripts.materialize_views" in command
    )
    local_technicals = next(
        command
        for command in commands
        if "backend.scripts.build_stock_technicals" in command
    )
    watchlists = next(
        command
        for command in commands
        if "backend.scripts.build_watchlist_views" in command
    )
    assert "--allow-missing-context" in materialize
    assert "--no-finviz" in local_technicals
    assert "--no-llm" in watchlists
    assert not any("backend.scripts.sync_stock_metrics" in command for command in commands)
    assert not any("backend.scripts.sync_stock_facts" in command for command in commands)
