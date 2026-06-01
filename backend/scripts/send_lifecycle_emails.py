"""Send lifecycle emails for free conversion + pro lifecycle flows.

Usage:
  python -m backend.scripts.send_lifecycle_emails
  python -m backend.scripts.send_lifecycle_emails --skip-pro-daily-digest --skip-pro-directive-change
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.email_runtime import load_recent_send_index, log_email_send, parse_iso  # noqa: E402
from backend.lifecycle_emailing import (  # noqa: E402
    email_checkout_abandoned,
    email_free_alert_teaser,
    email_free_high_intent,
    email_pro_directive_change,
    email_pro_daily_digest,
    email_pro_earnings_setup,
    email_pro_welcome,
    email_track_blocked,
    now_iso,
    send_email,
)
from backend.storage import TraceMoneyStore  # noqa: E402


class RunCache:
    def __init__(self, store: TraceMoneyStore, lookback_hours: int = 720) -> None:
        self.store = store
        self.users: dict[str, dict[str, Any]] = {}
        self.recent_sends = load_recent_send_index(store, lookback_hours=lookback_hours)

    def user(self, uid: str) -> dict[str, Any]:
        if uid not in self.users:
            self.users[uid] = self.store.db.collection("users").document(uid).get().to_dict() or {}
        return self.users[uid]


def _email_opted_in(user: dict[str, Any], pref_key: str) -> bool:
    """Returns True when the user hasn't explicitly opted out (default: opted in)."""
    val = user.get(pref_key)
    return val is not False  # None / missing → True


def _sent_recent(cache: RunCache, uid: str, template: str, hours: int) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    created = cache.recent_sends.get((uid, template))
    return bool(created and created >= cutoff)


def _log_send(cache: RunCache, uid: str, email: str, template: str, meta: dict[str, Any]) -> None:
    created_at = now_iso()
    cache.store.db.collection("tm_lifecycle_email_log").add(
        {"uid": uid, "email": email, "template": template, "meta": meta, "created_at": created_at}
    )
    log_email_send(
        cache.store,
        uid=uid,
        email=email,
        email_type=template,
        dedupe_key=template,
        subject=str(meta.get("subject") or template),
        meta=meta,
    )
    parsed = parse_iso(created_at)
    if parsed:
        cache.recent_sends[(uid, template)] = parsed


def _process_track_blocked(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    events = (
        store.db.collection("tm_lifecycle_events")
        .where("type", "==", "track_blocked_subscription_required")
        .where("processed_at", "==", None)
        .stream()
    )
    for event in events:
        data = event.to_dict() or {}
        uid = str(data.get("uid") or "")
        email = str(data.get("email") or "").strip()
        if not uid or not email:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_uid_or_email"})
            continue
        user = cache.user(uid)
        if bool(user.get("is_subscribed")):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "already_subscribed"})
            continue
        if not _email_opted_in(user, "email_alerts_enabled"):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "opted_out"})
            continue
        if _sent_recent(cache, uid, "free_track_blocked", 72):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "deduped"})
            continue
        payload = data.get("payload") or {}
        instrument_id = str(payload.get("instrument_id") or "")
        ticker = instrument_id.split("_", 1)[-1] if "_" in instrument_id else None
        subject, body = email_track_blocked(ticker)
        ok = True if dry_run else send_email(email, subject, body)
        if not dry_run:
            event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            if not dry_run:
                _log_send(cache, uid, email, "free_track_blocked", {"ticker": ticker, "subject": subject})
            sent += 1
    return sent


def _process_checkout_abandon(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    now = datetime.now(timezone.utc)
    events = (
        store.db.collection("tm_lifecycle_events")
        .where("type", "==", "checkout_started")
        .where("processed_at", "==", None)
        .stream()
    )
    for event in events:
        data = event.to_dict() or {}
        uid = str(data.get("uid") or "")
        email = str(data.get("email") or "").strip()
        created = parse_iso(data.get("created_at"))
        if not uid or not email or not created:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_fields"})
            continue
        age_hours = (now - created).total_seconds() / 3600
        if age_hours < 3:
            continue
        user = cache.user(uid)
        if bool(user.get("is_subscribed")):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "already_subscribed"})
            continue
        if not _email_opted_in(user, "email_alerts_enabled"):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "opted_out"})
            continue
        if _sent_recent(cache, uid, "free_checkout_abandon", 96):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "deduped"})
            continue
        payload = data.get("payload") or {}
        subject, body = email_checkout_abandoned(str(payload.get("plan") or "monthly"))
        ok = True if dry_run else send_email(email, subject, body)
        if not dry_run:
            event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            if not dry_run:
                _log_send(cache, uid, email, "free_checkout_abandon", {"age_hours": age_hours, "subject": subject})
            sent += 1
    return sent


