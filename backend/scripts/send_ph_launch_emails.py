"""Send Product Hunt launch email to all Firebase contacts via Brevo.

Collects unique emails from:
  - users (email + display_name)
  - newsletter_signups
  - tm_waitlist

Usage:
  # Preview who would receive it
  python -m backend.scripts.send_ph_launch_emails --dry-run

  # Send one test to yourself
  python -m backend.scripts.send_ph_launch_emails --to you@example.com --send

  # Blast everyone (skips already-sent unless --force-resend)
  python -m backend.scripts.send_ph_launch_emails --send
"""
from __future__ import annotations

import argparse
import hashlib
import re
import time
from datetime import datetime, timezone
from typing import Any

from backend.lifecycle_emailing import email_ph_personal_launch, first_name_from_profile, send_email
from backend.storage import TraceMoneyStore

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
LOG_COLLECTION = "tm_ph_launch_email_log"
CAMPAIGN_KEY = "ph_launch_2026"


def _normalize_email(raw: str) -> str:
    return str(raw or "").strip().lower()


def _email_key(email: str) -> str:
    return hashlib.sha1(email.encode("utf-8")).hexdigest()[:16]


def _already_sent(store: TraceMoneyStore, email: str) -> bool:
    doc_id = f"{CAMPAIGN_KEY}__{_email_key(email)}"
    doc = store.db.collection(LOG_COLLECTION).document(doc_id).get()
    if not doc.exists:
        return False
    payload = doc.to_dict() or {}
    return bool(payload.get("sent") is True)


def _mark_sent(
    store: TraceMoneyStore,
    *,
    email: str,
    uid: str | None,
    first_name: str,
    source: str,
    sent: bool,
    subject: str,
) -> None:
    doc_id = f"{CAMPAIGN_KEY}__{_email_key(email)}"
    store.db.collection(LOG_COLLECTION).document(doc_id).set(
        {
            "campaign": CAMPAIGN_KEY,
            "email": email,
            "uid": uid,
            "first_name": first_name,
            "source": source,
            "subject": subject,
            "sent": bool(sent),
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )


def _collect_recipients(store: TraceMoneyStore) -> dict[str, dict[str, Any]]:
    recipients: dict[str, dict[str, Any]] = {}

    def _upsert(email: str, *, source: str, uid: str | None = None, display_name: str | None = None) -> None:
        normalized = _normalize_email(email)
        if not normalized or not EMAIL_RE.match(normalized):
            return
        existing = recipients.get(normalized)
        if not existing:
            recipients[normalized] = {
                "email": normalized,
                "uid": uid,
                "display_name": display_name,
                "sources": {source},
            }
            return
        existing["sources"].add(source)
        if uid and not existing.get("uid"):
            existing["uid"] = uid
        if display_name and not existing.get("display_name"):
            existing["display_name"] = display_name

    for doc in store.db.collection("users").select(["email", "email_lower", "display_name"]).stream():
        data = doc.to_dict() or {}
        email = str(data.get("email") or data.get("email_lower") or "").strip()
        _upsert(
            email,
            source="users",
            uid=doc.id,
            display_name=str(data.get("display_name") or "").strip() or None,
        )

    for doc in store.db.collection("newsletter_signups").stream():
        data = doc.to_dict() or {}
        email = str(data.get("email") or doc.id or "").strip()
        _upsert(email, source="newsletter_signups", uid=str(data.get("uid") or "") or None)

    for doc in store.db.collection("tm_waitlist").stream():
        data = doc.to_dict() or {}
        email = str(data.get("email") or data.get("email_lower") or doc.id or "").strip()
        _upsert(email, source="tm_waitlist")

    for payload in recipients.values():
        payload["sources"] = sorted(payload["sources"])
    return recipients


def main() -> None:
    parser = argparse.ArgumentParser(description="Send Product Hunt launch email via Brevo")
    parser.add_argument("--to", default="", help="Send only to this email (for testing)")
    parser.add_argument("--send", action="store_true", help="Actually send via Brevo (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Preview recipients without sending")
    parser.add_argument("--limit", type=int, default=0, help="Max recipients to process (0 = no limit)")
    parser.add_argument("--force-resend", action="store_true", help="Send even if already logged as sent")
    parser.add_argument("--ph-url", default="", help="Override Product Hunt URL in the email")
    parser.add_argument("--first-name", default="", help="Override first name (useful with --to for testing)")
    parser.add_argument("--sleep-ms", type=int, default=200, help="Delay between sends")
    args = parser.parse_args()

    dry_run = args.dry_run or not args.send
    target_override = _normalize_email(args.to) if args.to else ""
    store: TraceMoneyStore | None = None

    if target_override:
        recipients = {
            target_override: {
                "email": target_override,
                "uid": None,
                "display_name": args.first_name.strip() or None,
                "sources": ["manual"],
            }
        }
    else:
        store = TraceMoneyStore()
        recipients = _collect_recipients(store)

    items = sorted(recipients.values(), key=lambda row: row["email"])
    if args.limit and args.limit > 0:
        items = items[: args.limit]

    sent = 0
    skipped = 0
    failed = 0

    print(f"Campaign: {CAMPAIGN_KEY}")
    print(f"Mode: {'DRY RUN' if dry_run else 'SEND'}")
    print(f"Recipients queued: {len(items)}")

    for row in items:
        email = row["email"]
        first_name = first_name_from_profile(display_name=row.get("display_name"), email=email)
        source = ",".join(row.get("sources") or [])
        subject, html = email_ph_personal_launch(
            first_name=first_name,
            product_hunt_url=args.ph_url or None,
        )

        if store and not args.force_resend and _already_sent(store, email):
            skipped += 1
            print(f"[skip] already sent {email} ({first_name})")
            continue

        if dry_run:
            print(f"[dry-run] {email} -> Hey {first_name}, ({source})")
            continue

        ok = send_email(email, subject, html)
        if store:
            _mark_sent(
                store,
                email=email,
                uid=row.get("uid"),
                first_name=first_name,
                source=source,
                sent=ok,
                subject=subject,
            )
        if ok:
            sent += 1
            print(f"[sent] {email} ({first_name})")
            if args.sleep_ms > 0:
                time.sleep(args.sleep_ms / 1000.0)
        else:
            failed += 1
            print(f"[fail] {email} ({first_name})")

    print(
        f"Done. sent={sent} skipped={skipped} failed={failed} "
        f"dry_run={dry_run} total_scanned={len(items)}"
    )


if __name__ == "__main__":
    main()
