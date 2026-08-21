from backend.scripts import process_stock_requests
from backend.scripts.process_stock_requests import RUNNABLE_REQUEST_STATUSES, _requester_emails


def test_needs_confirmation_is_not_reprocessed_by_cron() -> None:
    assert "needs_confirmation" not in RUNNABLE_REQUEST_STATUSES
    assert {"queued", "retry", "pending"} <= RUNNABLE_REQUEST_STATUSES


def test_requester_emails_are_deduplicated() -> None:
    assert _requester_emails(
        {"requester_emails": [" A@example.com ", "a@example.com"], "requester_email": "b@example.com"}
    ) == {"a@example.com", "b@example.com"}


def test_exact_ticker_can_resolve_when_symbol_master_is_missing(monkeypatch) -> None:
    class FakeYFinance:
        def __init__(self, **_kwargs):
            pass

        def fetch_quotes(self, _instruments, *, include_fundamentals):
            assert include_fundamentals is False
            return {
                "US_ZETA": {
                    "name": "Zeta Global",
                    "exchange": "NYSE",
                    "quote": {"current": 20.0},
                }
            }

    monkeypatch.setattr(process_stock_requests, "YFinanceClient", FakeYFinance)
    resolved = process_stock_requests._resolve_request([], "US", "ZETA")

    assert resolved is not None
    assert resolved["instrument_id"] == "US_ZETA"
    assert resolved["_score"] == 100


def test_exact_ticker_beats_a_misleading_master_alias(monkeypatch) -> None:
    class FakeYFinance:
        def __init__(self, **_kwargs):
            pass

        def fetch_quotes(self, _instruments, *, include_fundamentals):
            return {"US_ON": {"name": "ON Semiconductor", "quote": {"current": 50.0}}}

    monkeypatch.setattr(process_stock_requests, "YFinanceClient", FakeYFinance)
    resolved = process_stock_requests._resolve_request(
        [
            {
                "market": "US",
                "symbol": "ONON",
                "instrument_id": "US_ONON",
                "name": "On Holding AG",
                "aliases": ["ON"],
                "exchange": "NYSE",
            }
        ],
        "US",
        "ON",
    )

    assert resolved is not None
    assert resolved["instrument_id"] == "US_ON"
