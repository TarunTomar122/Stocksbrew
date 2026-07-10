"""Send the free daily market brief to newsletter signups."""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.env import load_backend_env  # noqa: E402
from backend.newsletter_email import process_newsletter_briefs  # noqa: E402
from backend.storage import TraceMoneyStore  # noqa: E402


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send daily newsletter brief emails.")
    parser.add_argument("--market", default="US")
    parser.add_argument("--limit", type=int, default=0, help="Max subscribers to scan (0 = all)")
    parser.add_argument("--as-of-date", default="", help="Session date to target (YYYY-MM-DD)")
    parser.add_argument("--allow-stale", action="store_true", help="Send even if latest snapshot date differs")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    stats = process_newsletter_briefs(
        store,
        market=args.market,
        limit=max(0, args.limit),
        dry_run=args.dry_run,
        as_of_date=args.as_of_date.strip() or None,
        allow_stale=args.allow_stale,
    )
    print(json.dumps({"market": args.market.upper(), **stats, "dry_run": args.dry_run}))


if __name__ == "__main__":
    main()
