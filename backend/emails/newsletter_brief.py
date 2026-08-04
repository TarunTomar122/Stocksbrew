from __future__ import annotations

import html
from datetime import datetime
from typing import Any

from backend.email import APP_URL, first_name_from_profile
from backend.email_content import clean_optional_email_text
from backend.emails._shell import email_shell
from backend.emails.price_alert import _fmt_price

DIGEST_WIDTH = 640
DIGEST_FOOTER = (
    "You signed up for the free daily market brief on stocksbrew. "
    f"<a href='{APP_URL}' style='color:#065f46;text-decoration:none;font-weight:600'>"
    "Open stocksbrew</a>"
    " · Not investment advice."
)


def _move_color(move: float) -> str:
    return "#065f46" if move >= 0 else "#b91c1c"


def _move_arrow(move: float) -> str:
    return "▲" if move >= 0 else "▼"


def _table_header(cells: list[tuple[str, str]]) -> str:
    heads = "".join(
        f"<th align='{align}' style='padding:8px 6px;font-size:10px;font-weight:700;"
        f"letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase;border-bottom:1px solid #e5e7eb'>"
        f"{html.escape(label)}</th>"
        for label, align in cells
    )
    return f"<tr>{heads}</tr>"


def _indices_row(indices: list[dict[str, Any]]) -> str:
    if not indices:
        return ""
    cards: list[str] = []
    for hit in indices[:4]:
        label = str(hit.get("label") or hit.get("ticker") or "").strip()
        move = float(hit.get("day_change_pct") or 0)
        cards.append(
            "<td style='width:50%;padding:0 4px'>"
            "<table width='100%' cellpadding='0' cellspacing='0' "
            "style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px'>"
            "<tr><td style='padding:12px;text-align:center'>"
            f"<div style='font-size:10px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase'>{html.escape(label)}</div>"
            f"<div style='margin-top:4px;font-size:20px;font-weight:800;color:{_move_color(move)}'>{_move_arrow(move)} {abs(move):.1f}%</div>"
            "</td></tr></table></td>"
        )
    if not cards:
        return ""
    return (
        "<tr><td style='padding:0 20px 8px 20px'>"
        f"<table width='100%' cellpadding='0' cellspacing='0'><tr>{''.join(cards)}</tr></table>"
        "</td></tr>"
    )


def _market_table_rows(movers: list[dict[str, Any]], *, limit: int = 5) -> str:
    rows: list[str] = []
    for row in movers[:limit]:
        ticker = str(row.get("ticker") or "").strip().upper()
        move = float(row.get("day_change_pct") or 0)
        price = _fmt_price(row.get("price")) or "—"
        rows.append(
            "<tr>"
            f"<td style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:14px;font-weight:700;color:#111827'>{html.escape(ticker)}</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:{_move_color(move)}'>{_move_arrow(move)} {abs(move):.1f}%</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>{html.escape(price)}</td>"
            "</tr>"
        )
    return "".join(rows)


def _movers_section(gainers: list[dict[str, Any]], losers: list[dict[str, Any]]) -> str:
    if not gainers and not losers:
        return ""
    parts: list[str] = [
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
        "Biggest movers</div></td></tr>",
    ]
    header = _table_header([("Ticker", "left"), ("Day", "right"), ("Price", "right")])
    if gainers:
        parts.append(
            "<tr><td style='padding:4px 20px 2px 20px'>"
            "<div style='font-size:12px;font-weight:700;color:#065f46'>Top gainers</div></td></tr>"
            "<tr><td style='padding:0 20px 10px 20px'>"
            f"<table width='100%' cellpadding='0' cellspacing='0'>{header}{_market_table_rows(gainers)}</table>"
            "</td></tr>"
        )
    if losers:
        parts.append(
            "<tr><td style='padding:4px 20px 2px 20px'>"
            "<div style='font-size:12px;font-weight:700;color:#b91c1c'>Top losers</div></td></tr>"
            "<tr><td style='padding:0 20px 8px 20px'>"
            f"<table width='100%' cellpadding='0' cellspacing='0'>{header}{_market_table_rows(losers)}</table>"
            "</td></tr>"
        )
    return "".join(parts)


