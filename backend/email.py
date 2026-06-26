"""stocksbrew email transport.

Templates are added one at a time in separate modules. Sending is off by default;
set EMAILS_ENABLED=1 when a template is ready to ship.
"""
from __future__ import annotations

import os
from typing import Any

from backend.env import load_backend_env

load_backend_env()

BREVO_API = "https://api.brevo.com/v3/smtp/email"
FROM_EMAIL = os.environ.get("STOCKSBREW_FROM_EMAIL", "yourtrace.online@gmail.com")
FROM_NAME = os.environ.get("STOCKSBREW_FROM_NAME", "stocksbrew")
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://www.stocksbrew.online").rstrip("/")


def emails_enabled() -> bool:
    flag = os.environ.get("EMAILS_ENABLED", "0").strip().lower()
    return flag in {"1", "true", "yes", "on"}


def first_name_from_profile(*, display_name: str | None = None, email: str = "") -> str:
    raw = str(display_name or "").strip()
    if raw:
        token = raw.split()[0].strip(".,")
        if token:
            return token[:1].upper() + token[1:]
    local = str(email or "").split("@", 1)[0].strip()
    if local:
        token = local.replace(".", " ").replace("_", " ").split()[0]
        cleaned = "".join(ch for ch in token if ch.isalpha())
        if len(cleaned) >= 2:
            return cleaned[:1].upper() + cleaned[1:].lower()
    return "there"


def send_email(
    to: str,
    subject: str,
    html_body: str,
    *,
    attachments: list[dict[str, str]] | None = None,
) -> bool:
    if not emails_enabled():
        print(f"[email] disabled — skipped: {subject[:100]}")
        return False

    api_key = os.environ.get("BREVO_API_KEY")
    if not api_key:
        print("[email] BREVO_API_KEY not set")
        return False

    try:
        import requests

        payload: dict[str, Any] = {
            "sender": {"email": FROM_EMAIL, "name": FROM_NAME},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html_body,
        }
        if attachments:
            payload["attachment"] = attachments
        resp = requests.post(
            BREVO_API,
            headers={"api-key": api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=12,
        )
        if resp.status_code in (200, 201):
            return True
        print(f"[email] brevo error {resp.status_code}: {resp.text[:240]}")
        return False
    except Exception as exc:
        print(f"[email] exception: {exc}")
        return False
