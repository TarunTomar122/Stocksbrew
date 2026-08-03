from unittest.mock import patch

from backend.cloudrun.jobs.stock_facts_job import (
    _is_financial_depth_candidate,
    _price_cohort_ids,
)


class FakeStore:
    def get_price_core_overrides(self, market: str) -> list[str]:
        return ["US_OVERRIDE"]

    def list_instruments(self, market: str, instrument_ids=None):
        rows = [
            {
                "instrument_id": "US_OVERRIDE",
                "ticker": "OVR",
                "market": "US",
                "status": "active",
            },
            {
                "instrument_id": "US_NOK",
                "ticker": "NOK",
                "market": "US",
                "status": "active",
            },
            {
                "instrument_id": "US_ARKQ",
                "ticker": "ARKQ",
                "market": "US",
                "status": "active",
                "name": "ARK Autonomous Technology & Robotics ETF",
            },
            {
                "instrument_id": "US_IDX_NDX",
                "ticker": "NDX",
                "market": "US",
                "status": "active",
                "type": "macro",
            },
        ]
        if instrument_ids is None:
            return rows
        allowed = set(instrument_ids)
        return [row for row in rows if row["instrument_id"] in allowed]


def test_financial_depth_candidates_exclude_non_company_symbols() -> None:
    assert _is_financial_depth_candidate({"instrument_id": "US_NOK", "ticker": "NOK"})
    assert not _is_financial_depth_candidate(
        {"instrument_id": "US_IDX_NDX", "ticker": "NDX", "type": "macro"}
    )
    assert not _is_financial_depth_candidate(
        {"instrument_id": "US_ARKQ", "ticker": "ARKQ", "name": "ARK Robotics ETF"}
    )
    assert not _is_financial_depth_candidate(
        {"instrument_id": "US_SPY", "ticker": "SPY", "name": "SPDR S&P 500 ETF Trust"}
    )
    assert not _is_financial_depth_candidate(
        {"instrument_id": "US_QQQ", "ticker": "QQQ", "name": "Invesco QQQ Trust"}
    )


def test_weekly_cohort_includes_searchable_companies_outside_core() -> None:
    core = [{"instrument_id": "US_AAPL", "ticker": "AAPL"}]
    with (
        patch(
            "backend.cloudrun.jobs.stock_facts_job.get_coverage_universe_id",
            return_value="us_core",
        ),
        patch(
            "backend.cloudrun.jobs.stock_facts_job.list_instruments",
            return_value=core,
        ),
    ):
        ids = _price_cohort_ids(FakeStore(), "US", "us_core")

    assert ids == ["US_AAPL", "US_OVERRIDE", "US_NOK"]
