from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL, first_name_from_profile
from backend.emails._assets import logo_img
from backend.emails._shell import email_shell
from backend.emails._theme import (
    BEARISH,
    BODY,
    BULLISH,
    DIVIDER,
    INK,
    INSET,
    MUTED,
    PRIMARY,
    RADIUS_INNER,
)


DIGEST_WIDTH = 640


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _money(value: Any) -> str:
    parsed = _number(value)
    return f"${parsed:,.2f}" if parsed is not None else "—"


def _signed_pct(value: Any) -> str:
    parsed = _number(value)
    return f"{parsed:+.1f}%" if parsed is not None else "—"


def _pct_color(value: Any) -> str:
    parsed = _number(value)
    return BULLISH if parsed is not None and parsed >= 0 else BEARISH


def _target_cell(label: str, value: Any, *, accent: str = INK) -> str:
    return (
        f"<td style='width:33.33%;padding:0 8px 0 0;vertical-align:top'>"
        f"<div style='font-size:10px;font-weight:700;letter-spacing:0.08em;"
        f"text-transform:uppercase;color:{MUTED}'>{html.escape(label)}</div>"
        f"<div style='margin-top:5px;font-size:18px;font-weight:800;letter-spacing:-0.02em;"
        f"color:{accent}'>{html.escape(_money(value))}</div></td>"
    )


def _name_card(item: dict[str, Any]) -> str:
    ticker = str(item.get("ticker") or "").strip().upper()
    company = str(item.get("company") or ticker).strip()
    role = str(item.get("role") or "AI-capex exposure").strip()
    why = str(item.get("why_benefits") or "").strip()
    risk = str(item.get("risk") or "").strip()
    current = _number(item.get("current_price"))
    analyst_target = _number(item.get("analyst_target"))
    stocksbrew_target = _number(item.get("stocksbrew_target"))
    analyst_upside = (
        ((analyst_target - current) / current) * 100
        if analyst_target is not None and current is not None and current > 0
        else None
    )
    day_change = item.get("day_change_pct")
    analyst_count = item.get("analyst_count")
    score = _number(item.get("stocksbrew_score"))
    score_block = (
        f"<span style='margin-left:10px;color:{PRIMARY};font-weight:700'>"
        f"Stocksbrew {html.escape(f'{score:.1f}')}</span>"
        if score is not None
        else ""
    )
    count_block = f" · {int(analyst_count)} analysts" if _number(analyst_count) is not None else ""
    stock_url = f"{APP_URL}/stock/{html.escape(ticker)}"

    return f"""
      <tr><td style='padding:22px 24px 24px;border-top:1px solid {DIVIDER}'>
        <table width='100%' cellpadding='0' cellspacing='0'><tr>
          <td width='52' valign='top'>{logo_img(ticker=ticker, size=44)}</td>
          <td valign='top' style='padding-left:12px'>
            <div style='font-size:20px;font-weight:800;letter-spacing:-0.03em;color:{INK}'>
              <a href='{stock_url}' style='color:{INK};text-decoration:none'>{html.escape(ticker)}</a>
              <span style='margin-left:9px;font-size:12px;font-weight:700;letter-spacing:0.06em;'
                'text-transform:uppercase;color:{PRIMARY}'>{html.escape(role)}</span>
            </div>
            <div style='margin-top:3px;font-size:13px;color:{MUTED}'>{html.escape(company)}</div>
          </td>
          <td align='right' valign='top' style='white-space:nowrap'>
            <div style='font-size:18px;font-weight:800;color:{INK}'>{html.escape(_money(current))}</div>
            <div style='margin-top:3px;font-size:13px;font-weight:700;color:{_pct_color(day_change)}'>
              {html.escape(_signed_pct(day_change))} today</div>
          </td>
        </tr></table>

        <p style='margin:18px 0 0;font-size:15px;line-height:1.58;color:{BODY}'>
          <strong style='color:{INK}'>Why it benefits:</strong> {html.escape(why)}</p>
        <p style='margin:10px 0 0;font-size:14px;line-height:1.55;color:{BODY}'>
          <strong style='color:{INK}'>What breaks it:</strong> {html.escape(risk)}</p>

        <table width='100%' cellpadding='0' cellspacing='0' style='margin-top:18px;background:{INSET};border-radius:{RADIUS_INNER}px'>
          <tr><td style='padding:14px 16px'>
            <table width='100%' cellpadding='0' cellspacing='0'><tr>
              {_target_cell('Now', current)}
              {_target_cell('Analyst target', analyst_target, accent=BULLISH if (analyst_upside or 0) >= 0 else BEARISH)}
              {_target_cell('Stocksbrew target', stocksbrew_target, accent=PRIMARY)}
            </tr></table>
            <div style='margin-top:11px;font-size:13px;color:{MUTED}'>
              Analyst runway: <strong style='color:{_pct_color(analyst_upside)}'>{html.escape(_signed_pct(analyst_upside))}</strong>{html.escape(count_block)}{score_block}
            </div>
          </td></tr>
        </table>
        <div style='margin-top:14px'>
          <a href='{stock_url}' style='font-size:14px;font-weight:700;color:{PRIMARY};text-decoration:none'>Read {html.escape(ticker)} on stocksbrew →</a>
        </div>
      </td></tr>"""


