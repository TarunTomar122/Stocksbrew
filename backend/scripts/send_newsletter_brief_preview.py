"""Send one newsletter brief preview to a single inbox."""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.env import load_backend_env  # noqa: E402
from backend.newsletter_email import process_newsletter_briefs  # noqa: E402
from backend.newsletter_intel import previous_trading_date_key
from backend.storage import TraceMoneyStore  # noqa: E402

DEFAULT_EMAIL = "tomartarun2001@gmail.com"


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send a newsletter brief preview email.")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--market", default="US")
    parser.add_argument(
        "--as-of-date",
        default="",
        help="Session date to use (default: previous US trading day)",
    )
    parser.add_argument(
        "--allow-stale",
        action="store_true",
        help="Send even if latest snapshot date differs from --as-of-date",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-dedupe", action="store_true", help="Do not log send for dedupe")
    args = parser.parse_args()

    store = TraceMoneyStore()
    as_of_date = args.as_of_date.strip() or previous_trading_date_key(args.market)

    stats = process_newsletter_briefs(
        store,
        market=args.market,
        dry_run=args.dry_run,
        force_email=args.email.strip(),
        as_of_date=as_of_date,
        allow_stale=True,
        skip_dedupe=args.skip_dedupe,
    )
    print(json.dumps({"to": args.email.strip(), "as_of_date": as_of_date, **stats}, indent=2))
    if not args.dry_run and stats.get("failed"):
        sys.exit(1)


if __name__ == "__main__":
    main()
