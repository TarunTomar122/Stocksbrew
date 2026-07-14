from __future__ import annotations

from datetime import date
from unittest.mock import patch

from backend.radar_official_sources import (
    fetch_sec_filings,
    fetch_sec_ticker_map,
    ir_page_records,
    sec_filing_records,
)
from backend.url_extractor import ExtractedArticle


class _Response:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


class _Session:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def get(self, *_args, **_kwargs) -> _Response:
        return _Response(self.payload)


def test_sec_ticker_map_normalizes_cik(monkeypatch) -> None:
    monkeypatch.setenv("SEC_USER_AGENT", "stocksbrew test contact@example.com")
    mapping = fetch_sec_ticker_map(
        session=_Session({"0": {"ticker": "AAPL", "cik_str": 320193}})
    )
    assert mapping == {"AAPL": "0000320193"}


def test_sec_filings_keeps_recent_material_forms(monkeypatch) -> None:
    monkeypatch.setenv("SEC_USER_AGENT", "stocksbrew test contact@example.com")
    payload = {
        "filings": {
            "recent": {
                "accessionNumber": ["0001-26-000001", "0001-26-000002", "0001-26-000003"],
                "filingDate": ["2026-07-09", "2026-07-08", "2026-06-01"],
                "reportDate": ["2026-07-09", "2026-07-08", "2026-06-01"],
                "form": ["8-K", "4", "10-Q"],
                "primaryDocument": ["a.htm", "b.htm", "c.htm"],
                "items": ["2.02", "", ""],
            }
        }
    }
    rows = fetch_sec_filings(
        "AAPL",
        "0000320193",
        since=date(2026, 7, 7),
        session=_Session(payload),
    )
    assert len(rows) == 1
    assert rows[0]["form"] == "8-K"
    assert rows[0]["url"].endswith("/000126000001/a.htm")


def test_sec_records_are_stable_and_cited() -> None:
    instrument = {"instrument_id": "US_AAPL", "ticker": "AAPL"}
    filing = {
        "accessionNumber": "0001-26-000001",
        "filingDate": "2026-07-09",
        "reportDate": "2026-07-09",
        "form": "8-K",
        "primaryDocument": "a.htm",
        "items": "2.02",
        "cik": "0000320193",
        "url": "https://www.sec.gov/example",
    }
    evidence, event = sec_filing_records(
        instrument,
        filing,
        detected_at="2026-07-10T08:00:00+00:00",
    )
    evidence_again, event_again = sec_filing_records(
        instrument,
        filing,
        detected_at="2026-07-10T09:00:00+00:00",
    )
    assert evidence["evidence_id"] == evidence_again["evidence_id"]
    assert event["event_id"] == event_again["event_id"]
    assert event["evidence_refs"] == [evidence["evidence_id"]]
    assert evidence["citation"]["publisher"] == "SEC EDGAR"


def test_ir_pages_use_extracted_company_evidence() -> None:
    extracted = ExtractedArticle(
        url="https://investor.example.com/update",
        title="Example raises full-year guidance",
        body_text="Example raised guidance after stronger demand. " * 20,
        summary="Example raised guidance after stronger demand.",
        published_at="2026-07-09T12:00:00+00:00",
        publisher="investor.example.com",
        status="ok",
        word_count=120,
        provider="firecrawl",
        note="",
    )
    with patch("backend.radar_official_sources.extract_url", return_value=extracted):
        evidence, event = ir_page_records(
            {"instrument_id": "US_EXM", "ticker": "EXM"},
            extracted.url,
            detected_at="2026-07-10T08:00:00+00:00",
        )
    assert evidence is not None and event is not None
    assert evidence["provider"] == "firecrawl"
    assert event["evidence_refs"] == [evidence["evidence_id"]]
    assert "raises full-year guidance" in event["what_changed"]
