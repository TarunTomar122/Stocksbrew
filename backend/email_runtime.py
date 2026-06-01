from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from backend.storage import TraceMoneyStore


EMAIL_SENDS_COLLECTION = "tm_email_sends"


def parse_iso(value: Any) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def load_recent_send_index(
    store: TraceMoneyStore,
    *,
    lookback_hours: int = 720,
) -> dict[tuple[str, str], datetime]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    recent: dict[tuple[str, str], datetime] = {}

    for doc in store.db.collection(EMAIL_SENDS_COLLECTION).where("sent_at", ">=", cutoff.isoformat()).stream():
        row = doc.to_dict() or {}
        uid = str(row.get("uid") or "")
        key = str(row.get("dedupe_key") or row.get("email_type") or "")
        sent_at = parse_iso(row.get("sent_at"))
        if not uid or not key or not sent_at:
            continue
        prev = recent.get((uid, key))
        if prev is None or sent_at > prev:
            recent[(uid, key)] = sent_at

    for doc in store.db.collection("tm_lifecycle_email_log").where("created_at", ">=", cutoff.isoformat()).stream():
        row = doc.to_dict() or {}
        uid = str(row.get("uid") or "")
        key = str(row.get("dedupe_key") or row.get("template") or "")
        created_at = parse_iso(row.get("created_at") or row.get("sent_at"))
        if not uid or not key or not created_at:
            continue
        prev = recent.get((uid, key))
        if prev is None or created_at > prev:
            recent[(uid, key)] = created_at

    return recent


def log_email_send(
    store: TraceMoneyStore,
    *,
    uid: str,
    email: str,
    email_type: str,
    subject: str,
    dedupe_key: str | None = None,
    status: str = "sent",
    trigger_type: str | None = None,
    trigger_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    payload = {
        "uid": uid,
        "email": email,
        "email_type": email_type,
        "dedupe_key": dedupe_key or email_type,
        "subject": subject,
        "status": status,
        "trigger_type": trigger_type or None,
        "trigger_id": trigger_id or None,
        "meta": meta or {},
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    store.db.collection(EMAIL_SENDS_COLLECTION).add(payload)
