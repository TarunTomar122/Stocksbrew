from __future__ import annotations

import argparse

from backend.ai_capex_email import send_ai_capex_campaign
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Send the AI-capex research email to the eligible audience.")
    parser.add_argument("--send", action="store_true", help="Send the campaign; omit for a dry run.")
    parser.add_argument("--limit", type=int, default=0, help="Limit recipients for a controlled run.")
    args = parser.parse_args()

    result = send_ai_capex_campaign(
        TraceMoneyStore(),
        dry_run=not args.send,
        limit=max(0, args.limit),
    )
    print(result)


if __name__ == "__main__":
    main()