def build_ai_capex_watch_email(
    *,
    first_name: str,
    names: list[dict[str, Any]],
    as_of: str,
) -> tuple[str, str]:
    subject = "5 less-obvious AI-capex names to watch"
    greeting = f"{html.escape(first_name)}, " if first_name and first_name != "there" else ""
    date_label = html.escape(str(as_of or "").strip() or "today")
    cards = "".join(_name_card(item) for item in names)
    explore_url = f"{APP_URL}/explore"

    body = f"""
      <tr><td style='padding:28px 24px 10px'>
        <div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:{PRIMARY};text-transform:uppercase'>AI capex watch</div>
        <div style='margin-top:8px;font-size:28px;line-height:1.12;font-weight:800;letter-spacing:-0.04em;color:{INK}'>
          5 less-obvious names in the AI buildout</div>
        <p style='margin:14px 0 0;font-size:16px;line-height:1.58;color:{BODY}'>
          {greeting}the AI spending story is spreading beyond the headline chip names. These five sit in the equipment, power, optics, grid, and nuclear layers that have to keep expanding for new compute capacity to work.</p>
        <div style='margin-top:12px;font-size:12px;color:{MUTED}'>Market data and targets checked {date_label} · research only</div>
      </td></tr>
      <tr><td style='padding:12px 24px 22px'>
        <table width='100%' cellpadding='0' cellspacing='0' style='background:{INSET};border-radius:{RADIUS_INNER}px'>
          <tr><td style='padding:16px 18px'>
            <div style='font-size:10px;font-weight:700;letter-spacing:0.1em;color:{MUTED};text-transform:uppercase'>The angle</div>
            <div style='margin-top:7px;font-size:15px;line-height:1.55;color:{BODY}'>AI demand can slow and still leave a durable electricity, grid, cooling, and networking buildout behind. That is why the second-order beneficiaries deserve a separate look.</div>
          </td></tr>
        </table>
      </td></tr>
      {cards}
      <tr><td style='padding:22px 24px 26px;border-top:1px solid {DIVIDER}'>
        <a href='{html.escape(explore_url)}' style='display:inline-block;padding:12px 20px;background:{PRIMARY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px'>Explore these names in stocksbrew</a>
        <p style='margin:16px 0 0;font-size:12px;line-height:1.6;color:{MUTED}'>Analyst target is the current consensus mean in Stocksbrew’s market data. Stocksbrew target is the current model level. Both can change as prices, evidence, and expectations change.</p>
      </td></tr>"""

    footer = (
        "You received this research note as a stocksbrew account holder. "
        f"<a href='{APP_URL}/profile' style='color:{PRIMARY};text-decoration:none;font-weight:600'>"
        "Manage email preferences</a> · Not investment advice."
    )
    return subject, email_shell(title=subject, body_html=body, footer=footer, max_width=DIGEST_WIDTH)


def build_ai_capex_watch_for_user(
    *,
    display_name: str | None,
    email: str,
    names: list[dict[str, Any]],
    as_of: str,
) -> tuple[str, str]:
    return build_ai_capex_watch_email(
        first_name=first_name_from_profile(display_name=display_name, email=email),
        names=names,
        as_of=as_of,
    )
