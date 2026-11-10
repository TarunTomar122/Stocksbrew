from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from backend.email import send_email
from backend.email_runtime import load_recent_send_index, log_email_send
from backend.emails.open_brief import build_open_brief_for_user
from backend.open_email_intel import has_fresh_open_snapshot, load_daily_anomalies
from backend.premarket_email import macro_phase_line, user_digest_enabled, is_pro_subscriber
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

EMAIL_TYPE = "open_brief"


def today_key() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def dedupe_key_for_date(date_key: str) -> str:
    return f"open_brief_{date_key}"


def has_sendable_open_snapshot(
    anomalies_doc: dict[str, Any] | None,
    *,
    market: str = "US",
) -> bool:
    return has_fresh_open_snapshot(anomalies_doc, market=market)


def process_open_briefs(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    limit: int = 0,
    dry_run: bool = False,
    force_email: str | None = None,
    force_uid: str | None = None,
    skip_snapshot_gate: bool = False,
) -> dict[str, int]:
    """Send the after-open brief to opted-in Pro subscribers."""
    market = str(market or "US").upper()
    date_key = today_key()
    dedupe_key = dedupe_key_for_date(date_key)

    anomalies_doc = load_daily_anomalies(store, market)
    phase_line = macro_phase_line(store, market)

    if not skip_snapshot_gate and not has_sendable_open_snapshot(anomalies_doc, market=market):
        logger.info("No fresh open anomaly snapshot for %s — skipping batch", market)
        return {
            "checked": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "skipped_no_snapshot": 1,
        }

    recent_sends = load_recent_send_index(store, lookback_hours=36)

    stats = {
        "checked": 0,
        "sent": 0,
        "skipped": 0,
        "failed": 0,
        "skipped_no_snapshot": 0,
    }

    if force_email:
        uid = force_uid or ""
        user: dict[str, Any] = {}
        if uid:
            doc = store.db.collection("users").document(uid).get()
            if doc.exists:
                user = doc.to_dict() or {}
        rows: list[dict[str, Any]] = []
        if uid:
            view = store.get_watchlist_view(uid) or {}
            rows = list(view.get("rows") or [])

        subject, html_body = build_open_brief_for_user(
            display_name=user.get("display_name"),
            email=force_email,
            anomalies_doc=anomalies_doc,
            rows=rows,
            market_phase_line=phase_line,
        )
        stats["checked"] = 1
        if dry_run:
            print(f"[dry-run] would send to {force_email}: {subject}")
            stats["sent"] = 1
            return stats

        ok = send_email(force_email, subject, html_body)
        if ok:
            stats["sent"] = 1
            if uid:
                log_email_send(
                    store,
                    uid=uid,
                    email=force_email,
                    email_type=EMAIL_TYPE,
                    subject=subject,
                    dedupe_key=f"{dedupe_key}:preview",
                    trigger_type="open_email",
                    meta={"market": market, "preview": True},
                )
        else:
            stats["failed"] = 1
        return stats

    users = store.db.collection("users").select(
        ["email", "email_lower", "is_subscribed", "subscriptionStatus", "proGifted", "proGiftExpiresAt", "email_digest_enabled", "display_name"]
    ).stream()

    for doc in users:
        if limit and stats["checked"] >= limit:
            break

        uid = doc.id
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip().lower()
        if not email:
            continue
        if not is_pro_subscriber(user):
            continue

        stats["checked"] += 1

        if not user_digest_enabled(user):
            stats["skipped"] += 1
            continue

        if recent_sends.get((uid, dedupe_key)):
            stats["skipped"] += 1
            continue

        view = store.get_watchlist_view(uid) or {}
        rows = list(view.get("rows") or [])

        subject, html_body = build_open_brief_for_user(
            display_name=user.get("display_name"),
            email=email,
            anomalies_doc=anomalies_doc,
            rows=rows,
            market_phase_line=phase_line,
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
                trigger_type="open_email",
                meta={"market": market},
            )
        else:
            stats["failed"] += 1

    return stats
