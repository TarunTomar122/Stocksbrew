from __future__ import annotations

import html
from typing import Any

from backend.email import APP_URL, first_name_from_profile
from backend.email_content import clean_optional_email_text
from backend.emails._shell import email_shell
from backend.emails.price_alert import _fmt_price
from backend.weekly_intel import (
    WEEKLY_BOOK_MOVE_THRESHOLD,
    book_sector_summary_line,
)

DIGEST_WIDTH = 640
DIGEST_FOOTER = (
    "You receive the weekly report as a Pro subscriber. "
    f"<a href='{APP_URL}/profile' style='color:#065f46;text-decoration:none;font-weight:600'>"
    "Email preferences</a>"
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


def _market_table_rows(movers: list[dict[str, Any]], *, limit: int = 5) -> str:
    rows: list[str] = []
    for row in movers[:limit]:
        ticker = str(row.get("ticker") or "").strip().upper()
        move = float(row.get("week_change_pct") or 0)
        price = _fmt_price(row.get("price")) or "—"
        rows.append(
            "<tr>"
            f"<td style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:14px;font-weight:700;color:#111827'>{html.escape(ticker)}</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:{_move_color(move)}'>{_move_arrow(move)} {abs(move):.1f}%</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>{html.escape(price)}</td>"
            "</tr>"
        )
    return "".join(rows)


def _indices_row(indices: dict[str, Any]) -> str:
    if not indices:
        return ""
    cards: list[str] = []
    for label, hit in indices.items():
        if not isinstance(hit, dict):
            continue
        move = float(hit.get("week_change_pct") or 0)
        cards.append(
            "<td style='width:50%;padding:0 4px'>"
            "<table width='100%' cellpadding='0' cellspacing='0' "
            f"style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px'>"
            "<tr><td style='padding:12px;text-align:center'>"
            f"<div style='font-size:10px;font-weight:700;letter-spacing:0.08em;color:#9ca3af;text-transform:uppercase'>{html.escape(str(label))}</div>"
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


def _movers_section(gainers: list[dict[str, Any]], losers: list[dict[str, Any]]) -> str:
    if not gainers and not losers:
        return ""
    parts: list[str] = [
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
        "Biggest weekly movers</div></td></tr>",
    ]
    header = _table_header([("Ticker", "left"), ("Week", "right"), ("Price", "right")])
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


def _weekly_stories_section(stories: list[dict[str, Any]]) -> str:
    if not stories:
        return ""
    cards: list[str] = []
    for item in stories[:5]:
        ticker = str(item.get("ticker") or "").strip().upper()
        headline = clean_optional_email_text(item.get("headline"), max_chars=90)
        story = clean_optional_email_text(item.get("story"), max_chars=320)
        if not ticker or not story:
            continue
        move = float(item.get("week_change_pct") or 0)
        on_book = bool(item.get("on_book"))
        book_badge = (
            "<span style='margin-left:8px;font-size:10px;font-weight:700;color:#065f46;"
            "letter-spacing:0.06em;text-transform:uppercase'>On your book</span>"
            if on_book
            else ""
        )
        cards.append(
            "<tr><td style='padding:14px 0;border-top:1px solid #f3f4f6'>"
            f"<div style='font-size:14px;font-weight:800;color:#111827'>{html.escape(ticker)}"
            f"<span style='margin-left:8px;font-size:13px;font-weight:700;color:{_move_color(move)}'>"
            f"{_move_arrow(move)} {abs(move):.1f}%</span>{book_badge}</div>"
            f"<div style='margin-top:4px;font-size:14px;font-weight:700;color:#111827'>{html.escape(headline)}</div>"
            f"<p style='margin:6px 0 0;font-size:13px;line-height:1.55;color:#4b5563'>{html.escape(story)}</p>"
            "</td></tr>"
        )
    if not cards:
        return ""
    return (
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
        "Stories of the week</div></td></tr>"
        f"<tr><td style='padding:0 20px 8px 20px'><table width='100%' cellpadding='0' cellspacing='0'>{''.join(cards)}</table></td></tr>"
    )


def _book_movers_table(book_hits: list[tuple[dict[str, Any], dict[str, Any], float]], *, limit: int = 6) -> str:
    rows: list[str] = []
    for row, hit, move in book_hits[:limit]:
        ticker = str(row.get("ticker") or hit.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        price = _fmt_price(hit.get("price") or row.get("price")) or "—"
        rows.append(
            "<tr>"
            f"<td style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:14px;font-weight:700;color:#111827'>{html.escape(ticker)}</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:{_move_color(move)}'>{_move_arrow(move)} {abs(move):.1f}%</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>{html.escape(price)}</td>"
            "</tr>"
        )
    return "".join(rows)


def _book_section(
    book_hits: list[tuple[dict[str, Any], dict[str, Any], float]],
    *,
    sector_summary: list[dict[str, Any]],
) -> str:
    if not book_hits:
        return ""

    parts: list[str] = [
        "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
        "Your book this week</div></td></tr>",
    ]

    sector_line = book_sector_summary_line(book_hits, sector_summary=sector_summary)
    if sector_line:
        parts.append(
            "<tr><td style='padding:0 20px 10px 20px'>"
            f"<p style='margin:0;font-size:13px;line-height:1.55;color:#4b5563'>{html.escape(sector_line)}</p>"
            "</td></tr>"
        )

    header = _table_header([("Ticker", "left"), ("Week", "right"), ("Price", "right")])
    table_rows = _book_movers_table(book_hits)
    if table_rows:
        parts.append(
            "<tr><td style='padding:0 20px 10px 20px'>"
            f"<table width='100%' cellpadding='0' cellspacing='0'>{header}{table_rows}</table>"
            "</td></tr>"
        )

    return "".join(parts)


def _sector_rows(sector_summary: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for item in sector_summary[:6]:
        sector = str(item.get("sector") or "Other")
        avg = float(item.get("avg_move_pct") or 0)
        count = int(item.get("count") or 0)
        rows.append(
            "<tr>"
            f"<td style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>{html.escape(sector)}</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:{_move_color(avg)}'>{_move_arrow(avg)} {abs(avg):.1f}%</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af'>{count} names</td>"
            "</tr>"
        )
    return "".join(rows)


def _earnings_rows(events: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for event in events[:5]:
        ticker = str(event.get("ticker") or "").strip().upper()
        date = str(event.get("event_date") or "").strip()
        if not ticker or not date:
            continue
        when = str(event.get("time") or "").strip().lower()
        when_label = {"bmo": "before open", "amc": "after close"}.get(when, when)
        timing = f" · {html.escape(when_label)}" if when_label else ""
        rows.append(
            "<tr><td style='padding:8px 0;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>"
            f"<span style='font-weight:800;color:#111827'>{html.escape(ticker)}</span>"
            f" — {html.escape(date)}{timing}"
            "</td></tr>"
        )
    return "".join(rows)


def build_weekly_brief_email(
    *,
    first_name: str,
    weekly: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None = None,
    market_phase_line: str | None = None,
    upcoming_earnings: list[dict[str, Any]] | None = None,
    weekly_stories: dict[str, Any] | None = None,
) -> tuple[str, str]:
    weekly = weekly or {}
    rows = rows or []
    by_ticker: dict[str, dict[str, Any]] = weekly.get("by_ticker") or {}
    week_label = str(weekly.get("week_label") or "This week")

    book_hits: list[tuple[dict[str, Any], dict[str, Any], float]] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        hit = by_ticker.get(ticker)
        if not ticker or not hit:
            continue
        move = float(hit.get("week_change_pct") or 0.0)
        if abs(move) < WEEKLY_BOOK_MOVE_THRESHOLD:
            continue
        book_hits.append((row, hit, move))
    book_hits.sort(key=lambda item: abs(item[2]), reverse=True)

    gainers = sorted(
        list(weekly.get("movers_up") or []),
        key=lambda row: float(row.get("week_change_pct") or 0),
        reverse=True,
    )[:5]
    losers = sorted(
        list(weekly.get("movers_down") or []),
        key=lambda row: float(row.get("week_change_pct") or 0),
    )[:5]
    sector_summary = list(weekly.get("sector_summary") or [])
    indices = weekly.get("indices") or {}
    earnings = list(upcoming_earnings or [])
    stories_payload = weekly_stories or {}
    stories = [
        item
        for item in list(stories_payload.get("stories") or [])
        if isinstance(item, dict) and clean_optional_email_text(item.get("story"))
    ]
    week_lede = clean_optional_email_text(stories_payload.get("week_lede"), max_chars=180)

    if stories:
        top = stories[0]
        sym = str(top.get("ticker") or "").upper()
        top_move = float(top.get("week_change_pct") or 0)
        subject = f"{sym} {_move_arrow(top_move)} {abs(top_move):.1f}% · stories of the week"
    elif book_hits:
        top_ticker, _top_hit, top_move = book_hits[0]
        sym = str(top_ticker.get("ticker") or "").upper()
        subject = f"{sym} {_move_arrow(top_move)} {abs(top_move):.1f}% this week"
        if len(book_hits) > 1:
            subject += f" · {len(book_hits)} on your book"
    else:
        subject = f"Weekly market report · {week_label}"

    hi = f"{first_name}, " if first_name and first_name != "there" else ""
    if week_lede:
        intro = f"{hi}{week_lede}"
    elif book_hits:
        intro = f"{hi}{len(book_hits)} names on your book had a big week."
    else:
        intro = f"{hi}here's how the week wrapped up."

    phase_line = clean_optional_email_text(market_phase_line)
    phase_block = ""
    if phase_line:
        phase_block = (
            f"<div style='margin-top:10px;font-size:13px;color:#065f46;font-weight:600'>"
            f"{html.escape(phase_line)}</div>"
        )

    sections: list[str] = []
    indices_block = _indices_row(indices if isinstance(indices, dict) else {})
    if indices_block:
        sections.append(indices_block)

    stories_block = _weekly_stories_section(stories)
    if stories_block:
        sections.append(stories_block)

    book_block = _book_section(book_hits, sector_summary=sector_summary)
    if book_block:
        sections.append(book_block)

    movers_block = _movers_section(gainers, losers)
    if movers_block:
        sections.append(movers_block)

    if sector_summary:
        sections.append(
            "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
            "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
            "Sectors this week</div></td></tr>"
            "<tr><td style='padding:0 20px 12px 20px'>"
            "<table width='100%' cellpadding='0' cellspacing='0'>"
            + _table_header([("Sector", "left"), ("Avg week", "right"), ("", "right")])
            + _sector_rows(sector_summary)
            + "</table></td></tr>"
        )

    earnings_rows = _earnings_rows(earnings)
    if earnings_rows:
        sections.append(
            "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
            "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
            "Earnings on your book next week</div></td></tr>"
            f"<tr><td style='padding:0 20px 12px 20px'><table width='100%' cellpadding='0' cellspacing='0'>{earnings_rows}</table></td></tr>"
        )

    body = f"""
      <tr><td style="padding:24px 20px 8px 20px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase">Weekly report</div>
        <div style="margin-top:8px;font-size:24px;font-weight:800;color:#111827;letter-spacing:-0.03em">{html.escape(week_label)}</div>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#374151">{html.escape(intro)}</p>
        {phase_block}
      </td></tr>
      {''.join(sections)}
      <tr><td style="padding:16px 20px 24px 20px;border-top:1px solid #f3f4f6">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="{html.escape(APP_URL)}/watchlist" style="display:inline-block;padding:13px 28px;background:#065f46;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">Open Watchlist</a>
        </td></tr></table>
        <div style="margin-top:12px;text-align:center;font-size:13px;color:#9ca3af">
          <a href="{html.escape(APP_URL)}/pulse" style="color:#065f46;text-decoration:none;font-weight:600">Full pulse board →</a>
        </div>
      </td></tr>"""

    return subject, email_shell(title=subject, body_html=body, footer=DIGEST_FOOTER, max_width=DIGEST_WIDTH)


def build_weekly_brief_for_user(
    *,
    display_name: str | None,
    email: str,
    weekly: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None,
    market_phase_line: str | None = None,
    upcoming_earnings: list[dict[str, Any]] | None = None,
    weekly_stories: dict[str, Any] | None = None,
) -> tuple[str, str]:
    first_name = first_name_from_profile(display_name=display_name, email=email)
    return build_weekly_brief_email(
        first_name=first_name,
        weekly=weekly,
        rows=rows,
        market_phase_line=market_phase_line,
        upcoming_earnings=upcoming_earnings,
        weekly_stories=weekly_stories,
    )
