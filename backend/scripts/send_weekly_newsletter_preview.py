"""Send one Week in the Markets preview to a single address.

Usage:
    python -m backend.scripts.send_weekly_newsletter_preview --to you@example.com --market US
    python -m backend.scripts.send_weekly_newsletter_preview --to you@example.com --dry-run
"""
from __future__ import annotations

import argparse
import json

from backend.lifecycle_emailing import email_week_in_markets, first_name_from_profile, send_email
from backend.storage import TraceMoneyStore
from backend.weekly_newsletter import build_weekly_report


def _find_user_by_email(store: TraceMoneyStore, email: str) -> tuple[str | None, dict]:
    value = email.strip().lower()
    if not value:
        return None, {}
    query = store.db.collection("users").where("email_lower", "==", value).limit(1).stream()
    for doc in query:
        return doc.id, (doc.to_dict() or {})
    query = store.db.collection("users").where("email", "==", value).limit(1).stream()
    for doc in query:
        return doc.id, (doc.to_dict() or {})
    return None, {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Send one weekly newsletter preview")
    parser.add_argument("--to", required=True, help="Recipient email")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--first-name", default="", help="Override greeting name")
    parser.add_argument("--dry-run", action="store_true", help="Build report only; do not send")
    parser.add_argument("--dump-report", action="store_true", help="Print report JSON")
    args = parser.parse_args()

    store = TraceMoneyStore()
    report = build_weekly_report(store, market=args.market)
    if args.dump_report:
        print(json.dumps(report, indent=2, default=str))

    email = args.to.strip().lower()
    _, user = _find_user_by_email(store, email)
    first_name = args.first_name.strip() or first_name_from_profile(
        display_name=user.get("display_name"),
        email=email,
    )
    subject, html = email_week_in_markets(first_name, report)

    if args.dry_run:
        print({"to": email, "subject": subject, "week_label": report.get("week_label")})
        return

    ok = send_email(email, subject, html)
    print({"to": email, "subject": subject, "sent": ok})


if __name__ == "__main__":
    main()
