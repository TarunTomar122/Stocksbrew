"""Send the personalized pre-market brief to all opted-in subscribers.

Runs in the pre-market window, scheduled at least 1-2 hours before the
market-open email. The shared market data (pre-market movers, regime line,
earnings today) is fetched once; the on-your-book block is personalized per
subscriber from their watchlist view.

Usage:
    python -m backend.scripts.send_pre_market_newsletters --market US --dry-run
    python -m backend.scripts.send_pre_market_newsletters --market US
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from backend.email_runtime import log_email_send
from backend.lifecycle_emailing import (
    email_pre_market_brief,
    first_name_from_profile,
    send_email,
)
from backend.storage import TraceMoneyStore
from backend.scripts.send_pre_market_newsletter_preview import (
    _macro_phase_line,
    _reporting_today,
)


def _today_key() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _email_key(email: str) -> str:
    return hashlib.sha1(email.encode("utf-8")).hexdigest()[:16]


def _opted_in(user: dict[str, Any]) -> bool:
    return user.get("email_digest_enabled") is not False


def _already_sent(store: TraceMoneyStore, *, market: str, date_key: str, email: str) -> bool:
    doc_id = f"{market}__{date_key}__{_email_key(email)}"
    return store.db.collection("tm_pre_market_email_log").document(doc_id).get().exists


def _mark_sent(store: TraceMoneyStore, *, market: str, date_key: str, email: str, uid: str, subject: str) -> None:
    doc_id = f"{market}__{date_key}__{_email_key(email)}"
    store.db.collection("tm_pre_market_email_log").document(doc_id).set({
        "market": market,
        "date": date_key,
        "email": email,
        "uid": uid,
        "subject": subject,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def run_pre_market_newsletters(*, market: str = "US", limit: int = 0, dry_run: bool = False) -> dict[str, Any]:
    market = str(market or "US").upper()
    store = TraceMoneyStore()
    today = _today_key()

    premarket = store.get_premarket_movers(market)
    phase_line = _macro_phase_line(store, market)
    reporting = _reporting_today(store, market)

    users = store.db.collection("users").select(
        ["email", "email_lower", "is_subscribed", "email_digest_enabled", "display_name"]
    ).stream()

    total = sent = skipped = failed = 0
    for doc in users:
        if limit and total >= limit:
            break
        uid = doc.id
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip().lower()
        if not email:
            continue
        # Pre-market brief is a Pro perk; only subscribers get it.
        if not bool(user.get("is_subscribed")):
            continue
        total += 1
        if not _opted_in(user):
            skipped += 1
            continue
        if _already_sent(store, market=market, date_key=today, email=email):
            skipped += 1
            continue

        view = store.get_watchlist_view(uid) or {}
        rows = view.get("rows") if isinstance(view, dict) else []
        rows = rows if isinstance(rows, list) else []

        subject, html = email_pre_market_brief(
            first_name_from_profile(display_name=user.get("display_name"), email=email),
            premarket,
            rows,
            market_phase_line=phase_line,
            reporting_today=reporting,
        )

        if dry_run:
            sent += 1
            continue

        ok = send_email(email, subject, html)
        if ok:
            sent += 1
            _mark_sent(store, market=market, date_key=today, email=email, uid=uid, subject=subject)
            log_email_send(
                store, uid=uid, email=email, email_type="subscriber_premarket_brief",
                subject=subject, dedupe_key=f"premarket_{today}",
                trigger_type="premarket_email", meta={"market": market},
            )
        else:
            failed += 1

    result = {
        "market": market, "date": today, "scanned": total,
        "sent": sent, "skipped": skipped, "failed": failed, "dry_run": dry_run,
    }
    print(json.dumps(result))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Send pre-market brief to subscribers")
    parser.add_argument("--market", default="US")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run_pre_market_newsletters(market=args.market, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
