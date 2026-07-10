from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from backend.email import send_email
from backend.email_runtime import load_recent_send_index, log_email_send
from backend.emails.newsletter_brief import build_newsletter_brief_email
from backend.newsletter_intel import (
    build_newsletter_snapshot,
    load_newsletter_subscribers,
    market_today_key,
    previous_trading_date_key,
)
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

EMAIL_TYPE = "newsletter_brief"


def dedupe_key_for_date(date_key: str) -> str:
    return f"newsletter_brief_{date_key}"


def newsletter_uid(email: str) -> str:
    return f"newsletter:{email.strip().lower()}"


def process_newsletter_briefs(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    limit: int = 0,
    dry_run: bool = False,
    force_email: str | None = None,
    as_of_date: str | None = None,
    allow_stale: bool = False,
    skip_dedupe: bool = False,
) -> dict[str, int]:
    """Send the free daily market brief to newsletter signups."""
    market = str(market or "US").upper()
    snapshot = build_newsletter_snapshot(
        store,
        market=market,
        as_of_date=as_of_date,
        allow_stale=allow_stale or bool(force_email),
    )
    if not snapshot:
        logger.info("No daily anomalies snapshot for %s", market)
        return {
            "checked": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "skipped_no_snapshot": 1,
        }
    if snapshot.get("error"):
        logger.info("Newsletter snapshot blocked: %s", snapshot.get("error"))
        return {
            "checked": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "skipped_no_snapshot": 1,
            "error": str(snapshot.get("error")),
            "session_date": str(snapshot.get("session_date") or ""),
        }

    session_date = str(snapshot.get("session_date") or as_of_date or market_today_key(market))
    dedupe_key = dedupe_key_for_date(session_date)
    recent_sends = load_recent_send_index(store, lookback_hours=72)

    stats: dict[str, int] = {
        "checked": 0,
        "sent": 0,
        "skipped": 0,
        "failed": 0,
        "skipped_no_snapshot": 0,
    }

    if force_email:
        email = force_email.strip().lower()
        subject, html_body = build_newsletter_brief_email(email=email, snapshot=snapshot)
        stats["checked"] = 1
        if dry_run:
            print(f"[dry-run] would send to {email}: {subject}")
            stats["sent"] = 1
            return stats

        ok = send_email(email, subject, html_body)
        if ok:
            stats["sent"] = 1
            if not skip_dedupe:
                log_email_send(
                    store,
                    uid=newsletter_uid(email),
                    email=email,
                    email_type=EMAIL_TYPE,
                    subject=subject,
                    dedupe_key=dedupe_key,
                    trigger_type="newsletter_email",
                    meta={"market": market, "session_date": session_date, "preview": True},
                )
        else:
            stats["failed"] = 1
        return stats

    subscribers = load_newsletter_subscribers(store)
    for row in subscribers:
        if limit and stats["checked"] >= limit:
            break

        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue

        stats["checked"] += 1
        uid = newsletter_uid(email)
        if recent_sends.get((uid, dedupe_key)):
            stats["skipped"] += 1
            continue

        subject, html_body = build_newsletter_brief_email(
            email=email,
            snapshot=snapshot,
            display_name=None,
        )

        if dry_run:
            stats["sent"] += 1
            continue

        ok = send_email(email, subject, html_body)
        if ok:
            stats["sent"] += 1
            log_email_send(
                store,
                uid=uid,
                email=email,
                email_type=EMAIL_TYPE,
                subject=subject,
                dedupe_key=dedupe_key,
                trigger_type="newsletter_email",
                meta={"market": market, "session_date": session_date, "source": row.get("source")},
            )
        else:
            stats["failed"] += 1

    return stats
