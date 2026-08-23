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


def _pill(label: str, color: str, bg: str) -> str:
    return (
        f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;'
        f'background:{bg};font-size:11px;font-weight:700;letter-spacing:0.06em;color:{color}">{label}</span>'
    )


def _alert_row(alert: dict[str, Any]) -> str:
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
    lag_note = f"filed {int(lag)} days after the trade" if isinstance(lag, (int, float)) else ""
    link = f"{APP_URL}/stock/{a_ticker}" if a_ticker else f"{APP_URL}/power-trades"
    return f"""
      <tr><td colspan="2" style="padding:18px 24px 16px 24px;border-bottom:1px solid {DIVIDER}">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:2px 0">{_pill(a_label, a_color, a_bg)}</td>
          <td align="right" style="font-size:12px;color:{MUTED};padding:2px 0">{_esc(alert.get('disclosure_date') or '')}</td>
        </tr></table>
        <p style="margin:10px 0 0 0;font-size:15px;line-height:1.45;color:{INK}">
          <span style="font-weight:600">{a_name}</span>
          <span style="color:{a_color};font-weight:600">{a_action.upper()}</span>
          <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px">{a_ticker}</span>
          <span style="color:{MUTED}">· {_esc(alert.get('company') or 'unknown asset')}</span>
        </p>
        <p style="margin:6px 0 0 0;font-size:13px;line-height:1.5;color:{INK}">
          Value filed <strong>{_money(alert.get('amount_low'), alert.get('amount_high'))}</strong>
          <span style="color:{MUTED}"> &nbsp;·&nbsp; {_esc(a_meta)}</span>
        </p>
        <p style="margin:8px 0 0 0;font-size:11px;color:{MUTED}">
          STOCK Act disclosure{_esc(' · ') + lag_note if lag_note else ''}
        </p>
        <p style="margin:10px 0 0 0">
          <a href="{link}" style="color:{PRIMARY};text-decoration:none;font-size:13px;font-weight:600">
            See {a_ticker or 'the feed'} on stocksbrew →</a>
        </p>
      </td></tr>"""


def build_power_trade_email(alerts: list[dict[str, Any]]) -> tuple[str, str]:
    """Return (subject, html) for a batch of power-trade alerts for one user."""
    first = alerts[0]
    name = _esc(first.get("person_name") or "A member of Congress")
    ticker = _esc(first.get("ticker") or "")
    tx_verb = _PAST_TENSE.get(str(first.get("tx_type", "")).lower(), "traded")
    more = len(alerts) - 1

    if more > 0:
        subject = f"{name} just {tx_verb} {ticker} — and {more} more stock{'s' if more > 1 else ''} you hold"
    else:
        subject = f"{name} just {tx_verb} {ticker}, a stock you hold"

    rows = "".join(_alert_row(alert) for alert in alerts)

    body = f"""
    <tr><td style="padding:26px 24px 10px 24px">
      <p style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.01em;color:{INK}">
        Someone in power traded a stock you hold</p>
      <p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:{MUTED}">
        You follow these names on stocksbrew's Power Trades watchlist. Under the STOCK Act they must disclose
        trades like these within 45 days.</p>
    </td></tr>{rows}
    <tr><td style="padding:20px 24px 24px 24px">
      <a href="{APP_URL}/power-trades"
         style="display:inline-block;padding:11px 22px;border-radius:999px;background:{INK};
                color:#ffffff;text-decoration:none;font-size:13px;font-weight:600">
        Open Power Trades</a>
    </td></tr>"""

    footer = (
        "You get these because you track holdings on stocksbrew. "
        f"<a href='{html.escape(f'{APP_URL}/profile')}' style='color:{PRIMARY};text-decoration:none;font-weight:600'>"
        "Manage alerts</a>"
        " · Not investment advice."
    )
    return subject, email_shell(title=subject, body_html=body, footer=footer)
