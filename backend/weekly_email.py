from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.email import send_email
from backend.email_runtime import load_recent_send_index, log_email_send
from backend.emails.weekly_brief import build_weekly_brief_for_user
from backend.premarket_email import macro_phase_line, is_pro_subscriber, user_digest_enabled
from backend.storage import TraceMoneyStore
from backend.weekly_intel import iso_week_dedupe_key, upcoming_earnings_on_book
from backend.weekly_tape_llm import load_weekly_stories_for_email

logger = logging.getLogger(__name__)

EMAIL_TYPE = "weekly_brief"
WEEKLY_SNAPSHOT_MAX_AGE_HOURS = 36


def dedupe_key_for_week(week_key: str | None = None) -> str:
    return f"weekly_brief_{week_key or iso_week_dedupe_key()}"


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        parsed = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def has_sendable_weekly_snapshot(weekly: dict[str, Any] | None, *, week_key: str | None = None) -> bool:
    if not weekly:
        return False
    if week_key and str(weekly.get("week_key") or "") != week_key:
        return False
    generated_at = _parse_iso_datetime(weekly.get("generated_at"))
    if generated_at is None:
        return False
    age = datetime.now(timezone.utc) - generated_at
    if age < timedelta(0) or age > timedelta(hours=WEEKLY_SNAPSHOT_MAX_AGE_HOURS):
        return False
    quoted = int(weekly.get("quoted_count") or 0)
    if quoted > 0:
        return True
    up = len(weekly.get("movers_up") or [])
    down = len(weekly.get("movers_down") or [])
    return (up + down) > 0


def _book_tickers(rows: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        out.append(ticker)
    return out


def process_weekly_briefs(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    limit: int = 0,
    dry_run: bool = False,
    force_email: str | None = None,
    force_uid: str | None = None,
    skip_snapshot_gate: bool = False,
    force_llm: bool = False,
) -> dict[str, int]:
    """Send the weekly market report to opted-in Pro subscribers."""
    market = str(market or "US").upper()
    week_key = iso_week_dedupe_key()
    dedupe_key = dedupe_key_for_week(week_key)

    weekly = store.get_weekly_movers(market)
    phase_line = macro_phase_line(store, market)

    if not skip_snapshot_gate and not has_sendable_weekly_snapshot(weekly, week_key=week_key):
        logger.info(
            "No fresh sendable weekly snapshot for %s — skipping batch "
            "(week_key=%s generated_at=%s quoted_count=%s)",
            market,
            (weekly or {}).get("week_key"),
            (weekly or {}).get("generated_at"),
            (weekly or {}).get("quoted_count"),
        )
        return {
            "checked": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "skipped_no_snapshot": 1,
        }

    recent_sends = load_recent_send_index(store, lookback_hours=24 * 10)

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

        earnings = upcoming_earnings_on_book(store, market=market, tickers=_book_tickers(rows))
        weekly_stories = load_weekly_stories_for_email(
            store,
            market=market,
            weekly=weekly,
            book_tickers=set(_book_tickers(rows)),
            force=force_llm,
        )
        subject, html_body = build_weekly_brief_for_user(
            display_name=user.get("display_name"),
            email=force_email,
            weekly=weekly,
            rows=rows,
            market_phase_line=phase_line,
            upcoming_earnings=earnings,
            weekly_stories=weekly_stories,
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
                    trigger_type="weekly_email",
                    meta={"market": market, "preview": True, "week_key": week_key},
                )
        else:
            stats["failed"] += 1
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
        earnings = upcoming_earnings_on_book(store, market=market, tickers=_book_tickers(rows))
        weekly_stories = load_weekly_stories_for_email(
            store,
            market=market,
            weekly=weekly,
            book_tickers=set(_book_tickers(rows)),
            force=force_llm,
        )

        subject, html_body = build_weekly_brief_for_user(
            display_name=user.get("display_name"),
            email=email,
            weekly=weekly,
            rows=rows,
            market_phase_line=phase_line,
            upcoming_earnings=earnings,
            weekly_stories=weekly_stories,
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
                trigger_type="weekly_email",
                meta={"market": market, "week_key": week_key},
            )
        else:
            stats["failed"] += 1

    return stats
