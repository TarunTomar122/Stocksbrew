from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL
from backend.emails._assets import logo_img
from backend.emails._shell import email_shell

STANCE_META: dict[str, tuple[str, str, str]] = {
    "accumulate": ("ACCUMULATE", "#065f46", "#ecfdf5"),
    "hold": ("HOLD", "#065f46", "#ecfdf5"),
    "trim": ("TRIM", "#b91c1c", "#fef2f2"),
    "avoid": ("AVOID", "#b91c1c", "#fef2f2"),
    "watch": ("WATCH", "#0e7490", "#ecfeff"),
}


def _fmt_price(value: Any) -> str | None:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n >= 1000:
        return f"${n:,.0f}"
    if n >= 100:
        return f"${n:,.2f}"
    return f"${n:.2f}"


def _zone_line(zone: dict[str, Any] | None, *, fallback_prefix: str) -> str | None:
    if not zone or not isinstance(zone, dict):
        return None
    text = str(zone.get("text") or "").strip()
    if text:
        return text
    trigger_type = str(zone.get("trigger_type") or "").strip()
    price = _fmt_price(zone.get("trigger_value"))
    if not price:
        return None
    if trigger_type == "price_below":
        return f"{fallback_prefix} below {price}"
    if trigger_type == "price_above":
        return f"{fallback_prefix} above {price}"
    return f"{fallback_prefix} at {price}"


def _stance_chip(stance: str | None) -> str:
    key = str(stance or "watch").strip().lower()
    label, fg, bg = STANCE_META.get(key, STANCE_META["watch"])
    return (
        f"<span style='display:inline-block;padding:4px 10px;border-radius:999px;"
        f"font-size:11px;font-weight:700;letter-spacing:0.06em;color:{fg};background:{bg}'>"
        f"{html.escape(label)}</span>"
    )


def _score_badge(score: Any) -> str:
    try:
        n = int(round(float(score)))
    except (TypeError, ValueError):
        return ""
    color = "#065f46" if n >= 60 else "#0e7490" if n >= 40 else "#9ca3af"
    return (
        f"<span style='font-size:12px;font-weight:700;color:{color};margin-left:8px'>"
        f"Score {n}</span>"
    )


def _condition_phrase(*, condition: str, target_price: float, ticker: str) -> str:
    target = _fmt_price(target_price) or f"${target_price:.2f}"
    sym = html.escape(ticker.upper())
    if condition == "below":
        return f"{sym} dropped below {target}"
    if condition == "above":
        return f"{sym} rose above {target}"
    return f"{sym} hit your alert at {target}"


def build_price_alert_subject(
    *,
    ticker: str,
    condition: str,
    target_price: float,
) -> str:
    sym = ticker.upper()
    target = _fmt_price(target_price) or f"${target_price:.2f}"
    if condition == "below":
        return f"{sym} below {target} — price alert"
    if condition == "above":
        return f"{sym} above {target} — price alert"
    return f"{sym} price alert — {target}"


def build_price_alert_email(
    *,
    ticker: str,
    condition: str,
    target_price: float,
    current_price: float,
    row: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Return (subject, html)."""
    sym = str(ticker or "").strip().upper()
    directive = (row or {}).get("ai_directive") if isinstance(row, dict) else {}
    if not isinstance(directive, dict):
        directive = {}

    stance = str(directive.get("stance") or (row or {}).get("stance") or "watch")
    directive_text = str(directive.get("text") or "").strip()
    score = directive.get("score")
    if score is None and isinstance(row, dict):
        score = row.get("score")

    logo_url = None
    if isinstance(row, dict):
        logo_url = row.get("logo_url") or row.get("logo")

    headline = _condition_phrase(condition=condition, target_price=target_price, ticker=sym)
    current_fmt = _fmt_price(current_price) or f"${current_price:.2f}"
    target_fmt = _fmt_price(target_price) or f"${target_price:.2f}"

    levels: list[tuple[str, str, str]] = []
    add_line = _zone_line(directive.get("add_on"), fallback_prefix="Add")
    trim_line = _zone_line(directive.get("trim_on"), fallback_prefix="Trim")
    break_line = _zone_line(directive.get("breaks_if"), fallback_prefix="Reassess")
    for label, line, accent in (
        ("Add zone", add_line, "#065f46"),
        ("Trim zone", trim_line, "#b45309"),
        ("Break level", break_line, "#b91c1c"),
    ):
        if line:
            levels.append((label, line, accent))

    stock_url = f"{APP_URL}/stock/{quote_ticker(sym)}"
    subject = build_price_alert_subject(ticker=sym, condition=condition, target_price=target_price)

    level_rows = ""
    if levels:
        items = []
        for label, line, accent in levels:
            items.append(
                f"<tr><td style='padding:10px 0;border-top:1px solid #f3f4f6'>"
                f"<div style='font-size:10px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase'>{html.escape(label)}</div>"
                f"<div style='margin-top:4px;font-size:14px;line-height:1.45;color:#111827'>{html.escape(line)}</div>"
                f"</td></tr>"
            )
        level_rows = (
            "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:4px'>"
            + "".join(items)
            + "</table>"
        )

    directive_block = ""
    if directive_text:
        directive_block = (
            f"<p style='margin:14px 0 0;font-size:15px;line-height:1.55;color:#374151;font-weight:500'>"
            f"{html.escape(directive_text)}</p>"
        )

    body = f"""
      <tr><td style="padding:24px 24px 8px 24px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="52" valign="top">{logo_img(ticker=sym, logo_url=logo_url, size=44)}</td>
          <td valign="middle" style="padding-left:12px">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase">Price alert</div>
            <div style="margin-top:4px;font-size:20px;font-weight:800;color:#111827;letter-spacing:-0.03em;line-height:1.2">{headline}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:8px 24px 20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px">
          <tr><td style="padding:14px 16px">
            <table width="100%"><tr>
              <td style="font-size:13px;color:#6b7280">Now</td>
              <td align="right" style="font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.03em">{html.escape(current_fmt)}</td>
            </tr>
            <tr><td colspan="2" style="padding-top:8px;font-size:12px;color:#9ca3af">Your alert: {html.escape(condition)} {html.escape(target_fmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        <div style="margin-top:16px">{_stance_chip(stance)}{_score_badge(score)}</div>
        {directive_block}
        {level_rows}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td align="center">
          <a href="{html.escape(stock_url)}" style="display:inline-block;padding:12px 22px;background:#065f46;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">Open in Radar</a>
        </td></tr></table>
      </td></tr>"""

    return subject, email_shell(title=subject, body_html=body)


def quote_ticker(ticker: str) -> str:
    from urllib.parse import quote

    return quote(str(ticker or "").strip().upper())
