"""Materialized stock-page view docs.

The web stock page reads one `tm_views_stock_page/{market}__{instrument_id}`
doc instead of fanning out to ~10 source collections per render. Sections are
written by the SAME job that writes the source doc (single batch), so a view
can never be newer or older than its source: a crashed job rolls both writes
back together. `build_stock_page_views.py` is the initial backfill only; no
sweeper/cron keeps this fresh.

View doc shape (flat, whole-field replacement per section):
{
  instrument_id, ticker, market, built_at,
  intelligence: {...}|None, intelligence_stamp: iso|None,
  business_questions: {...}|None, business_questions_stamp: iso|None,
  instrument_view: {...}|None, instrument_view_stamp: iso|None,
  intel_pro: {...}|None, intel_pro_stamp: iso|None,
  facts: {...}|None, facts_stamp: iso|None,
  technicals: {...}|None, technicals_stamp: iso|None,
  earnings_intel: {...}|None, earnings_intel_stamp: iso|None,
  pre_earnings: {...}|None, pre_earnings_stamp: iso|None,
  peers: {"better": [...], "rows": [...]}|None, peers_stamp: iso|None,
}
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

STOCK_PAGE_VIEW_COLLECTION = "tm_stock_page_views"

SECTION_KEYS = (
    "intelligence",
    "business_questions",
    "instrument_view",
    "intel_pro",
    "facts",
    "technicals",
    "earnings_intel",
    "pre_earnings",
    "peers",
)

_STAMP_FIELDS = (
    "generated_at",
    "captured_at",
    "updated_at",
    "as_of_date",
    "event_date",
)


def market_for_instrument_id(instrument_id: str) -> str:
    prefix = str(instrument_id or "").split("_", 1)[0].strip().upper()
    return prefix or "US"


def stock_page_view_doc_id(market: str, instrument_id: str) -> str:
    market_key = str(market or market_for_instrument_id(instrument_id)).strip().upper()
    return f"{market_key}__{str(instrument_id or '').strip().upper()}"


def stock_page_view_ref(db: Any, market: str, instrument_id: str) -> Any:
    return db.collection(STOCK_PAGE_VIEW_COLLECTION).document(
        stock_page_view_doc_id(market, instrument_id)
    )


def section_stamp(payload: dict[str, Any] | None, *, now_iso: str | None = None) -> str | None:
    """Pick the source doc's own freshness stamp for a view section."""
    if not isinstance(payload, dict):
        return now_iso or None
    for field in _STAMP_FIELDS:
        value = payload.get(field)
        text = str(value or "").strip()
        if text:
            return text
    return now_iso or None


def section_payload(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize a section into `{data, stamp}` or None when absent."""
    if not isinstance(data, dict) or not data:
        return None
    return {"data": data, "stamp": section_stamp(data)}


def merge_stock_view_sections(
    db: Any,
    market: str,
    instrument_id: str,
    sections: dict[str, Any],
    *,
    batch: Any | None = None,
) -> None:
    """Merge `{section: payload}` into the stock page view doc.

    Must be added to the SAME batch that writes the source doc so the two
    commit atomically. Pass an existing batch to append ops; otherwise one is
    created and committed here.
    """
    instrument_id = str(instrument_id or "").strip()
    if not instrument_id:
        return
    built_at = datetime.now(timezone.utc).isoformat()
    updates: dict[str, Any] = {
        "instrument_id": instrument_id,
        "market": str(market or market_for_instrument_id(instrument_id)).upper(),
        "ticker": str(instrument_id.split("_", 1)[1] if "_" in instrument_id else instrument_id).upper(),
        "built_at": built_at,
    }
    for key, data in sections.items():
        if key not in SECTION_KEYS:
            raise ValueError(f"Unknown stock page view section: {key}")
        payload = section_payload(data)
        # An absent section gets the write's own stamp so the reader trusts
        # "known missing" without re-fetching the source.
        updates[key] = payload["data"] if payload else None
        updates[f"{key}_stamp"] = (payload["stamp"] if payload else None) or built_at
    if not any(updates.get(key) is not None for key in SECTION_KEYS):
        return
    ref = stock_page_view_ref(db, market, instrument_id)
    if batch is not None:
        batch.set(ref, updates, merge=True)
        return
    write_batch = db.batch()
    write_batch.set(ref, updates, merge=True)
    write_batch.commit()


def build_stock_page_view_docs(
    db: Any,
    market: str,
    rows: Iterable[dict[str, Any]],
    batch_size: int = 200,
) -> int:
    """Write fully composed view docs. Each row: instrument_id + section data.

    Used by build_stock_page_views.py for the initial backfill; ongoing
    freshness comes from write-through in the source writers. One doc per
    batch op, so `batch_size` rows go into one commit.
    """
    saved = 0
    batch = db.batch()
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in rows:
        instrument_id = str(row.get("instrument_id") or "").strip()
        if not instrument_id:
            continue
        built_at = row.get("built_at") or now_iso
        updates: dict[str, Any] = {
            "instrument_id": instrument_id,
            "market": str(market).upper(),
            "ticker": str(instrument_id.split("_", 1)[1] if "_" in instrument_id else instrument_id),
            "built_at": built_at,
        }
        for key in SECTION_KEYS:
            payload = section_payload(row.get(key))
            # Absent sections are stamped too: the reader trusts "known
            # missing" from the same snapshot instead of re-reading sources.
            updates[key] = payload["data"] if payload else None
            updates[f"{key}_stamp"] = (payload["stamp"] if payload else None) or built_at
        batch.set(stock_page_view_ref(db, market, instrument_id), updates, merge=True)
        saved += 1
        if saved % batch_size == 0:
            batch.commit()
            batch = db.batch()
    if saved % batch_size != 0:
        batch.commit()
    return saved
