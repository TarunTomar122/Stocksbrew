from __future__ import annotations

import math
from typing import Any

from backend.email_content import clean_optional_email_text


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def build_brief_ready_email(
    *,
    ticker: str,
    headline: str | None = None,
    company_name: str | None = None,
    price: float | None = None,
    day_change_pct: float | None = None,
    currency: str = "$",
) -> tuple[str, str]:
    """The research-ready email, drawn by the backend/mail kit (owner rules: logo, price and move, no label above
    the heading). Returns (subject, html) for backend/brief_ready_alerts.py."""
    from backend.mail import kit
    from backend.mail.lifecycle import build_brief_ready

    email = build_brief_ready(
        ticker=ticker,
        name=clean_optional_email_text(company_name) or "",
        # the kit writes dollars; a price in any other currency is left out rather than shown with a $
        price=_number(price) if currency == "$" else None,
        change_pct=_number(day_change_pct),
        headline=clean_optional_email_text(headline) or "",
    )
    # backend/brief_ready_alerts.py sends this without a signed per-person link, so the footer's stop link points at
    # the email settings, where it works (send.unsubscribe_link does the same when there is no signing secret)
    return email.subject, email.html.replace(kit.esc(kit.unsubscribe_url(email.category)), kit.esc(kit.settings_url()))
