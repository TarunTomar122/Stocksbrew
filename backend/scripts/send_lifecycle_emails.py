"""Send lifecycle emails for free conversion + pro wow flows.

Usage:
  python -m backend.scripts.send_lifecycle_emails
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.lifecycle_emailing import (  # noqa: E402
    email_checkout_abandoned,
    email_free_alert_teaser,
    email_free_high_intent,
    email_pro_daily_digest,
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
        self.recent_sends: dict[tuple[str, str], datetime] = {}
        cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
        logs = store.db.collection("tm_lifecycle_email_log").where("created_at", ">=", cutoff.isoformat()).stream()
        for doc in logs:
            row = doc.to_dict() or {}
            uid = str(row.get("uid") or "")
            template = str(row.get("template") or "")
            created = _parse_iso(row.get("created_at"))
            if not uid or not template or not created:
                continue
            key = (uid, template)
            if created > self.recent_sends.get(key, datetime.min.replace(tzinfo=timezone.utc)):
                self.recent_sends[key] = created

    def user(self, uid: str) -> dict[str, Any]:
        if uid not in self.users:
            self.users[uid] = self.store.db.collection("users").document(uid).get().to_dict() or {}
        return self.users[uid]


def _parse_iso(value: Any) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


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
        {
            "uid": uid,
            "email": email,
            "template": template,
            "meta": meta,
            "created_at": created_at,
        }
    )
    parsed = _parse_iso(created_at)
    if parsed:
        cache.recent_sends[(uid, template)] = parsed


def _process_track_blocked(store: TraceMoneyStore, cache: RunCache) -> int:
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
        ok = send_email(email, subject, body)
        event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            _log_send(cache, uid, email, "free_track_blocked", {"ticker": ticker})
            sent += 1
    return sent


def _process_checkout_abandon(store: TraceMoneyStore, cache: RunCache) -> int:
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
        created = _parse_iso(data.get("created_at"))
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
        ok = send_email(email, subject, body)
        event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            _log_send(cache, uid, email, "free_checkout_abandon", {"age_hours": age_hours})
            sent += 1
    return sent


def _process_free_high_intent(store: TraceMoneyStore, cache: RunCache) -> int:
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
        ok = send_email(email, subject, body)
        if ok:
            _log_send(cache, uid, email, "free_high_intent_views", {"views": view_count, "tickers": tickers[:5]})
            sent += 1
    return sent


def _process_free_alert_teaser(store: TraceMoneyStore, cache: RunCache) -> int:
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
        ok = send_email(email, subject, body)
        if ok:
            _log_send(cache, uid, email, "free_alert_teaser", {"ticker": ticker, "views": count})
            sent += 1
    return sent


def _process_pro_welcome(store: TraceMoneyStore, cache: RunCache) -> int:
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
        ok = send_email(email, subject, body)
        event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            _log_send(cache, uid, email, "pro_welcome", {})
            sent += 1
    return sent


def _process_pro_daily_digest(store: TraceMoneyStore, cache: RunCache) -> int:
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
        ok = send_email(email, subject, body)
        if ok:
            _log_send(cache, uid, email, "pro_daily_digest", {"rows": len(rows)})
            sent += 1
    return sent


def main() -> None:
    store = TraceMoneyStore()
    cache = RunCache(store)
    totals = {
        "free_track_blocked": _process_track_blocked(store, cache),
        "free_checkout_abandon": _process_checkout_abandon(store, cache),
        "free_high_intent_views": _process_free_high_intent(store, cache),
        "free_alert_teaser": _process_free_alert_teaser(store, cache),
        "pro_welcome": _process_pro_welcome(store, cache),
        "pro_daily_digest": _process_pro_daily_digest(store, cache),
    }
    print("Lifecycle email run summary:")
    for key, value in totals.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