def _process_free_high_intent(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    views = store.db.collection("tm_stock_views").where("created_at", ">=", cutoff.isoformat()).stream()
    per_uid: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for doc in views:
        row = doc.to_dict() or {}
        uid = str(row.get("uid") or "")
        if uid:
            per_uid[uid].append(row)

    for uid, rows in per_uid.items():
        user = cache.user(uid)
        if bool(user.get("is_subscribed")):
            continue
        if not _email_opted_in(user, "email_alerts_enabled"):
            continue
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            continue
        view_count = sum(int(row.get("view_count") or 1) for row in rows)
        tickers = sorted({str(r.get("ticker") or "").strip() for r in rows if r.get("ticker")})
        if view_count < 3 or len(tickers) < 2:
            continue
        if _sent_recent(cache, uid, "free_high_intent_views", 168):
            continue
        subject, body = email_free_high_intent(tickers)
        ok = True if dry_run else send_email(email, subject, body)
        if ok:
            if not dry_run:
                _log_send(
                    cache,
                    uid,
                    email,
                    "free_high_intent_views",
                    {"views": view_count, "tickers": tickers[:5], "subject": subject},
                )
            sent += 1
    return sent


def _process_free_alert_teaser(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=2)
    views = store.db.collection("tm_stock_views").where("created_at", ">=", cutoff.isoformat()).stream()
    per_uid_ticker: dict[tuple[str, str], int] = defaultdict(int)
    for doc in views:
        row = doc.to_dict() or {}
        uid = str(row.get("uid") or "")
        ticker = str(row.get("ticker") or "").strip()
        if uid and ticker:
            per_uid_ticker[(uid, ticker)] += int(row.get("view_count") or 1)

    best: dict[str, tuple[str, int]] = {}
    for (uid, ticker), count in per_uid_ticker.items():
        prev = best.get(uid)
        if prev is None or count > prev[1]:
            best[uid] = (ticker, count)

    for uid, (ticker, count) in best.items():
        if count < 2:
            continue
        user = cache.user(uid)
        if bool(user.get("is_subscribed")):
            continue
        if not _email_opted_in(user, "email_alerts_enabled"):
            continue
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            continue
        if _sent_recent(cache, uid, "free_alert_teaser", 168):
            continue
        subject, body = email_free_alert_teaser(ticker)
        ok = True if dry_run else send_email(email, subject, body)
        if ok:
            if not dry_run:
                _log_send(cache, uid, email, "free_alert_teaser", {"ticker": ticker, "views": count, "subject": subject})
            sent += 1
    return sent


def _process_pro_welcome(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    events = (
        store.db.collection("tm_lifecycle_events")
        .where("type", "==", "subscription_converted")
        .where("processed_at", "==", None)
        .stream()
    )
    for event in events:
        data = event.to_dict() or {}
        uid = str(data.get("uid") or "")
        if not uid:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_uid"})
            continue
        user = cache.user(uid)
        if not bool(user.get("is_subscribed")):
            continue
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_email"})
            continue
        if _sent_recent(cache, uid, "pro_welcome", 720):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "deduped"})
            continue
        subject, body = email_pro_welcome()
        ok = True if dry_run else send_email(email, subject, body)
        if not dry_run:
            event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            if not dry_run:
                _log_send(cache, uid, email, "pro_welcome", {"subject": subject})
            sent += 1
    return sent


def _process_pro_daily_digest(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    users = store.db.collection("users").where("is_subscribed", "==", True).stream()
    for doc in users:
        uid = doc.id
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            continue
        if not _email_opted_in(user, "email_digest_enabled"):
            continue
        if _sent_recent(cache, uid, "pro_daily_digest", 20):
            continue
        view = store.get_watchlist_view(uid) or {}
        rows = view.get("rows") if isinstance(view, dict) else []
        rows = rows if isinstance(rows, list) else []
        if len(rows) == 0:
            continue
        market_rows = store.get_market_price_snapshot("US")
        subject, body = email_pro_daily_digest(rows, market_rows)
        ok = True if dry_run else send_email(email, subject, body)
        if ok:
            if not dry_run:
                _log_send(cache, uid, email, "pro_daily_digest", {"rows": len(rows), "subject": subject})
            sent += 1
    return sent


def _process_pro_directive_changes(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    events = (
        store.db.collection("tm_lifecycle_events")
        .where("type", "==", "directive_change")
        .where("processed_at", "==", None)
        .stream()
    )
    for event in events:
        data = event.to_dict() or {}
        uid = str(data.get("uid") or "")
        if not uid:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_uid"})
            continue
        user = cache.user(uid)
        if not bool(user.get("is_subscribed")):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "not_subscribed"})
            continue
        if not _email_opted_in(user, "email_alerts_enabled"):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "opted_out"})
            continue
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_email"})
            continue

        payload = data.get("payload") or {}
        ticker = str(payload.get("ticker") or "").strip().upper()
        position_type = str(payload.get("position_type") or "watchlist").strip().lower()
        prev_stance = str(payload.get("prev_stance") or "").strip().lower()
        new_stance = str(payload.get("new_stance") or "").strip().lower()
        directive_text = str(payload.get("directive_text") or "").strip()
        if not ticker or not prev_stance or not new_stance:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "missing_payload"})
            continue
        # Keep strict to requested transitions only.
        if position_type == "holding":
            should_send = new_stance == "trim"
        else:
            should_send = new_stance == "accumulate"
        if not should_send:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "not_alertable_transition"})
            continue

        dedupe_key = f"pro_directive_change_{ticker}_{position_type}_{new_stance}"
        if _sent_recent(cache, uid, dedupe_key, 18):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "deduped"})
            continue

        subject, body = email_pro_directive_change(
            ticker=ticker,
            position_type=position_type,
            prev_stance=prev_stance,
            new_stance=new_stance,
            directive_text=directive_text,
        )
        ok = True if dry_run else send_email(email, subject, body)
        if not dry_run:
            event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            if not dry_run:
                _log_send(
                    cache,
                    uid,
                    email,
                    dedupe_key,
                    {
                        "ticker": ticker,
                        "position_type": position_type,
                        "prev_stance": prev_stance,
                        "new_stance": new_stance,
                        "subject": subject,
                    },
                )
            sent += 1
    return sent


