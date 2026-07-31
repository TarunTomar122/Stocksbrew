"""Fetch latest quote snapshots for a configured instrument universe."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from backend.instrument_universe import list_instruments
from backend.price_pipeline_contract import is_current_market_timestamp
from backend.price_utils import has_valid_quote_change, normalize_quote_change
from backend.providers.yfinance_provider import YFinanceClient
from backend.storage import TraceMoneyStore


def _parse_instrument_ids(value: str | None) -> list[str] | None:
    if not value:
        return None
    ids = [item.strip().upper() for item in value.split(",") if item.strip()]
    return ids or None


def _sector_id(raw: str) -> str | None:
    if not raw:
        return None
    slug = raw.strip().lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    slug = "-".join(p for p in slug.split("-") if p)
    return slug or None


def _market_snapshot_rows(saved_rows: list[dict], instrument_by_id: dict[str, dict]) -> list[dict]:
    rows = []
    for snap in saved_rows:
        quote = snap.get("quote") or {}
        current = quote.get("current")
        if not isinstance(current, (int, float)):
            continue
        instrument = instrument_by_id.get(snap["instrument_id"]) or {}
        sector_raw = instrument.get("sector") or ""
        rows.append({
            "instrumentId": snap["instrument_id"],
            "market": snap["market"],
            "symbol": snap["ticker"],
            "name": snap.get("provider_metadata", {}).get("name") or instrument.get("name") or snap["ticker"],
            "sectorId": _sector_id(sector_raw),
            "lastUpdated": snap.get("captured_at"),
            "price": {
                "current": current,
                "change": quote.get("day_change_abs"),
                "changePct": quote.get("day_change_pct"),
                "previousClose": quote.get("previous_close"),
                "volume": quote.get("volume"),
            },
        })
    return rows


def sync_price_snapshots(
    *,
    market: str,
    universe_id: str,
    session_phase: str,
    max_workers: int = 8,
    instrument_ids: list[str] | None = None,
    activate: bool = False,
    merge_market_snapshot: bool = False,
    store: TraceMoneyStore | None = None,
    now: datetime | None = None,
) -> dict:
    store = store or TraceMoneyStore()
    if instrument_ids is not None:
        allowed = {instrument_id.strip().upper() for instrument_id in instrument_ids if instrument_id.strip()}
        # Resolve subset IDs against the full market catalog so callers can
        # pass IDs outside the selected universe (e.g., macro cue instruments
        # while running a core-stock cohort pipeline).
        market_catalog = list_instruments(market, None)
        market_by_id = {
            str(instrument.get("instrument_id", "")).upper(): instrument
            for instrument in market_catalog
        }
        instruments = [
            market_by_id[instrument_id]
            for instrument_id in instrument_ids
            if instrument_id.strip().upper() in market_by_id and instrument_id.strip().upper() in allowed
        ]
        missing = [
            instrument_id.strip().upper()
            for instrument_id in instrument_ids
            if instrument_id.strip().upper() in allowed and instrument_id.strip().upper() not in market_by_id
        ]
        if missing:
            refs = [store.db.collection("tm_instruments").document(instrument_id) for instrument_id in missing]
            for doc in store.db.get_all(refs):
                if not doc.exists:
                    continue
                row = doc.to_dict() or {}
                if str(row.get("market") or "").upper() != str(market).upper():
                    continue
                instruments.append(row)
    else:
        instruments = list_instruments(market, universe_id)
    client = YFinanceClient(max_workers=max_workers, max_retries=1)
    # Price and fundamentals are different products with different cadences.
    # Every scheduled price phase must stay on Yahoo's batched download path.
    # Weekly fundamentals jobs own `.info`/scraper work; letting post-close or
    # manual price refreshes request fundamentals turns a ~500-stock batch into
    # hundreds of slow per-ticker HTTP calls.
    raw_quotes = client.fetch_quotes(instruments, include_fundamentals=False)

    instrument_by_id: dict[str, dict] = {i["instrument_id"]: i for i in instruments}

    saved_rows = []
    fundamental_rows = []
    invalid_instrument_ids: list[str] = []
    stale_session_instrument_ids: list[str] = []
    require_current_session = session_phase in {
        "open_check",
        "mid_check",
        "close_check",
        "post_close",
    }
    reference_now = now or datetime.now(timezone.utc)
    for instrument in instruments:
        instrument_id = instrument["instrument_id"]
        quote_payload = raw_quotes.get(instrument_id)
        if not quote_payload:
            continue
        if require_current_session and not is_current_market_timestamp(
            quote_payload.get("captured_at"),
            market=market,
            now=reference_now,
        ):
            stale_session_instrument_ids.append(instrument_id)
            print(
                f"Skipping stale-session quote for {instrument_id}: "
                f"captured_at={quote_payload.get('captured_at') or 'missing'}"
            )
            continue
        quote = normalize_quote_change(quote_payload["quote"])
        if not has_valid_quote_change(quote):
            invalid_instrument_ids.append(instrument_id)
            print(f"Skipping invalid non-finite quote for {instrument_id}")
            continue
        snapshot = {
            "instrument_id": instrument_id,
            "market": instrument["market"],
            "ticker": instrument["ticker"],
            "captured_at": quote_payload["captured_at"],
            "session_phase": session_phase,
            "source": "yfinance",
            "currency": quote_payload.get("currency") or instrument.get("currency", "USD"),
            "quote": quote,
            "provider_metadata": {
                "yahoo_symbol": quote_payload.get("yahoo_symbol", ""),
                "exchange": quote_payload.get("exchange", instrument.get("exchange", "")),
                "name": quote_payload.get("name", instrument.get("name", "")),
            },
        }
        recent_sessions = quote_payload.get("recent_sessions")
        if isinstance(recent_sessions, list) and recent_sessions:
            snapshot["recent_sessions"] = recent_sessions
        if "fundamentals" in quote_payload:
            snapshot["fundamentals"] = quote_payload["fundamentals"]
        if "analyst_consensus" in quote_payload:
            snapshot["analyst_consensus"] = quote_payload["analyst_consensus"]
        saved_rows.append(snapshot)
        if snapshot.get("fundamentals"):
            fundamental_rows.append((instrument_id, {
                "instrument_id": instrument_id,
                "market": instrument["market"],
                "ticker": instrument["ticker"],
                "captured_at": quote_payload["captured_at"],
                "source": "yfinance",
                "currency": snapshot["currency"],
                "fundamentals": snapshot["fundamentals"],
                "analyst_consensus": snapshot.get("analyst_consensus", {}),
            }))

    store.save_price_snapshots_bulk(saved_rows)
    store.save_fundamental_snapshots_bulk(fundamental_rows)

    if activate:
        store.save_active_price_universe(market, universe_id)

    shard_rows = _market_snapshot_rows(saved_rows, instrument_by_id)
    if shard_rows:
        if merge_market_snapshot:
            store.merge_market_price_snapshot(market, shard_rows)
        else:
            store.save_market_price_snapshot(market, shard_rows)

    store.save_stage_watermark(
        market=market,
        stage_key="sync_price_snapshots",
        universe_id=universe_id,
        expected_count=len(instruments),
        success_count=len(saved_rows),
        error_count=max(0, len(instruments) - len(saved_rows)),
        metadata={
            "session_phase": session_phase,
            "market_rows": len(shard_rows),
            "merge_market_snapshot": bool(merge_market_snapshot),
            "invalid_quote_count": len(invalid_instrument_ids),
            "invalid_instrument_ids": invalid_instrument_ids,
            "stale_session_quote_count": len(stale_session_instrument_ids),
            "stale_session_instrument_ids": stale_session_instrument_ids,
        },
    )

    return {
        "market": market,
        "universe_id": universe_id,
        "input_count": len(instruments),
        "saved_count": len(saved_rows),
        "market_rows": len(shard_rows),
        "instrument_ids": [row["instrument_id"] for row in saved_rows],
        "invalid_quote_count": len(invalid_instrument_ids),
        "invalid_instrument_ids": invalid_instrument_ids,
        "stale_session_quote_count": len(stale_session_instrument_ids),
        "stale_session_instrument_ids": stale_session_instrument_ids,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Trace Money price snapshots")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="Universe id such as us_core_155")
    parser.add_argument(
        "--session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default="manual",
    )
    parser.add_argument("--print-json", action="store_true")
    parser.add_argument("--activate", action="store_true", help="Set this universe as the active price universe")
    parser.add_argument("--max-workers", type=int, default=8, help="Parallel yfinance workers")
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids for cohort/subset sync")
    parser.add_argument("--merge-market-snapshot", action="store_true", help="Merge subset rows into existing market snapshot")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market)
    if not universe_id:
        raise ValueError(
            f"No active price universe configured for {args.market}. "
            "Set tm_config/active_universes.US_universe (US) or pass --universe."
        )

    result = sync_price_snapshots(
        market=args.market,
        universe_id=universe_id,
        session_phase=args.session_phase,
        max_workers=args.max_workers,
        instrument_ids=_parse_instrument_ids(args.instrument_ids),
        activate=args.activate,
        merge_market_snapshot=args.merge_market_snapshot,
        store=store,
    )

    if args.print_json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Saved {result['saved_count']} price snapshots for {args.market} / {universe_id}.")


if __name__ == "__main__":
    main()