def _story_cards(movers: list[dict[str, Any]], *, limit: int = 4) -> str:
    from backend.open_email_intel import anomaly_tape_line

    cards: list[str] = []
    for row in movers[:limit]:
        ticker = str(row.get("ticker") or "").strip().upper()
        story = anomaly_tape_line(row).strip()
        move = float(row.get("day_change_pct") or 0)
        if not ticker or not story:
            continue
        cards.append(
            "<tr><td style='padding:0 20px 10px 20px'>"
            "<table width='100%' cellpadding='0' cellspacing='0' "
            "style='background:#fafafa;border:1px solid #f3f4f6;border-radius:12px'>"
            "<tr><td style='padding:14px 16px'>"
            f"<div style='font-size:13px;font-weight:700;color:#111827'>{html.escape(ticker)} "
            f"<span style='color:{_move_color(move)}'>{_move_arrow(move)} {abs(move):.1f}%</span></div>"
            f"<div style='margin-top:6px;font-size:13px;line-height:1.55;color:#374151'>{html.escape(story)}</div>"
            "</td></tr></table></td></tr>"
        )
    if not cards:
        return ""
    return (
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
        "Stories behind the moves</div></td></tr>"
        + "".join(cards)
    )


def _section_block(title: str, body: str) -> str:
    text = clean_optional_email_text(body)
    if not text:
        return ""
    paragraphs = [html.escape(part.strip()) for part in text.split("\n\n") if part.strip()]
    body_html = "".join(
        f"<p style='margin:0 0 12px 0;font-size:14px;line-height:1.65;color:#374151'>{part}</p>"
        for part in paragraphs
    )
    return (
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        f"<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>{html.escape(title)}</div>"
        f"<div style='margin-top:10px'>{body_html}</div>"
        "</td></tr>"
    )


def _format_session_label(session_date: str) -> str:
    try:
        parsed = datetime.strptime(session_date, "%Y-%m-%d")
        return f"{parsed.strftime('%b')} {parsed.day}"
    except ValueError:
        return session_date


def build_newsletter_brief_email(
    *,
    email: str,
    snapshot: dict[str, Any],
    display_name: str | None = None,
) -> tuple[str, str]:
    brief = snapshot.get("brief") or {}
    session_date = str(snapshot.get("session_date") or "").strip()
    session_label = _format_session_label(session_date)
    gainers = list(snapshot.get("gainers") or [])
    losers = list(snapshot.get("losers") or [])
    indices = list(snapshot.get("indices") or [])
    phase_line = clean_optional_email_text(snapshot.get("phase_line"))

    lead_ticker = ""
    lead_move = 0.0
    if gainers:
        lead_ticker = str(gainers[0].get("ticker") or "").upper()
        lead_move = float(gainers[0].get("day_change_pct") or 0)
    elif losers:
        lead_ticker = str(losers[0].get("ticker") or "").upper()
        lead_move = float(losers[0].get("day_change_pct") or 0)

    if lead_ticker:
        subject = f"The market today · {lead_ticker} {_move_arrow(lead_move)} {abs(lead_move):.1f}%"
    else:
        subject = f"The market today · {session_label}"

    first_name = first_name_from_profile(display_name=display_name, email=email)
    hi = f"{first_name}, " if first_name and first_name != "there" else ""

    phase_block = ""
    if phase_line:
        phase_block = (
            f"<div style='margin-top:10px;font-size:13px;color:#065f46;font-weight:600'>"
            f"{html.escape(phase_line)}</div>"
        )

    story_movers = sorted(
        gainers + losers,
        key=lambda row: abs(float(row.get("day_change_pct") or 0)),
        reverse=True,
    )

    body_html = "".join([
        "<tr><td style='padding:24px 20px 8px 20px'>"
        f"<div style='font-size:11px;font-weight:700;letter-spacing:0.12em;color:#9ca3af;text-transform:uppercase'>Daily market brief · {html.escape(session_label)}</div>"
        f"<h1 style='margin:10px 0 0 0;font-size:24px;line-height:1.25;font-weight:700;color:#111827'>The market today, in plain English</h1>"
        f"<p style='margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#4b5563'>{hi}what moved, why it mattered, and what to watch next.</p>"
        f"{phase_block}"
        "</td></tr>",
        _indices_row(indices),
        _section_block("What happened", str(brief.get("overview") or "")),
        _movers_section(gainers, losers),
        _story_cards(story_movers),
        _section_block("Macro forces", str(brief.get("global_forces") or "")),
        _section_block("What to watch", str(brief.get("outlook") or "")),
        "<tr><td style='padding:18px 20px 8px 20px;border-top:1px solid #f3f4f6'>"
        f"<a href='{APP_URL}/watchlist' style='display:inline-block;padding:12px 18px;border-radius:10px;"
        "background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none'>"
        "Open your Watchlist →</a>"
        "</td></tr>",
    ])

    html_doc = email_shell(
        title=subject,
        body_html=body_html,
        footer=DIGEST_FOOTER,
        max_width=DIGEST_WIDTH,
    )
    return subject, html_doc
