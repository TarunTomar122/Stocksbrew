#!/usr/bin/env python3
"""Send backlog-cleared email to a requester (preview or live)."""
from __future__ import annotations

import argparse

from backend.lifecycle_emailing import email_stock_request_backlog_cleared, first_name_from_profile, send_email
from backend.storage import TraceMoneyStore


def _requester_emails(data: dict) -> set[str]:
    emails = {str(e).strip().lower() for e in (data.get("requester_emails") or []) if str(e).strip()}
    legacy = str(data.get("requester_email") or "").strip().lower()
    if legacy:
        emails.add(legacy)
    return emails


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--requester-email", default="dukeokafor18@gmail.com")
    parser.add_argument("--to", required=True, help="Recipient (use for preview before customer send)")
    parser.add_argument("--send", action="store_true", help="Actually send via Brevo")
    args = parser.parse_args()

    requester = args.requester_email.strip().lower()
    store = TraceMoneyStore()

    fulfilled: list[str] = []
    pending: list[str] = []
    display_name = ""

    for doc in store.db.collection("stock_requests").stream():
        data = doc.to_dict() or {}
        if requester not in _requester_emails(data):
            continue
        ticker = str(data.get("resolved_symbol") or doc.id).upper()
        if bool(data.get("fulfilled")):
            fulfilled.append(ticker)
        else:
            pending.append(str(doc.id).upper())
        if not display_name and data.get("requester_email", "").lower() == requester:
            pass

    # Try user profile for first name
    users = store.db.collection("users").where("email_lower", "==", requester).limit(1).stream()
    for user_doc in users:
        u = user_doc.to_dict() or {}
        display_name = str(u.get("display_name") or u.get("name") or "")

    first = first_name_from_profile(display_name=display_name, email=requester)
    fulfilled = sorted(set(fulfilled))
    pending = sorted(set(pending))

    subject, html = email_stock_request_backlog_cleared(
        first_name=first,
        fulfilled_count=len(fulfilled),
        sample_tickers=fulfilled,
    )

    to = args.to.strip().lower()
    if to != requester:
        preview_note = (
            f"<p style='margin:0 0 14px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;"
            f"border-radius:8px;font-size:12px;color:#92400e'>"
            f"<strong>Preview for ops</strong> — requester: {requester}; "
            f"fulfilled={len(fulfilled)} pending={len(pending)}; "
            f"intended recipient when approved: {requester}</p>"
        )
        html = html.replace(
            "<table width=\"560\"",
            preview_note + "<table width=\"560\"",
            1,
        )

    print(f"subject: {subject}")
    print(f"fulfilled: {len(fulfilled)} pending: {len(pending)}")

    if not args.send:
        print("Dry run — pass --send to deliver via Brevo")
        return

    ok = send_email(to, subject, html)
    print("sent" if ok else "send_failed")


if __name__ == "__main__":
    main()
