from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL, first_name_from_profile
from backend.emails._shell import email_shell
from backend.emails._theme import BODY, DIVIDER, INK, INSET, MUTED, PRIMARY, RADIUS_INNER
from backend.emails.ai_capex_watch import _name_card


DIGEST_WIDTH = 640


def build_healthcare_watch_email(
    *,
    first_name: str,
    names: list[dict[str, Any]],
    as_of: str,
) -> tuple[str, str]:
    subject = "5 healthcare names worth a closer look"
    greeting = f"{html.escape(first_name)}, " if first_name and first_name != "there" else ""
    cards = "".join(_name_card(item) for item in names)
    explore_url = f"{APP_URL}/explore"

    body = f"""
      <tr><td style='padding:28px 24px 10px'>
        <div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:{PRIMARY};text-transform:uppercase'>Healthcare watch</div>
        <div style='margin-top:8px;font-size:28px;line-height:1.12;font-weight:800;letter-spacing:-0.04em;color:{INK}'>
          5 healthcare names worth a closer look</div>
        <p style='margin:14px 0 0;font-size:16px;line-height:1.58;color:{BODY}'>
          {greeting}healthcare is bigger than the next drug headline. These five names sit across metabolic medicine, glucose data, regulated software, robotic procedures, and the tools behind research and manufacturing.</p>
      </td></tr>
      <tr><td style='padding:12px 24px 22px'>
        <table width='100%' cellpadding='0' cellspacing='0' style='background:{INSET};border-radius:{RADIUS_INNER}px'>
          <tr><td style='padding:16px 18px'>
            <div style='font-size:15px;line-height:1.55;color:{BODY}'>The common thread is repeatable demand: therapies scale, health data becomes part of care, hospitals add procedures, and life-sciences companies keep outsourcing more of the workflow.</div>
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


def build_healthcare_watch_for_user(
    *,
    display_name: str | None,
    email: str,
    names: list[dict[str, Any]],
    as_of: str,
) -> tuple[str, str]:
    return build_healthcare_watch_email(
        first_name=first_name_from_profile(display_name=display_name, email=email),
        names=names,
        as_of=as_of,
    )
