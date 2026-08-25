from __future__ import annotations

import html
import math
from typing import Any

from backend.email import APP_URL
from backend.email_content import clean_optional_email_text
from backend.emails._shell import email_shell
from backend.emails._theme import BEARISH, BODY, BULLISH, INK, PRIMARY, RADIUS_PILL


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
    ticker = ticker.strip().upper()
    subject = f"Your AI brief for {ticker} is ready"
    clean_headline = clean_optional_email_text(headline, max_chars=200)
    clean_company_name = clean_optional_email_text(company_name, max_chars=100)
    current_price = _number(price)
    day_change = _number(day_change_pct)
    identity = f"{html.escape(ticker)} · {html.escape(clean_company_name)}" if clean_company_name else html.escape(ticker)
    market_block = ""
    if current_price is not None or day_change is not None:
        price_block = (
            f"{html.escape(currency)}{current_price:,.2f}"
            if current_price is not None
            else ""
        )
        move_block = ""
        if day_change is not None:
            move_color = BULLISH if day_change >= 0 else BEARISH
            move_block = f'<span style="margin-left:10px;color:{move_color}">{day_change:+.2f}% today</span>'
        market_block = f'<p style="margin:14px 0 0;font-size:16px;font-weight:700;color:{INK}">{price_block}{move_block}</p>'
    headline_block = (
        f'<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:{BODY}"><strong style="color:{INK}">What’s happening:</strong> {html.escape(clean_headline)}</p>'
        if clean_headline
        else ""
    )

    body = f"""
      <tr><td style="padding:24px 24px 10px 24px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{PRIMARY};text-transform:uppercase">AI brief ready</div>
        <div style="margin-top:8px;font-size:24px;font-weight:800;color:{INK};letter-spacing:-0.03em">{identity} is ready to read</div>
        {market_block}
        {headline_block}
      </td></tr>
      <tr><td style="padding:14px 24px 24px 24px">
        <a href="{html.escape(APP_URL)}/stock/{html.escape(ticker)}" style="display:inline-block;padding:12px 22px;background:{PRIMARY};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:{RADIUS_PILL}px">Open {html.escape(ticker)}</a>
      </td></tr>
    """
    footer = (
        "You received this because you asked to be emailed when this brief was ready. "
        f"<a href='{html.escape(APP_URL)}/profile' style='color:{PRIMARY};text-decoration:none;font-weight:600'>Manage alerts</a>"
        " · Not investment advice."
    )
    return subject, email_shell(title=subject, body_html=body, footer=footer)
