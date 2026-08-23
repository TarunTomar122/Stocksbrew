from __future__ import annotations

import html

from backend.email import APP_URL, first_name_from_profile
from backend.emails._shell import email_shell
from backend.emails._theme import BODY, DIVIDER, INK, MUTED, PRIMARY

SUPPORT_EMAIL = "tomartarun2001@gmail.com"

TIPS: list[tuple[str, str]] = [
    (
        "Open a stock, click Track",
        "If a stock doesn't have an AI brief yet, tracking it adds it to your Watchlist "
        "and kicks off research right away. It's usually ready in 10 to 15 minutes.",
    ),
    (
        "Search for anything, request what's missing",
        "Type a ticker into search. If we don't cover it yet, the search bar will offer "
        "to request it for you. One click and it's in the queue.",
    ),
    (
        "Still can't find it? Email me",
        f"If a stock you want still isn't showing up, just email me directly at "
        f"{SUPPORT_EMAIL}. I read every email myself and I'll get it added.",
    ),
    (
        "Connect your AI agent",
        "Pro includes agent access, so if you use Claude, ChatGPT, or another AI agent "
        "for research, you can connect it to Stocksbrew and pull our calls, targets, and "
        "drivers straight into your workflow.",
    ),
]


def build_welcome_pro_email(*, email: str, display_name: str | None = None) -> tuple[str, str]:
    first_name = first_name_from_profile(display_name=display_name, email=email)
    hi = first_name if first_name and first_name != "there" else "there"
    subject = "Welcome to Pro. A few tips before you dive in."

    tip_rows = "".join(
        f"""
        <tr><td style="padding:16px 0;border-top:1px solid {DIVIDER}">
          <p style="margin:0;font-size:15px;font-weight:600;color:{INK}">{html.escape(title)}</p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:{BODY}">{html.escape(body)}</p>
        </td></tr>"""
        for title, body in TIPS
    )

    body_html = f"""
      <tr><td style="padding:32px 28px 8px 28px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{PRIMARY};text-transform:uppercase">Welcome to Pro</div>
        <p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:{INK}">Hey {html.escape(hi)},</p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:{BODY}">
          Thanks for going Pro. I built stocksbrew because I wanted something that actually
          reads the market for me instead of dumping raw numbers and leaving me to figure it
          out, so it means a lot that you're trusting it with your own money decisions.
        </p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:{BODY}">
          A few things that will help you get the most out of it:
        </p>
      </td></tr>
      <tr><td style="padding:6px 28px 4px 28px">
        <table width="100%" cellpadding="0" cellspacing="0">{tip_rows}</table>
      </td></tr>
      <tr><td style="padding:20px 28px 4px 28px;border-top:1px solid {DIVIDER}">
        <p style="margin:0;font-size:15px;line-height:1.65;color:{BODY}">
          And honestly, if something's missing, confusing, or you've got an idea for a
          feature, just email it to {SUPPORT_EMAIL}. I read all of it, and a good chunk of
          what's in the product today came directly from people telling me what they wanted.
        </p>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:{BODY}">
          Thanks again for being here.
        </p>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.4;color:{INK}">
          Tarun<br/>
          <span style="font-size:13px;color:{MUTED}">Founder, stocksbrew</span>
        </p>
      </td></tr>
      <tr><td style="padding:18px 28px 28px 28px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="{APP_URL}/watchlist" style="display:inline-block;padding:12px 20px;border-radius:10px;background:{PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">
            Open your Watchlist →
          </a>
        </td></tr></table>
      </td></tr>"""

    footer = (
        "You're receiving this because you subscribed to stocksbrew Pro. "
        f"<a href='{html.escape(APP_URL)}/profile' style='color:{PRIMARY};text-decoration:none;font-weight:600'>Manage your account</a>"
        " · Not investment advice."
    )

    html_doc = email_shell(title=subject, body_html=body_html, footer=footer, max_width=560)
    return subject, html_doc
