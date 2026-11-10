"""Sending: preferences, caps, dedupe, unsubscribe links, transport.

Every new email goes through `deliver()`. A job builds the email, then asks
`deliver()` to send it; `deliver()` decides whether the person still wants
that category, whether it was already sent, and whether a cap is hit. In a
dry run it decides the same way and sends nothing.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

from backend.mail import kit
from backend.mail.data import ET

SENDS = "tm_email_sends"

# category -> users/{uid} field; False means the person turned it off.
# daily keeps the existing email_digest_enabled field so old opt-outs carry over.
PREF_FIELD = {
    "daily": "email_digest_enabled",
    "weekly": "email_weekly_enabled",
    "alerts": "email_alerts_enabled",
    "product": "email_product_enabled",
}

# emails a person must get even with product email off (they asked for the account or paid)
ALWAYS = {"welcome", "pro_welcome"}

DAILY_CAP = {"alerts": 4, "product": 1}


def wants(user: dict[str, Any], category: str, kind: str = "") -> bool:
    # email_unsubscribed_all / unsubscribed are global stops; nothing writes them
    # today, but an operator can set either by hand to silence an address.
    if user.get("email_unsubscribed_all") is True or user.get("unsubscribed") is True:
        return False
    if kind in ALWAYS:
        return True
    value = user.get(PREF_FIELD.get(category, ""))
    if category == "weekly" and value is None:
        # The old weekly email obeyed email_digest_enabled, so someone who turned
        # the digest off before the weekly had its own switch stays off.
        value = user.get(PREF_FIELD["daily"])
    return value is not False


# ---------------------------------------------------------------- unsubscribe

def _secret() -> bytes:
    return os.environ.get("EMAIL_UNSUBSCRIBE_SECRET", "").encode()


def unsubscribe_token(uid: str, category: str) -> str:
    """HMAC over uid and category; the web route checks the same thing."""
    if not _secret():
        return ""
    mac = hmac.new(_secret(), f"{uid}:{category}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac[:18]).decode().rstrip("=")


def unsubscribe_link(uid: str, category: str, *, api: bool = False) -> str:
    token = unsubscribe_token(uid, category)
    if not token:
        return kit.settings_url()
    query = urlencode({"u": uid, "c": category, "t": token})
    return f"{kit.APP_URL}{'/api/email/unsubscribe' if api else '/email/unsubscribe'}?{query}"


# ------------------------------------------------------------------- history

@dataclass
class History:
    """Recent sends for one person, read once per run."""

    keys: set[str]
    by_category_today: dict[str, int]  # counted per ET calendar day
    last_by_kind: dict[str, datetime]
    # end of the window the last alert email covered (meta.until), so the next
    # bundle starts exactly where it stopped; falls back to its sent_at
    alerts_until: datetime | None = None

    @classmethod
    def load(cls, src, uid: str, *, now: datetime, days: int = 70) -> "History":
        # 70 days covers every one-off key: winback can fire up to 39 days
        # after the first one for the same absence would have.
        since = (now - timedelta(days=days)).isoformat()
        rows = src.query(SENDS, [("uid", "==", uid), ("sent_at", ">=", since)], limit=2000,
                         select=["dedupe_key", "email_type", "sent_at", "meta"])
        keys: set[str] = set()
        per_cat: dict[str, int] = {}
        last: dict[str, datetime] = {}
        alerts_until: datetime | None = None
        day = now.astimezone(ET).date()
        for _, r in rows:
            key = str(r.get("dedupe_key") or "")
            if key:
                keys.add(key)
            kind = str(r.get("email_type") or "")
            at = _ts(r.get("sent_at"))
            if at and (kind not in last or at > last[kind]):
                last[kind] = at
            meta = r.get("meta") if isinstance(r.get("meta"), dict) else {}
            cat = str(meta.get("category") or "")
            if cat and at and at.astimezone(ET).date() == day:
                per_cat[cat] = per_cat.get(cat, 0) + 1
            if kind == "alerts":
                until = _ts(meta.get("until")) or at
                if until and (alerts_until is None or until > alerts_until):
                    alerts_until = until
        return cls(keys, per_cat, last, alerts_until)


def _ts(value: Any) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ transport

def _post_brevo(to: str, email: kit.Email, headers: dict[str, str]) -> bool:
    from backend.email import FROM_EMAIL, FROM_NAME, emails_enabled

    if not emails_enabled():
        print(f"[mail] EMAILS_ENABLED is off, skipped: {email.subject[:80]}")
        return False
    api_key = os.environ.get("BREVO_API_KEY")
    if not api_key:
        print("[mail] BREVO_API_KEY not set")
        return False
    import requests

    reply_to = os.environ.get("STOCKSBREW_REPLY_TO", "").strip()
    payload: dict[str, Any] = {
        "sender": {"email": FROM_EMAIL, "name": FROM_NAME},
        "to": [{"email": to}],
        "subject": email.subject,
        "htmlContent": email.html,
        "textContent": email.text,
        "tags": [email.kind],
    }
    if headers:
        payload["headers"] = headers
    if reply_to:
        payload["replyTo"] = {"email": reply_to}
    try:
        resp = requests.post("https://api.brevo.com/v3/smtp/email",
                             headers={"api-key": api_key, "Content-Type": "application/json"},
                             json=payload, timeout=15)
    except Exception as exc:  # network trouble is a failed send, not a crash of the batch
        print(f"[mail] send error: {exc}")
        return False
    if resp.status_code in (200, 201, 202):
        return True
    print(f"[mail] brevo {resp.status_code}: {resp.text[:200]}")
    return False


class LogFailed(RuntimeError):
    """A send succeeded but its log write failed; the batch must stop."""


@dataclass
class Outcome:
    status: str  # sent | dry_run | skipped_pref | skipped_dupe | skipped_cap | failed | no_email
    subject: str = ""


def deliver(
    *,
    store,  # TraceMoneyStore or None in a dry run
    uid: str,
    user: dict[str, Any],
    email: kit.Email,
    dedupe_key: str,
    history: History,
    dry_run: bool,
    to_override: str | None = None,
) -> Outcome:
    to = to_override or str(user.get("email") or user.get("email_lower") or "").strip().lower()
    if not to:
        return Outcome("no_email", email.subject)
    if not to_override:
        if not wants(user, email.category, email.kind):
            return Outcome("skipped_pref", email.subject)
        if dedupe_key in history.keys:
            return Outcome("skipped_dupe", email.subject)
        cap = DAILY_CAP.get(email.category)
        if cap is not None and email.kind not in ALWAYS and history.by_category_today.get(email.category, 0) >= cap:
            return Outcome("skipped_cap", email.subject)
    if dry_run:
        return Outcome("dry_run", email.subject)

    headers: dict[str, str] = {}
    if unsubscribe_token(uid, email.category):
        # RFC 8058 one-click only makes sense with a signed link the API accepts
        headers = {
            "List-Unsubscribe": f"<{unsubscribe_link(uid, email.category, api=True)}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
    ok = _post_brevo(to, email, headers)
    if ok and store is not None and not to_override:
        from backend.email_runtime import log_email_send

        try:
            log_email_send(store, uid=uid, email=to, email_type=email.kind, subject=email.subject,
                           dedupe_key=dedupe_key, trigger_type="mail_v2",
                           meta={**{k: v for k, v in email.meta.items() if isinstance(v, (str, int, float, bool))},
                                 "category": email.category})
        except Exception as exc:
            # The email went out but dedupe and caps can't see it. Carrying on
            # would resend it on the next run, so the job has to stop here.
            raise LogFailed(f"sent but not logged ({email.kind}, {uid[:6]}): {exc!r}") from exc
        history.keys.add(dedupe_key)
        history.by_category_today[email.category] = history.by_category_today.get(email.category, 0) + 1
    return Outcome("sent" if ok else "failed", email.subject)


def personalize(email: kit.Email, uid: str) -> kit.Email:
    """Swap the generic footer unsubscribe link for this person's signed one."""
    generic = kit.unsubscribe_url(email.category)
    signed = unsubscribe_link(uid, email.category)
    email.html = email.html.replace(kit.esc(generic), kit.esc(signed))
    email.text = email.text.replace(generic, signed)
    return email
