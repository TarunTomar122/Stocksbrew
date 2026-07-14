"""Official-source discovery and normalization for the US Radar pipeline."""
from __future__ import annotations

import hashlib
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

import requests

from backend.url_extractor import extract_url

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{primary_document}"
MATERIAL_FORMS = {"8-K", "10-Q", "10-K", "6-K", "20-F"}
FORM_MATERIALITY = {"8-K": 78, "10-Q": 88, "10-K": 92, "6-K": 76, "20-F": 90}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sec_user_agent() -> str:
    configured = os.getenv("SEC_USER_AGENT", "").strip()
    if not configured:
        raise ValueError("SEC_USER_AGENT must identify the app and include a contact email")
    return configured


def sec_headers() -> dict[str, str]:
    return {
        "User-Agent": sec_user_agent(),
        "Accept-Encoding": "gzip, deflate",
        "Host": "data.sec.gov",
    }


def _stable_id(prefix: str, *parts: Any) -> str:
    raw = "|".join(str(part or "").strip() for part in parts)
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:24]}"


def fetch_sec_ticker_map(
    *,
    session: Any = requests,
    timeout: int = 20,
) -> dict[str, str]:
    response = session.get(
        SEC_TICKERS_URL,
        headers={"User-Agent": sec_user_agent(), "Accept-Encoding": "gzip, deflate"},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.values() if isinstance(payload, dict) else []
    out: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        ticker = str(row.get("ticker") or "").strip().upper()
        cik = str(row.get("cik_str") or "").strip()
        if ticker and cik.isdigit():
            out[ticker] = cik.zfill(10)
    return out


def _recent_filings(payload: dict[str, Any]) -> list[dict[str, str]]:
    recent = ((payload.get("filings") or {}).get("recent") or {})
    if not isinstance(recent, dict):
        return []
    keys = ("accessionNumber", "filingDate", "reportDate", "form", "primaryDocument", "items")
    columns = {key: recent.get(key) or [] for key in keys}
    length = max((len(value) for value in columns.values() if isinstance(value, list)), default=0)
    rows: list[dict[str, str]] = []
    for index in range(length):
        row = {
            key: str(value[index] if index < len(value) else "").strip()
            for key, value in columns.items()
            if isinstance(value, list)
        }
        rows.append(row)
    return rows


def fetch_sec_filings(
    ticker: str,
    cik: str,
    *,
    since: date,
    session: Any = requests,
    timeout: int = 20,
) -> list[dict[str, str]]:
    response = session.get(
        SEC_SUBMISSIONS_URL.format(cik=str(cik).zfill(10)),
        headers=sec_headers(),
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        return []
    rows: list[dict[str, str]] = []
    for row in _recent_filings(payload):
        form = row.get("form", "").upper()
        filing_date = row.get("filingDate", "")
        try:
            filed = date.fromisoformat(filing_date)
        except ValueError:
            continue
        if form not in MATERIAL_FORMS or filed < since:
            continue
        accession = row.get("accessionNumber", "")
        primary_document = row.get("primaryDocument", "")
        if not accession or not primary_document:
            continue
        accession_path = accession.replace("-", "")
        cik_path = str(int(cik))
        rows.append(
            {
                **row,
                "ticker": ticker.upper(),
                "cik": str(cik).zfill(10),
                "url": SEC_ARCHIVE_URL.format(
                    cik=cik_path,
                    accession=accession_path,
                    primary_document=primary_document,
                ),
            }
        )
    return rows


def sec_filing_records(
    instrument: dict[str, Any],
    filing: dict[str, str],
    *,
    detected_at: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or filing.get("ticker") or "").strip().upper()
    accession = str(filing.get("accessionNumber") or "").strip()
    form = str(filing.get("form") or "").strip().upper()
    filing_date = str(filing.get("filingDate") or "").strip()
    url = str(filing.get("url") or "").strip()
    detected = detected_at or utc_now_iso()
    evidence_id = _stable_id("sec", accession, instrument_id)
    event_id = _stable_id("event", instrument_id, "filing", accession)
    title = f"{ticker} filed a new {form}"
    items = str(filing.get("items") or "").strip()
    what_changed = title + (f" covering items {items}." if items else ".")
    evidence = {
        "evidence_id": evidence_id,
        "market": "US",
        "provider": "sec_edgar",
        "source_tier": "official",
        "document_kind": "filing",
        "url": url,
        "title": title,
        "published_at": f"{filing_date}T00:00:00+00:00",
        "detected_at": detected,
        "instrument_ids": [instrument_id],
        "facts": {
            "form": form,
            "accession_number": accession,
            "filing_date": filing_date,
            "report_date": filing.get("reportDate") or "",
            "items": items,
            "cik": filing.get("cik") or "",
        },
        "citation": {"publisher": "SEC EDGAR", "url": url},
        "extraction_confidence": 1.0,
    }
    event = {
        "event_id": event_id,
        "dedupe_key": f"{instrument_id}:filing:{accession}",
        "market": "US",
        "instrument_id": instrument_id,
        "ticker": ticker,
        "event_type": "filing",
        "direction": "neutral",
        "materiality": FORM_MATERIALITY.get(form, 70),
        "confidence": 100,
        "novelty": 100,
        "occurred_at": evidence["published_at"],
        "detected_at": detected,
        "before": {},
        "after": {"form": form, "items": items, "accession_number": accession},
        "evidence_refs": [evidence_id],
        "source_watermark": accession,
        "what_changed": what_changed,
        "why_it_matters": "This is a new company filing and may contain information that changes the investment case.",
        "next_trigger": "Review the filing before changing the position.",
    }
    return evidence, event


def ir_page_records(
    instrument: dict[str, Any],
    url: str,
    *,
    detected_at: str | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Extract an allowlisted issuer IR page through Firecrawl-first extraction."""
    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or "").strip().upper()
    extracted = extract_url(url)
    if extracted.status != "ok":
        return None, None
    detected = detected_at or utc_now_iso()
    content_hash = hashlib.sha256(extracted.body_text.encode("utf-8")).hexdigest()
    evidence_id = _stable_id("ir", instrument_id, url, content_hash)
    event_id = _stable_id("event", instrument_id, "ir_update", content_hash)
    evidence = {
        "evidence_id": evidence_id,
        "market": "US",
        "provider": extracted.provider,
        "source_tier": "official",
        "document_kind": "investor_relations",
        "url": url,
        "title": extracted.title,
        "published_at": extracted.published_at or detected,
        "detected_at": detected,
        "instrument_ids": [instrument_id],
        "facts": {
            "summary": extracted.summary,
            "content_hash": content_hash,
            "word_count": extracted.word_count,
        },
        "citation": {"publisher": extracted.publisher, "url": url},
        "extraction_confidence": 0.9,
    }
    event = {
        "event_id": event_id,
        "dedupe_key": f"{instrument_id}:ir_update:{content_hash}",
        "market": "US",
        "instrument_id": instrument_id,
        "ticker": ticker,
        "event_type": "company_update",
        "direction": "neutral",
        "materiality": 70,
        "confidence": 90,
        "novelty": 100,
        "occurred_at": evidence["published_at"],
        "detected_at": detected,
        "before": {},
        "after": {"title": extracted.title, "summary": extracted.summary},
        "evidence_refs": [evidence_id],
        "source_watermark": content_hash,
        "what_changed": f"{ticker} published a new investor-relations update: {extracted.title}.",
        "why_it_matters": extracted.summary,
        "next_trigger": "Read the company update and check whether it changes expectations.",
    }
    return evidence, event


def default_sec_since(days: int = 3) -> date:
    return datetime.now(timezone.utc).date() - timedelta(days=max(0, days))
