"""
Send a one-off price alert preview to a given inbox (does not mark alerts triggered).
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.env import load_backend_env  # noqa: E402
from backend.price_alerts import find_watchlist_row, send_price_alert_notification  # noqa: E402
from backend.storage import TraceMoneyStore  # noqa: E402

DEFAULT_UID = "bHeaWG9bjMbnFoiOPxhA5cJiBw92"
DEFAULT_EMAIL = "tomartarun2001@gmail.com"


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send a price alert preview email.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Recipient inbox")
    parser.add_argument("--uid", default=DEFAULT_UID, help="User uid for watchlist enrichment")
    parser.add_argument("--ticker", default="MU", help="Ticker symbol")
    parser.add_argument("--condition", choices=["below", "above"], default="above")
    parser.add_argument("--target", type=float, default=1100.0, help="Alert target price")
    parser.add_argument(
        "--current",
        type=float,
        default=None,
        help="Override current price (defaults to watchlist row price)",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    ticker = args.ticker.strip().upper()
    row = find_watchlist_row(store, uid=args.uid, ticker=ticker)
    current = args.current
    if current is None:
        if row and row.get("price") is not None:
            current = float(row["price"])
        else:
            current = args.target * (1.05 if args.condition == "above" else 0.95)

    instrument_id = str((row or {}).get("instrument_id") or "")
    alert = {
        "id": "preview",
        "uid": args.uid,
        "email": args.email,
        "ticker": ticker,
        "instrument_id": instrument_id,
        "condition": args.condition,
        "target_price": float(args.target),
        "kind": "price_threshold",
    }

    print(f"Sending preview: {ticker} {args.condition} ${args.target:.2f} (now ${current:.2f}) → {args.email}")
    ok = send_price_alert_notification(
        store,
        alert=alert,
        current_price=float(current),
        row=row,
        to_email=args.email,
        dry_run=False,
    )
    if ok:
        print("Sent.")
    else:
        print("Send failed — check EMAILS_ENABLED=1 and BREVO_API_KEY.")
        sys.exit(1)


if __name__ == "__main__":
    main()
