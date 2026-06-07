"""Send the Week in the Markets newsletter to users and homepage signups.

Runs on Sunday via Cloud Scheduler. Content is built once from the last week of
app data, then emailed to:
  - users collection (logged-in accounts)
  - newsletter_signups (homepage free newsletter)

Usage:
    python -m backend.scripts.send_weekly_newsletters --market US --dry-run
    python -m backend.scripts.send_weekly_newsletters --market US
"""
from __future__ import annotations

import argparse
import hashlib
import re
import time
from datetime import datetime, timezone
from typing import Any

from backend.email_runtime import log_email_send
from backend.lifecycle_emailing import email_week_in_markets, first_name_from_profile, send_email
from backend.storage import TraceMoneyStore
from backend.weekly_newsletter import build_weekly_report

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
LOG_COLLECTION = "tm_weekly_newsletter_email_log"


def _normalize_email(raw: str) -> str:
    return str(raw or "").strip().lower()


def _email_key(email: str) -> str:
    return hashlib.sha1(email.encode("utf-8")).hexdigest()[:16]


def _week_key() -> str:
    now = datetime.now(timezone.utc)
    # ISO week id so one send per calendar week.
    return now.strftime("%G-W%V")


def _opted_in(user: dict[str, Any] | None) -> bool:
    if not user:
        return True
    return user.get("email_digest_enabled") is not False


def _already_sent(store: TraceMoneyStore, *, market: str, week_key: str, email: str) -> bool:
    doc_id = f"{market}__{week_key}__{_email_key(email)}"
    return store.db.collection(LOG_COLLECTION).document(doc_id).get().exists


def _mark_sent(
    store: TraceMoneyStore,
    *,
    market: str,
    week_key: str,
    email: str,
    uid: str | None,
    subject: str,
    source: str,
) -> None:
    doc_id = f"{market}__{week_key}__{_email_key(email)}"
    store.db.collection(LOG_COLLECTION).document(doc_id).set(
        {
            "market": market,
            "week_key": week_key,
            "email": email,
            "uid": uid,
            "source": source,
            "subject": subject,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )


def _collect_recipients(store: TraceMoneyStore) -> dict[str, dict[str, Any]]:
    recipients: dict[str, dict[str, Any]] = {}

    def _upsert(
        email: str,
        *,
        source: str,
        uid: str | None = None,
        display_name: str | None = None,
        user: dict[str, Any] | None = None,
    ) -> None:
        normalized = _normalize_email(email)
        if not normalized or not EMAIL_RE.match(normalized):
            return
        existing = recipients.get(normalized)
        if not existing:
            recipients[normalized] = {
                "email": normalized,
                "uid": uid,
                "display_name": display_name,
                "user": user,
                "sources": {source},
            }
            return
        existing["sources"].add(source)
        if uid and not existing.get("uid"):
            existing["uid"] = uid
        if display_name and not existing.get("display_name"):
            existing["display_name"] = display_name
        if user and not existing.get("user"):
            existing["user"] = user

    for doc in store.db.collection("users").select(
        ["email", "email_lower", "display_name", "email_digest_enabled"]
    ).stream():
        data = doc.to_dict() or {}
        email = str(data.get("email") or data.get("email_lower") or "").strip()
        _upsert(
            email,
            source="users",
            uid=doc.id,
            display_name=str(data.get("display_name") or "").strip() or None,
            user=data,
        )

    for doc in store.db.collection("newsletter_signups").stream():
        data = doc.to_dict() or {}
        email = str(data.get("email") or doc.id or "").strip()
        _upsert(
            email,
            source="newsletter_signups",
            uid=str(data.get("uid") or "") or None,
        )

    for payload in recipients.values():
        payload["sources"] = sorted(payload["sources"])
    return recipients


def run_weekly_newsletters(
    *,
    market: str = "US",
    limit: int = 0,
    dry_run: bool = False,
    force_resend: bool = False,
    sleep_ms: int = 200,
) -> dict[str, Any]:
    market = str(market or "US").upper()
    store = TraceMoneyStore()
    week_key = _week_key()
    report = build_weekly_report(store, market=market)
    recipients = _collect_recipients(store)
    items = sorted(recipients.values(), key=lambda row: row["email"])
    if limit and limit > 0:
        items = items[:limit]

    sent = skipped = failed = 0
    for row in items:
        email = row["email"]
        user = row.get("user") or {}
        if not _opted_in(user if user else None):
            skipped += 1
            continue
        if not force_resend and _already_sent(store, market=market, week_key=week_key, email=email):
            skipped += 1
            continue

        first_name = first_name_from_profile(display_name=row.get("display_name"), email=email)
        subject, html = email_week_in_markets(first_name, report)

        if dry_run:
            sent += 1
            continue

        ok = send_email(email, subject, html)
        if ok:
            sent += 1
            source = ",".join(row.get("sources") or [])
            _mark_sent(
                store,
                market=market,
                week_key=week_key,
                email=email,
                uid=row.get("uid"),
                subject=subject,
                source=source,
            )
            if row.get("uid"):
                log_email_send(
                    store,
                    uid=row["uid"],
                    email=email,
                    email_type="weekly_market_recap",
                    subject=subject,
                    dedupe_key=f"weekly_{week_key}",
                    trigger_type="weekly_newsletter",
                    meta={"market": market, "week_key": week_key},
                )
            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)
        else:
            failed += 1

    summary = {
        "market": market,
        "week_key": week_key,
        "week_label": report.get("week_label"),
        "recipients": len(items),
        "sent": sent,
        "skipped": skipped,
        "failed": failed,
        "dry_run": dry_run,
    }
    print(summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Send Week in the Markets newsletter")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--limit", type=int, default=0, help="Max recipients (0 = all)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-resend", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=200)
    args = parser.parse_args()
    run_weekly_newsletters(
        market=args.market,
        limit=args.limit,
        dry_run=args.dry_run,
        force_resend=args.force_resend,
        sleep_ms=args.sleep_ms,
    )


if __name__ == "__main__":
    main()
