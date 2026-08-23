"""Email template: a watched politician traded a stock the user holds."""
from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL
from backend.emails._shell import email_shell
from backend.emails._theme import (
    BEARISH,
    BEARISH_BG,
    BULLISH,
    BULLISH_BG,
    DIVIDER,
    INK,
    MUTED,
    PRIMARY,
    RADIUS_PILL,
)

_ACTION_META = {
    "buy": ("BOUGHT", BULLISH, BULLISH_BG),
    "sell": ("SOLD", BEARISH, BEARISH_BG),
}

_PAST_TENSE = {
    "buy": "bought",
    "sell": "sold",
    "exchange": "exchanged",
}


def _esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _money(low: Any, high: Any) -> str:
    def fmt(n: Any) -> str:
        try:
            n = float(n)
        except (TypeError, ValueError):
            return ""
        if n >= 1_000_000:
            return f"${n / 1_000_000:.1f}M".replace(".0M", "M")
        return f"${round(n):,}"

    lo, hi = fmt(low), fmt(high)
    if lo and hi and low != high:
        return f"{lo} – {hi}"
    if lo and hi:
        return hi
    return lo or hi or "an undisclosed range"


def build_power_trade_email(alerts: list[dict[str, Any]]) -> tuple[str, str]:
    """Return (subject, html) for a batch of power-trade alerts for one user."""
    first = alerts[0]
    name = _esc(first.get("person_name") or "A member of Congress")
    action_label, color, bg = _ACTION_META.get(str(first.get("tx_type")), ("TRADED", MUTED, "#f0f0f0"))
    ticker = _esc(first.get("ticker") or "")
    tx_verb = _PAST_TENSE.get(str(first.get("tx_type", "")).lower(), "traded")
    more = len(alerts) - 1

    if more > 0:
        subject = f"{name} just {tx_verb} {ticker} — and {more} more stock{'s' if more > 1 else ''} you hold"
    else:
        subject = f"{name} just {tx_verb} {ticker}, a stock you hold"

    rows: list[str] = []
    for alert in alerts:
        a_name = _esc(alert.get("person_name") or "A member of Congress")
        a_ticker = _esc(alert.get("ticker") or "")
        a_action = str(alert.get("tx_type") or "trade").lower()
        a_label, a_color, a_bg = _ACTION_META.get(a_action, ("TRADED", MUTED, "#f0f0f0"))
        a_meta = " · ".join(
            part
            for part in [
                str(alert.get("chamber") or "").upper(),
                str(alert.get("party") or ""),
                str(alert.get("state") or ""),
            ]
            if part
        )
        lag = alert.get("lag_days")
        lag_note = f"filed in {lag} days after the trade" if isinstance(lag, (int, float)) else ""
        link = f"{APP_URL}/stock/{a_ticker}" if a_ticker else f"{APP_URL}/power-trades"
        rows.append(f"""
      <tr><td style="padding:16px 24px 4px 24px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:4px 10px;border-radius:{RADIUS_PILL}px;background:{a_bg}">
            <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:{a_color}">{a_label}</span>
          </td>
          <td align="right" style="font-size:12px;color:{MUTED}">{_esc(alert.get('disclosure_date') or '')}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:6px 24px 14px 24px;border-bottom:1px solid {DIVIDER}">
        <p style="margin:0;font-size:15px;line-height:1.5;color:{INK};font-weight:600">
          {a_name} <span style="color:{a_color}">{a_action.upper()}</span> {a_ticker}
          <span style="font-weight:400;color:{MUTED}">({_esc(alert.get('company') or 'unknown asset')})</span>
        </p>
        <p style="margin:6px 0 0 0;font-size:13px;line-height:1.5;color:{INK}">
          Value filed: <strong>{_money(alert.get('amount_low'), alert.get('amount_high'))}</strong>
          &nbsp;·&nbsp; {_esc(a_meta)}
        </p>
        <p style="margin:4px 0 0 0;font-size:11px;color:{MUTED}">STOCK Act disclosure · {lag_note}</p>
        <p style="margin:10px 0 0 0">
          <a href="{link}" style="color:{PRIMARY};text-decoration:none;font-size:13px;font-weight:600">
            See {a_ticker or 'the feed'} on stocksbrew →</a>
        </p>
      </td></tr>""")

    body = f"""
    <tr><td style="padding:26px 24px 8px 24px">
      <p style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.01em;color:{INK}">
        Someone in power traded a stock you hold</p>
      <p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:{MUTED}">
        You follow these names on stocksbrew's Power Trades watchlist. Under the STOCK Act they must disclose
        trades like these within 45 days.</p>
    </td></tr>{''.join(rows)}
    <tr><td style="padding:18px 24px 24px 24px">
      <a href="{APP_URL}/power-trades"
         style="display:inline-block;padding:11px 22px;border-radius:{RADIUS_PILL}px;background:{INK};
                color:#ffffff;text-decoration:none;font-size:13px;font-weight:600">
        Open Power Trades</a>
    </td></tr>"""

    return subject, email_shell(title=subject, body_html=body)
