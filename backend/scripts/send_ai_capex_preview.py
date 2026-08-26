from __future__ import annotations

import argparse

from backend.ai_capex_email import PREVIEW_RECIPIENT, send_ai_capex_preview
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Send the owner-only AI-capex email preview.")
    parser.add_argument("--recipient", default=PREVIEW_RECIPIENT)
    parser.add_argument("--send", action="store_true", help="Send the preview; omit for a dry run.")
    args = parser.parse_args()

    result = send_ai_capex_preview(
        TraceMoneyStore(),
        recipient=args.recipient,
        dry_run=not args.send,
    )
    print(result)


if __name__ == "__main__":
    main()
