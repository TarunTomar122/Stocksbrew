"""Build deterministic symbol master in Firestore.

Collection: tm_symbol_master/{MARKET__SYMBOL}
State doc : tm_config/symbol_master_state
"""
from __future__ import annotations

import argparse
import csv
import re
from io import StringIO
from datetime import datetime, timezone
from typing import Any

import requests

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore


SUFFIX_RE = re.compile(
    r"\b(incorporated|inc|corp|corporation|ltd|limited|plc|class a|class b|co|company|holdings?)\b",
    flags=re.IGNORECASE,
)
PUNCT_RE = re.compile(r"[^a-z0-9\s]")
SPACE_RE = re.compile(r"\s+")


def normalize_name(value: str) -> str:
    text = str(value or "").strip().lower()
    text = SUFFIX_RE.sub(" ", text)
    text = PUNCT_RE.sub(" ", text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def _aliases(instrument: dict[str, Any]) -> list[str]:
    raw = [
        str(instrument.get("ticker") or "").upper(),
        str(instrument.get("quote_symbol") or "").upper(),
        str(instrument.get("quote_symbol_yahoo") or "").upper(),
        str(instrument.get("name") or ""),
    ]
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not item:
            continue
        key = item.strip()
        if not key:
            continue
        norm = key.upper()
        if norm in seen:
            continue
        seen.add(norm)
        out.append(key)
    return out


def _fetch_alpha_vantage_us_listings(target_count: int) -> list[dict[str, Any]]:
    import os

    api_key = str(os.getenv("ALPHA_VANTAGE_API_KEY") or "").strip()
    if not api_key:
        return []
    url = "https://www.alphavantage.co/query"
    resp = requests.get(
        url,
        params={"function": "LISTING_STATUS", "state": "active", "apikey": api_key},
        timeout=90,
    )
    resp.raise_for_status()
    text = resp.text or ""
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(StringIO(text))
    for row in reader:
        symbol = str(row.get("symbol") or "").strip().upper()
        name = str(row.get("name") or symbol).strip()
        exchange = str(row.get("exchange") or "").strip().upper()
        asset_type = str(row.get("assetType") or "").strip().lower()
        if not symbol or len(symbol) > 5 or not symbol.isalpha():
            continue
        if asset_type and asset_type != "stock":
            continue
        if exchange not in {"NASDAQ", "NYSE", "NYSE ARCA", "NYSE MKT", "AMEX", "BATS"}:
            continue
        rows.append(
            {
                "market": "US",
                "symbol": symbol,
                "instrument_id": f"US_{symbol}",
                "name": name,
                "exchange": exchange,
                "aliases": [symbol, name],
                "normalized_name": normalize_name(name),
                "active": True,
            }
        )
        if len(rows) >= target_count * 2:
            break
    return rows


def build_rows_for_market(market: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()
    for instrument in list_instruments(market, None):
        symbol = str(instrument.get("ticker") or "").strip().upper()
        instrument_id = str(instrument.get("instrument_id") or "").strip()
        if not symbol or not instrument_id:
            continue
        name = str(instrument.get("name") or symbol).strip()
        rows.append(
            {
                "market": market,
                "symbol": symbol,
                "instrument_id": instrument_id,
                "name": name,
                "exchange": str(instrument.get("exchange") or "").strip().upper(),
                "aliases": _aliases(instrument),
                "normalized_name": normalize_name(name),
                "active": str(instrument.get("status") or "active").lower() != "inactive",
                "updated_at": now,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_symbol_master from instrument catalog")
    parser.add_argument("--markets", default="US,IN", help="Comma-separated markets")
    parser.add_argument("--target-us-size", type=int, default=2500, help="Target max US rows in symbol master")
    args = parser.parse_args()

    markets = [m.strip().upper() for m in str(args.markets or "").split(",") if m.strip()]
    if not markets:
        raise ValueError("No markets specified")

    store = TraceMoneyStore()
    coll = store.db.collection("tm_symbol_master")
    state_payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat(), "markets": {}}
    total = 0

    for market in markets:
        rows = build_rows_for_market(market)
        if market == "US" and args.target_us_size > 0:
            by_symbol = {str(r.get("symbol") or "").upper(): r for r in rows}
            external = _fetch_alpha_vantage_us_listings(args.target_us_size)
            for row in external:
                symbol = str(row.get("symbol") or "").upper()
                if not symbol:
                    continue
                existing = by_symbol.get(symbol)
                if existing:
                    aliases = set(existing.get("aliases") or [])
                    for a in row.get("aliases") or []:
                        if a:
                            aliases.add(a)
                    existing["aliases"] = list(aliases)
                    if not existing.get("name") and row.get("name"):
                        existing["name"] = row.get("name")
                    if not existing.get("exchange") and row.get("exchange"):
                        existing["exchange"] = row.get("exchange")
                    continue
                by_symbol[symbol] = row
            rows = list(by_symbol.values())
            rows.sort(key=lambda r: str(r.get("symbol") or ""))
            rows = rows[: args.target_us_size]

        for start in range(0, len(rows), 450):
            batch = store.db.batch()
            for row in rows[start : start + 450]:
                doc_id = f"{row['market']}__{row['symbol']}"
                batch.set(coll.document(doc_id), row, merge=True)
                total += 1
            batch.commit()
        state_payload["markets"][market] = {"count": len(rows)}
        print(f"[symbol-master] {market}: {len(rows)} rows")

    store.db.collection("tm_config").document("symbol_master_state").set(state_payload, merge=True)
    print(f"[symbol-master] done total_rows={total}")


if __name__ == "__main__":
    main()
