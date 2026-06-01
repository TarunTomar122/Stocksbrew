"""Run the scheduled email system in one pass.

This is the production entrypoint for the open-email lane:
1. Send the daily digest / free market email.
2. Process lifecycle and conversion flows.
3. Process earnings setup emails.
"""
from __future__ import annotations

import argparse

from backend.scripts.send_lifecycle_emails import run_lifecycle_emails
from backend.scripts.send_market_open_newsletters import run_market_open_newsletters


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the scheduled email system")
    parser.add_argument("--market", default="US")
    parser.add_argument("--limit", type=int, default=0, help="optional max users for daily digest pass")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    digest_summary = run_market_open_newsletters(
        market=str(args.market or "US").upper(),
        limit=max(0, int(args.limit or 0)),
        dry_run=bool(args.dry_run),
    )
    lifecycle_summary = run_lifecycle_emails(
        include_pro_daily_digest=False,
        include_pro_directive_change=False,
        include_pro_earnings_setup=True,
        dry_run=bool(args.dry_run),
    )
    print(
        {
            "market_open_digest": digest_summary,
            "lifecycle": lifecycle_summary,
        }
    )


if __name__ == "__main__":
    main()
