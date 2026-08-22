from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL
from backend.email_content import clean_optional_email_text
from backend.emails._shell import email_shell
from backend.emails._theme import BODY, INK, MUTED, PRIMARY, RADIUS_PILL


def build_radar_alert_email(event_type: str, payload: dict[str, Any]) -> tuple[str, str]:
    ticker = str(payload.get("ticker") or "Stock").strip().upper()

    if event_type == "earnings_24h":
        event_date = str(payload.get("event_date") or "").strip()
        subject = f"{ticker} reports within 24 hours"
        headline = f"{ticker} earnings are close"
        detail = f"{ticker} is in your Watchlist and is scheduled to report within 24 hours."
        if event_date:
            detail = f"{ticker} is in your Watchlist and is scheduled to report on {event_date}."
        label = "Earnings alert"
    else:
        stance = str(payload.get("new_stance") or "").strip().lower()
        stance_label = "buy zone" if stance == "accumulate" else "trim zone" if stance == "trim" else stance
        if stance_label:
            subject = f"{ticker} moved into its {stance_label}"
            headline = f"{ticker}: {stance_label}"
        else:
            subject = f"Something changed for {ticker}"
            headline = subject
        detail = clean_optional_email_text(payload.get("directive_text"), max_chars=320)
        label = "Watchlist alert"

    detail_block = (
        f'<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:{BODY}">{html.escape(detail)}</p>'
        if detail
        else ""
    )

    body = f"""
      <tr><td style="padding:24px 24px 10px 24px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{PRIMARY};text-transform:uppercase">{html.escape(label)}</div>
        <div style="margin-top:8px;font-size:24px;font-weight:800;color:{INK};letter-spacing:-0.03em">{html.escape(headline)}</div>
        {detail_block}
      </td></tr>
      <tr><td style="padding:14px 24px 24px 24px">
        <a href="{html.escape(APP_URL)}/stock/{html.escape(ticker)}" style="display:inline-block;padding:12px 22px;background:{PRIMARY};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:{RADIUS_PILL}px">Open {html.escape(ticker)}</a>
        <a href="{html.escape(APP_URL)}/watchlist" style="display:inline-block;margin-left:8px;padding:12px 18px;color:{INK};text-decoration:none;font-size:13px;font-weight:700">Open Watchlist</a>
      </td></tr>
    """
    footer = (
        "You receive automatic setup alerts as a Stocksbrew Pro subscriber. "
        f"<a href='{html.escape(APP_URL)}/profile' style='color:{PRIMARY};text-decoration:none;font-weight:600'>Manage alerts</a>"
        " · Not investment advice."
    )
    return subject, email_shell(title=subject, body_html=body, footer=footer)
