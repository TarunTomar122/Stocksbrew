from __future__ import annotations

import logging

from google.cloud.firestore_v1.base_query import FieldFilter

from backend.email import send_email
from backend.email_runtime import log_email_send
from backend.emails.brief_ready import build_brief_ready_email
from backend.price_alerts import mark_alert_triggered, user_alerts_enabled
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

EMAIL_TYPE = "brief_ready"


def notify_brief_ready(
    store: TraceMoneyStore,
    *,
    instrument_id: str,
    ticker: str,
    headline: str | None = None,
    dry_run: bool = False,
) -> int:
    """Email anyone who asked to be notified once this instrument's first AI
    brief finishes. Called right after an on-demand job completes, since that
    is the only moment this instrument transitions from no-brief to has-brief.
    """
    alerts = (
        store.db.collection("tm_alerts")
        .where(filter=FieldFilter("instrument_id", "==", instrument_id))
        .where(filter=FieldFilter("kind", "==", "brief_ready"))
        .where(filter=FieldFilter("active", "==", True))
        .where(filter=FieldFilter("triggered", "==", False))
        .stream()
    )

    sent = 0
    for doc in alerts:
        alert = {"id": doc.id, **(doc.to_dict() or {})}
        alert_id = str(alert.get("id") or "")
        email = str(alert.get("email") or "").strip()
        uid = str(alert.get("uid") or "").strip()
        if not email:
            logger.info("brief_ready alert %s: no email, skipped", alert_id or instrument_id)
            continue
        if uid and not user_alerts_enabled(store, uid):
            logger.info("brief_ready alert %s: user %s opted out of alert emails", alert_id, uid)
            continue

        latest = store.get_latest_prices([instrument_id]).get(instrument_id) or {}
        quote = latest.get("quote") or {}
        market = instrument_id.split("_", 1)[0].upper() if "_" in instrument_id else "US"
        instrument = next(iter(store.list_instruments(market, [instrument_id])), {})
        subject, html_body = build_brief_ready_email(
            ticker=ticker,
            headline=headline,
            company_name=instrument.get("name") or (latest.get("provider_metadata") or {}).get("name"),
            price=quote.get("current"),
            day_change_pct=quote.get("day_change_pct"),
            currency="$" if market == "US" else "₹",
        )

        if dry_run:
            print(f"[dry-run] would send to {email}: {subject}")
            sent += 1
            continue

        if not send_email(email, subject, html_body):
            continue

        log_email_send(
            store,
            uid=uid,
            email=email,
            email_type=EMAIL_TYPE,
            subject=subject,
            dedupe_key=f"brief_ready:{alert_id}" if alert_id else f"brief_ready:{instrument_id}",
            trigger_type="brief_ready",
            trigger_id=alert_id or None,
            meta={"ticker": ticker, "instrument_id": instrument_id},
        )
        if alert_id:
            mark_alert_triggered(store, alert_id)
        sent += 1

    return sent