def _process_pro_earnings_setup(store: TraceMoneyStore, cache: RunCache, *, dry_run: bool = False) -> int:
    sent = 0
    users = store.db.collection("users").where("is_subscribed", "==", True).stream()
    for doc in users:
        uid = doc.id
        user = doc.to_dict() or {}
        if not _email_opted_in(user, "email_alerts_enabled"):
            continue
        email = str(user.get("email") or user.get("email_lower") or "").strip()
        if not email:
            continue
        tracked = [str(i).strip().upper() for i in (user.get("tracked_stocks") or []) if str(i).strip()]
        if not tracked:
            continue
        refs = [store.db.collection("tm_pre_earnings_intel").document(f"US__{iid}__upcoming") for iid in tracked if iid.startswith("US_")]
        if not refs:
            continue
        docs = [snap.to_dict() or {} for snap in store.db.get_all(refs) if snap.exists]
        docs = [row for row in docs if row.get("event_date") and row.get("ticker")]
        docs.sort(key=lambda row: (int(row.get("days_until") or 99), -int(((row.get("report") or {}).get("confidence") or {}).get("score_0_100") or 0)))
        doc_row = next((row for row in docs if int(row.get("days_until") or 99) <= 3), None)
        if not doc_row:
            continue
        ticker = str(doc_row.get("ticker") or "").strip().upper()
        event_date = str(doc_row.get("event_date") or "").strip()
        dedupe_key = f"pro_earnings_setup_{ticker}_{event_date}"
        if _sent_recent(cache, uid, dedupe_key, 96):
            continue
        position_type = "holding" if str(doc_row.get("instrument_id") or "") in {
            str(key).strip().upper()
            for key, value in ((user.get("watchlist_positions") or {}) or {}).items()
            if value == "holding"
        } else "watchlist"
        subject, body = email_pro_earnings_setup(doc_row, position_type=position_type)
        ok = True if dry_run else send_email(email, subject, body)
        if ok:
            if not dry_run:
                _log_send(
                    cache,
                    uid,
                    email,
                    dedupe_key,
                    {"ticker": ticker, "event_date": event_date, "subject": subject, "position_type": position_type},
                )
            sent += 1
    return sent


def run_lifecycle_emails(
    *,
    include_pro_daily_digest: bool = True,
    include_pro_directive_change: bool = True,
    include_pro_earnings_setup: bool = True,
    dry_run: bool = False,
) -> dict[str, int]:
    store = TraceMoneyStore()
    cache = RunCache(store)
    totals = {
        "free_track_blocked": _process_track_blocked(store, cache, dry_run=dry_run),
        "free_checkout_abandon": _process_checkout_abandon(store, cache, dry_run=dry_run),
        "free_high_intent_views": _process_free_high_intent(store, cache, dry_run=dry_run),
        "free_alert_teaser": _process_free_alert_teaser(store, cache, dry_run=dry_run),
        "pro_welcome": _process_pro_welcome(store, cache, dry_run=dry_run),
    }
    if include_pro_daily_digest:
        totals["pro_daily_digest"] = _process_pro_daily_digest(store, cache, dry_run=dry_run)
    if include_pro_directive_change:
        totals["pro_directive_change"] = _process_pro_directive_changes(store, cache, dry_run=dry_run)
    if include_pro_earnings_setup:
        totals["pro_earnings_setup"] = _process_pro_earnings_setup(store, cache, dry_run=dry_run)
    return totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Send lifecycle and conversion emails")
    parser.add_argument("--skip-pro-daily-digest", action="store_true")
    parser.add_argument("--skip-pro-directive-change", action="store_true")
    parser.add_argument("--skip-pro-earnings-setup", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    totals = run_lifecycle_emails(
        include_pro_daily_digest=not args.skip_pro_daily_digest,
        include_pro_directive_change=not args.skip_pro_directive_change,
        include_pro_earnings_setup=not args.skip_pro_earnings_setup,
        dry_run=bool(args.dry_run),
    )
    print("Lifecycle email run summary:")
    for key, value in totals.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
