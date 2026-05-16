"""Fetch earnings calendar from Alpha Vantage and store in Firestore.

Usage:
    python -m backend.scripts.sync_earnings_calendar
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

HORIZON = "3month"
BATCH_SIZE = 450

CSV_FIELDS = [
    "symbol",
    "name",
    "reportDate",
    "fiscalDateEnding",
    "estimate",
    "currency",
    "timeOfTheDay",
]


def fetch_csv() -> str | None:
    api_key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not api_key:
        print("ALPHA_VANTAGE_API_KEY not set")
        return None

    url = (
        "https://www.alphavantage.co/query"
        f"?function=EARNINGS_CALENDAR"
        f"&horizon={HORIZON}"
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
        report_date = row.get("reportDate", "").strip()
        if not report_date:
            continue

        estimate_raw = row.get("estimate", "").strip()
        try:
            estimate = float(estimate_raw) if estimate_raw else None
        except ValueError:
            estimate = None

        time_raw = row.get("timeOfTheDay", "").strip().lower()
        if "pre" in time_raw or "before" in time_raw:
            time_label = "bmo"
        elif "post" in time_raw or "after" in time_raw:
            time_label = "amc"
        else:
            time_label = "during"

        rows.append({
            "ticker": symbol,
            "company": row.get("name", "").strip().strip('"'),
            "event_date": report_date,
            "fiscal_date_ending": row.get("fiscalDateEnding", "").strip(),
            "eps_estimate": estimate,
            "time": time_label,
            "currency": row.get("currency", "").strip(),
        })

    return rows


def write_firestore(rows: list[dict]) -> int:
    store = TraceMoneyStore()
    now_iso = datetime.now(timezone.utc).isoformat()
    saved = 0
    batch = store.db.batch()

    for row in rows:
        doc_id = f"{row['ticker']}_{row['event_date']}"
        payload = {
            "ticker": row["ticker"],
            "company": row["company"],
            "event_date": row["event_date"],
            "fiscal_date_ending": row["fiscal_date_ending"],
            "eps_estimate": row["eps_estimate"],
            "time": row["time"],
            "market": "US",
            "captured_at": now_iso,
        }
        batch.set(
            store.db.collection("tm_earnings_events").document(doc_id),
            payload,
            merge=True,
        )
        saved += 1

        if saved % BATCH_SIZE == 0:
            batch.commit()
            batch = store.db.batch()
            print(f"  committed {saved}/{len(rows)}")

    if saved % BATCH_SIZE != 0:
        batch.commit()

    print(f"  committed {saved}/{len(rows)}")
    return saved


def main() -> None:
    load_backend_env()
    t0 = time.time()

    print(f"\n{'='*55}")
    print(f"  sync_earnings_calendar  horizon={HORIZON}")
    print(f"{'='*55}")

    text = fetch_csv()
    if not text:
        print("No data fetched, aborting")
        return

    rows = parse_csv(text)
    print(f"Parsed {len(rows)} earnings events")

    if not rows:
        print("No rows to save")
        return

    saved = write_firestore(rows)
    elapsed = time.time() - t0
    print(f"\nDone — saved {saved} events in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
