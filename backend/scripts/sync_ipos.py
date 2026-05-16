"""Fetch IPO calendar from Alpha Vantage and store in Firestore.

Usage:
    python -m backend.scripts.sync_ipos
"""
from __future__ import annotations

import csv
import io
import os
import time
from datetime import datetime, timezone

import requests

from backend.env import load_backend_env
from backend.storage import TraceMoneyStore


def fetch_csv() -> str | None:
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        print("ALPHA_VANTAGE_API_KEY not set")
        return None

    url = (
        "https://www.alphavantage.co/query"
        f"?function=IPO_CALENDAR"
        f"&apikey={api_key}"
    )
    print(f"Fetching {url}")
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        print(f"HTTP {resp.status_code}: {resp.text[:300]}")
        return None

    text = resp.text.strip()
    if "Error Message" in text or "Invalid" in text:
        print(f"API error: {text[:300]}")
        return None

    return text


def parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        symbol = row.get("symbol", "").strip()
        if not symbol:
            continue
        ipo_date = row.get("ipoDate", "").strip()
        if not ipo_date:
            continue

        low_raw = row.get("priceRangeLow", "").strip()
        high_raw = row.get("priceRangeHigh", "").strip()
        try:
            low = float(low_raw) if low_raw else None
        except ValueError:
            low = None
        try:
            high = float(high_raw) if high_raw else None
        except ValueError:
            high = None

        rows.append({
            "ticker": symbol,
            "company": row.get("name", "").strip().strip('"'),
            "ipo_date": ipo_date,
            "price_range_low": low if low and low > 0 else None,
            "price_range_high": high if high and high > 0 else None,
            "exchange": row.get("exchange", "").strip(),
        })

    return rows


def write_firestore(rows: list[dict]) -> int:
    store = TraceMoneyStore()
    now_iso = datetime.now(timezone.utc).isoformat()
    saved = 0

    for row in rows:
        doc_id = f"{row['ticker']}_{row['ipo_date']}"
        payload = {
            "ticker": row["ticker"],
            "company": row["company"],
            "ipo_date": row["ipo_date"],
            "price_range_low": row["price_range_low"],
            "price_range_high": row["price_range_high"],
            "exchange": row["exchange"],
            "captured_at": now_iso,
        }
        store.db.collection("tm_ipo_events").document(doc_id).set(payload, merge=True)
        saved += 1

    return saved


def main() -> None:
    load_backend_env()
    t0 = time.time()

    print(f"\n{'='*55}")
    print(f"  sync_ipos")
    print(f"{'='*55}")

    text = fetch_csv()
    if not text:
        print("No data fetched, aborting")
        return

    rows = parse_csv(text)
    print(f"Parsed {len(rows)} IPO events")

    if not rows:
        print("No rows to save")
        return

    saved = write_firestore(rows)
    elapsed = time.time() - t0
    print(f"Done — saved {saved} events in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
