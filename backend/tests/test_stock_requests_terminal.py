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


def test_inactive_catalog_symbol_resolves_to_successor(monkeypatch) -> None:
    monkeypatch.setattr(process_stock_requests, "_resolve_exact_symbol_from_quotes", lambda *_args: None)
    resolved = process_stock_requests._resolve_request(
        [
            {
                "market": "US",
                "symbol": "OLD",
                "instrument_id": "US_OLD",
                "name": "Old Company",
                "aliases": ["OLD"],
                "active": False,
                "successor_instrument_id": "US_NEW",
            },
            {
                "market": "US",
                "symbol": "NEW",
                "instrument_id": "US_NEW",
                "name": "New Company",
                "exchange": "NYSE",
                "active": True,
            },
        ],
        "US",
        "OLD",
    )

    assert resolved is not None
    assert resolved["symbol"] == "NEW"
    assert resolved["resolution_source"] == "catalog_successor"


def test_llm_name_hint_accepts_current_symbol_when_catalog_is_behind(monkeypatch) -> None:
    monkeypatch.setattr(
        process_stock_requests,
        "_resolve_request",
        lambda _rows, _market, probe: {
            "market": "US",
            "symbol": probe,
            "instrument_id": f"US_{probe}",
            "name": probe,
            "aliases": [probe],
            "_score": 100,
        }
        if probe == "VRT"
        else None,
    )
    monkeypatch.setattr(
        process_stock_requests,
        "_llm_symbol_hints",
        lambda _query, _market: (["VRT"], ["Vertiv Holdings Co"]),
    )

    resolved = process_stock_requests._resolve_request_with_llm_fallback([], "US", "VERTIV")

    assert resolved is not None
    assert resolved["symbol"] == "VRT"
    assert resolved["name"] == "Vertiv Holdings Co"
    assert resolved["resolution_source"] == "llm_symbol_hint"


def test_current_symbol_alias_resolves_to_live_listing(monkeypatch) -> None:
    monkeypatch.setattr(
        process_stock_requests,
        "_resolve_exact_symbol_from_quotes",
        lambda symbol, market: {
            "market": market,
            "symbol": symbol,
            "instrument_id": f"US_{symbol}",
            "name": symbol,
            "aliases": [symbol],
            "_score": 100,
        },
    )

    resolved = process_stock_requests._resolve_request([], "US", "SK HYNIX")

    assert resolved is not None
    assert resolved["symbol"] == "SKHY"
    assert resolved["name"] == "SK hynix Inc."
    assert resolved["resolution_source"] == "current_symbol_alias"
