"""Send one weekly report preview to a single inbox."""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.env import load_backend_env  # noqa: E402
from backend.storage import TraceMoneyStore  # noqa: E402
from backend.weekly_email import process_weekly_briefs  # noqa: E402

DEFAULT_UID = "bHeaWG9bjMbnFoiOPxhA5cJiBw92"
DEFAULT_EMAIL = "tomartarun2001@gmail.com"


def _find_uid_by_email(store: TraceMoneyStore, email: str) -> str | None:
    value = email.strip().lower()
    if not value:
        return None
    for doc in store.db.collection("users").where("email_lower", "==", value).limit(1).stream():
        return doc.id
    return None


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send a weekly report preview email.")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--uid", default="", help="Optional uid override for watchlist enrichment")
    parser.add_argument("--market", default="US")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-llm", action="store_true", help="Bypass cached weekly story cards")
    args = parser.parse_args()

    store = TraceMoneyStore()
    email = args.email.strip()
    uid = args.uid.strip() or _find_uid_by_email(store, email) or DEFAULT_UID

    stats = process_weekly_briefs(
        store,
        market=args.market,
        dry_run=args.dry_run,
        force_email=email,
        force_uid=uid,
        skip_snapshot_gate=True,
        force_llm=args.force_llm,
    )
    print(json.dumps({"to": email, "uid": uid, **stats}, indent=2))
    if not args.dry_run and stats.get("failed"):
        sys.exit(1)


if __name__ == "__main__":
    main()
