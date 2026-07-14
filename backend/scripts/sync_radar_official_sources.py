"""Sync official SEC and allowlisted investor-relations evidence for Radar."""
from __future__ import annotations

import argparse
import json
import time
from typing import Any

from backend.radar_official_sources import (
    default_sec_since,
    fetch_sec_filings,
    fetch_sec_ticker_map,
    ir_page_records,
    sec_filing_records,
)
from backend.storage import TraceMoneyStore


def _tracked_us_ids(store: TraceMoneyStore) -> list[str]:
    out: set[str] = set()
    for user in store.list_subscribed_users():
        for raw in user.get("tracked_stocks") or []:
            instrument_id = str(raw or "").strip().upper()
            if instrument_id.startswith("US_"):
                out.add(instrument_id)
    return sorted(out)


def _ir_urls(store: TraceMoneyStore, instrument_id: str) -> list[str]:
    snap = store.db.collection("tm_radar_source_registry").document(instrument_id).get()
    if not snap.exists:
        return []
    payload = snap.to_dict() or {}
    return [
        str(url).strip()
        for url in payload.get("investor_relations_urls") or []
        if str(url or "").strip().startswith("https://")
    ][:5]


def build_records(
    store: TraceMoneyStore,
    *,
    since_days: int,
    limit: int,
    include_ir: bool,
    sec_pause_seconds: float = 0.12,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    instrument_ids = _tracked_us_ids(store)
    if limit > 0:
        instrument_ids = instrument_ids[:limit]
    instruments = store.list_instruments("US", instrument_ids)
    instruments_by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in instruments
        if isinstance(row, dict)
    }
    ticker_map = fetch_sec_ticker_map()
    evidence: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    missing_cik: list[str] = []
    source_errors: list[dict[str, str]] = []
    ir_urls_registered = 0
    ir_pages_attempted = 0
    ir_pages_extracted = 0

    for instrument_id in instrument_ids:
        instrument = instruments_by_id.get(instrument_id) or {
            "instrument_id": instrument_id,
            "ticker": instrument_id.split("_", 1)[-1],
        }
        ticker = str(instrument.get("ticker") or "").strip().upper()
        cik = ticker_map.get(ticker)
        if not cik:
            missing_cik.append(ticker)
        else:
            try:
                filings = fetch_sec_filings(
                    ticker,
                    cik,
                    since=default_sec_since(since_days),
                )
                for filing in filings:
                    evidence_row, event_row = sec_filing_records(instrument, filing)
                    evidence.append(evidence_row)
                    events.append(event_row)
            except Exception as error:  # noqa: BLE001 - isolate one issuer
                source_errors.append({"ticker": ticker, "source": "sec", "error": str(error)[:160]})
            time.sleep(max(0.0, sec_pause_seconds))

        if include_ir:
            ir_urls = _ir_urls(store, instrument_id)
            ir_urls_registered += len(ir_urls)
            for url in ir_urls:
                ir_pages_attempted += 1
                try:
                    evidence_row, event_row = ir_page_records(instrument, url)
                    if evidence_row and event_row:
                        evidence.append(evidence_row)
                        events.append(event_row)
                        ir_pages_extracted += 1
                except Exception as error:  # noqa: BLE001 - isolate one page
                    source_errors.append({"ticker": ticker, "source": "ir", "error": str(error)[:160]})

    stats = {
        "tracked_count": len(instrument_ids),
        "evidence_count": len(evidence),
        "event_count": len(events),
        "missing_cik": missing_cik,
        "source_errors": source_errors,
        "ir_urls_registered": ir_urls_registered,
        "ir_pages_attempted": ir_pages_attempted,
        "ir_pages_extracted": ir_pages_extracted,
    }
    return evidence, events, stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync US official-source Radar evidence")
    parser.add_argument("--since-days", type=int, default=3)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--include-ir", action="store_true")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    evidence, events, stats = build_records(
        store,
        since_days=max(0, args.since_days),
        limit=max(0, args.limit),
        include_ir=args.include_ir,
    )
    if args.write:
        stats["evidence_saved"] = store.save_radar_evidence(evidence)
        # Events are emitted only by the state reducer. Persisting source-level
        # candidates here would bypass transition dedupe and prose quality gates.
        stats["event_candidates"] = len(events)
    else:
        stats["status"] = "dry_run"
    print(json.dumps(stats, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
