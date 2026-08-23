"""Send the Pro welcome email to everyone who subscribed today (or a given date).

Usage:
  python3 -m backend.scripts.send_welcome_pro_batch --dry-run
  python3 -m backend.scripts.send_welcome_pro_batch --date 2026-08-23
  python3 -m backend.scripts.send_welcome_pro_batch   # actually sends, for today
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.email import send_email  # noqa: E402
from backend.env import load_backend_env  # noqa: E402
from backend.emails.welcome_pro import build_welcome_pro_email  # noqa: E402
from backend.storage import TraceMoneyStore  # noqa: E402


def _subscribed_today(subscribed_at: str | None, day: str) -> bool:
    if not subscribed_at:
        return False
    try:
        return subscribed_at[:10] == day
    except Exception:
        return False


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send the Pro welcome email to today's new subscribers.")
    parser.add_argument("--date", default="", help="Session date (YYYY-MM-DD); defaults to today (UTC)")
    parser.add_argument("--dry-run", action="store_true", help="List recipients without sending")
    args = parser.parse_args()

    day = args.date.strip() or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    store = TraceMoneyStore()
    snap = store.db.collection("users").where("is_subscribed", "==", True).stream()

    targets: list[dict] = []
    for doc in snap:
        u = doc.to_dict() or {}
        subscribed_at = u.get("subscribedAt")
        if not _subscribed_today(subscribed_at, day):
            continue
        email = (u.get("email") or "").strip()
        if not email:
            continue
        targets.append({
            "uid": doc.id,
            "email": email,
            "display_name": u.get("display_name"),
            "subscribedAt": subscribed_at,
        })

    print(json.dumps({"date": day, "found": len(targets), "targets": targets}, indent=2))

    if args.dry_run:
        return

    sent, failed = 0, 0
    for t in targets:
        subject, html_doc = build_welcome_pro_email(email=t["email"], display_name=t.get("display_name"))
        ok = send_email(t["email"], subject, html_doc)
        if ok:
            sent += 1
        else:
            failed += 1
        print(json.dumps({"email": t["email"], "sent": ok}))

    print(json.dumps({"date": day, "sent": sent, "failed": failed}, indent=2))


if __name__ == "__main__":
    main()
