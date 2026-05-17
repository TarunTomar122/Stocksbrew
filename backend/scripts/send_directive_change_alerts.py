"""Send pro directive-change alerts from queued lifecycle events.

Only sends:
- holding stance changed -> trim
- watchlist stance changed -> accumulate
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from backend.lifecycle_emailing import email_pro_directive_change, now_iso, send_email
from backend.storage import TraceMoneyStore


def _parse_iso(value: Any) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _email_opted_in(user: dict[str, Any], pref_key: str) -> bool:
    return user.get(pref_key) is not False


def _sent_recent(store: TraceMoneyStore, uid: str, template: str, hours: int) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    docs = (
        store.db.collection("tm_lifecycle_email_log")
        .where("uid", "==", uid)
        .where("template", "==", template)
        .stream()
    )
    for doc in docs:
        created = _parse_iso((doc.to_dict() or {}).get("created_at"))
        if created and created >= cutoff:
            return True
    return False


def _log_send(store: TraceMoneyStore, uid: str, email: str, template: str, meta: dict[str, Any]) -> None:
    store.db.collection("tm_lifecycle_email_log").add(
        {
            "uid": uid,
            "email": email,
            "template": template,
            "meta": meta,
            "created_at": now_iso(),
        }
    )


def main() -> None:
    store = TraceMoneyStore()
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

        user = store.db.collection("users").document(uid).get().to_dict() or {}
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

        if position_type == "holding":
            should_send = new_stance == "trim"
        else:
            should_send = new_stance == "accumulate"
        if not should_send:
            event.reference.update({"processed_at": now_iso(), "skip_reason": "not_alertable_transition"})
            continue

        dedupe_key = f"pro_directive_change_{ticker}_{position_type}_{new_stance}"
        if _sent_recent(store, uid, dedupe_key, 18):
            event.reference.update({"processed_at": now_iso(), "skip_reason": "deduped"})
            continue

        subject, body = email_pro_directive_change(
            ticker=ticker,
            position_type=position_type,
            prev_stance=prev_stance,
            new_stance=new_stance,
            directive_text=directive_text,
        )
        ok = send_email(email, subject, body)
        event.reference.update({"processed_at": now_iso(), "email_sent": bool(ok)})
        if ok:
            _log_send(
                store,
                uid,
                email,
                dedupe_key,
                {
                    "ticker": ticker,
                    "position_type": position_type,
                    "prev_stance": prev_stance,
                    "new_stance": new_stance,
                },
            )
            sent += 1

    print({"directive_change_sent": sent})


if __name__ == "__main__":
    main()
