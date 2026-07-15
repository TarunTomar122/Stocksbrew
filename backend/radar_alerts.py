from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from backend.email import send_email
from backend.email_runtime import log_email_send
from backend.emails.radar_alert import build_radar_alert_email
from backend.storage import TraceMoneyStore

AUTOMATIC_EVENT_TYPES = ("directive_change", "earnings_24h")


def _event_is_fresh(event_type: str, event: dict[str, Any], payload: dict[str, Any]) -> bool:
    if event_type == "earnings_24h":
        try:
            event_date = date.fromisoformat(str(payload.get("event_date") or "")[:10])
        except ValueError:
            return False
        days = (event_date - datetime.now(timezone.utc).date()).days
        return 0 <= days <= 1

    raw = str(event.get("created_at") or "").strip().replace("Z", "+00:00")
    try:
        created_at = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at >= datetime.now(timezone.utc) - timedelta(hours=24)


def process_automatic_radar_alerts(
    store: TraceMoneyStore,
    *,
    dry_run: bool = False,
    limit_per_type: int = 100,
) -> dict[str, int]:
    stats = {"checked": 0, "sent": 0, "skipped": 0, "failed": 0}

    for event_type in AUTOMATIC_EVENT_TYPES:
        docs = (
            store.db.collection("tm_lifecycle_events")
            .where(filter=FieldFilter("type", "==", event_type))
            .limit(max(1, limit_per_type))
            .stream()
        )
        for doc in docs:
            event = doc.to_dict() or {}
            if event.get("processed_at"):
                continue
            stats["checked"] += 1
            uid = str(event.get("uid") or "").strip()
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            user_doc = store.db.collection("users").document(uid).get() if uid else None
            user = user_doc.to_dict() if user_doc and user_doc.exists else {}
            user = user or {}
            email = str(user.get("email") or user.get("email_lower") or "").strip().lower()

            eligible = uid and email and bool(user.get("is_subscribed")) and user.get("email_alerts_enabled") is not False
            fresh = _event_is_fresh(event_type, event, payload)
            if not eligible or not fresh:
                stats["skipped"] += 1
                if not dry_run:
                    doc.reference.update(
                        {
                            "processed_at": datetime.now(timezone.utc).isoformat(),
                            "processing_result": "not_eligible" if not eligible else "expired",
                        }
                    )
                continue

            subject, body = build_radar_alert_email(event_type, payload)
            if dry_run:
                print(f"[dry-run] would send to {email}: {subject}")
                stats["sent"] += 1
                continue

            if not send_email(email, subject, body):
                stats["failed"] += 1
                continue

            sent_at = datetime.now(timezone.utc).isoformat()
            log_email_send(
                store,
                uid=uid,
                email=email,
                email_type="radar_alert",
                subject=subject,
                dedupe_key=f"radar_alert:{doc.id}",
                trigger_type=event_type,
                trigger_id=doc.id,
                meta={"ticker": payload.get("ticker"), "instrument_id": payload.get("instrument_id")},
            )
            doc.reference.update({"processed_at": sent_at, "processing_result": "sent"})
            stats["sent"] += 1

    return stats
