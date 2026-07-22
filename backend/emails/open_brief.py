from __future__ import annotations

import html
from typing import Any
from zoneinfo import ZoneInfo

from backend.email import APP_URL, first_name_from_profile
from backend.email_content import clean_optional_email_text
from backend.emails._shell import email_shell
from backend.emails.price_alert import _fmt_price
from backend.open_email_intel import (
    OPEN_BOOK_MOVE_THRESHOLD,
    anomaly_tape_line,
    fresh_anomaly_rows,
    parse_iso_datetime,
)

DIGEST_WIDTH = 640
DIGEST_FOOTER = (
    "You receive the open brief as a Pro subscriber. "
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
        "Biggest open movers</div></td></tr>",
    ]
    header = _table_header([("Ticker", "left"), ("Move", "right"), ("Price", "right")])
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


def _news_section_rows(book_hits: list[tuple[dict[str, Any], dict[str, Any], float]]) -> str:
    items: list[str] = []
    for row, anomaly, _move in book_hits[:6]:
        ticker = str(row.get("ticker") or anomaly.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        tape = anomaly_tape_line(anomaly)
        if not tape:
            continue
        items.append(
            "<tr><td style='padding:8px 0;border-top:1px solid #f3f4f6'>"
            f"<span style='font-size:14px;font-weight:800;color:#111827'>{html.escape(ticker)}</span>"
            f"<span style='font-size:13px;color:#4b5563'> — {html.escape(tape)}</span>"
            "</td></tr>"
        )
    return "".join(items)


def _sector_rows(sector_summary: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for item in sector_summary[:6]:
        sector = str(item.get("sector") or "Other")
        avg = float(item.get("avg_move_pct") or 0)
        count = int(item.get("count") or 0)
        coverage = f"{count} stock" if count == 1 else f"{count} stocks"
        rows.append(
            "<tr>"
            f"<td style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:13px;color:#374151'>{html.escape(sector)}</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:700;color:{_move_color(avg)}'>{_move_arrow(avg)} {abs(avg):.1f}%</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af'>{coverage}</td>"
            "</tr>"
        )
    return "".join(rows)


def _sector_as_of(value: Any, market: str) -> str:
    parsed = parse_iso_datetime(value)
    if parsed is None:
        return ""
    market_key = str(market or "US").upper()
    tz_name = "Asia/Kolkata" if market_key == "IN" else "America/New_York"
    suffix = "IST" if market_key == "IN" else "ET"
    local = parsed.astimezone(ZoneInfo(tz_name))
    time_label = local.strftime("%I:%M %p").lstrip("0")
    return f"As of {time_label} {suffix}"


def build_open_brief_email(
    *,
    first_name: str,
    anomalies_doc: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None = None,
    market_phase_line: str | None = None,
) -> tuple[str, str]:
    anomalies_doc = anomalies_doc or {}
    rows = rows or []
    all_anomalies = fresh_anomaly_rows(anomalies_doc)
    by_ticker = {
        str(row.get("ticker") or "").strip().upper(): row
        for row in all_anomalies
        if str(row.get("ticker") or "").strip()
    }

    book_hits: list[tuple[dict[str, Any], dict[str, Any], float]] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        anomaly = by_ticker.get(ticker)
        if not ticker or not anomaly:
            continue
        move = float(anomaly.get("day_change_pct") or 0.0)
        if abs(move) < OPEN_BOOK_MOVE_THRESHOLD:
            continue
        book_hits.append((row, anomaly, move))
    book_hits.sort(key=lambda item: abs(item[2]), reverse=True)

    gainers = sorted(
        [row for row in all_anomalies if float(row.get("day_change_pct") or 0) >= 0],
        key=lambda row: float(row.get("day_change_pct") or 0),
        reverse=True,
    )[:5]
    losers = sorted(
        [row for row in all_anomalies if float(row.get("day_change_pct") or 0) < 0],
        key=lambda row: float(row.get("day_change_pct") or 0),
    )[:5]
    sector_summary = [
        item for item in list(anomalies_doc.get("sector_summary") or []) if isinstance(item, dict)
    ]
    sector_quoted_count = int(anomalies_doc.get("sector_quoted_count") or 0)
    sector_as_of = _sector_as_of(
        anomalies_doc.get("sector_price_as_of") or anomalies_doc.get("generated_at"),
        str(anomalies_doc.get("market") or "US"),
    )

    news_rows = _news_section_rows(book_hits)

    if book_hits:
        top_ticker, _top_anomaly, top_move = book_hits[0]
        sym = str(top_ticker.get("ticker") or "").upper()
        subject = f"{sym} {_move_arrow(top_move)} {abs(top_move):.1f}% after the open"
        if len(book_hits) > 1:
            subject += f" · {len(book_hits)} on your book"
    else:
        subject = "Big movers after the open"

    hi = f"{first_name}, " if first_name and first_name != "there" else ""
    if book_hits:
        intro = f"{hi}{len(book_hits)} names on your book are moving sharply after the open."
    else:
        intro = f"{hi}here are the biggest movers in the first hour of trading."

    phase_line = clean_optional_email_text(market_phase_line)
    phase_block = ""
    if phase_line:
        phase_block = (
            f"<div style='margin-top:10px;font-size:13px;color:#065f46;font-weight:600'>"
            f"{html.escape(phase_line)}</div>"
        )

    sections: list[str] = []

    if news_rows:
        sections.append(
            "<tr><td style='padding:18px 20px 6px 20px'>"
            "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
            "Moves on your book</div></td></tr>"
            f"<tr><td style='padding:0 20px 8px 20px'><table width='100%' cellpadding='0' cellspacing='0'>{news_rows}</table></td></tr>"
        )

    movers_block = _movers_section(gainers, losers)
    if movers_block:
        sections.append(movers_block)

    sector_meta = " · ".join(
        part
        for part in (
            f"Fresh prices across {sector_quoted_count} stocks" if sector_quoted_count else "",
            sector_as_of,
        )
        if part
    )
    if sector_summary:
        sector_body = (
            "<tr><td style='padding:0 20px 12px 20px'>"
            "<table width='100%' cellpadding='0' cellspacing='0'>"
            + _table_header([("Sector", "left"), ("Avg move", "right"), ("Coverage", "right")])
            + _sector_rows(sector_summary)
            + "</table></td></tr>"
        )
        sections.append(
            "<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid #f3f4f6'>"
            "<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase'>"
            "Sector moves now</div>"
            + (
                f"<div style='margin-top:4px;font-size:11px;color:#9ca3af'>{html.escape(sector_meta)}</div>"
                if sector_meta
                else ""
            )
            + "</td></tr>"
            + sector_body
        )

    body = f"""
      <tr><td style="padding:24px 20px 8px 20px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase">Open brief</div>
        <div style="margin-top:8px;font-size:24px;font-weight:800;color:#111827;letter-spacing:-0.03em">After the open</div>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#374151">{html.escape(intro)}</p>
        {phase_block}
      </td></tr>
      {''.join(sections)}
      <tr><td style="padding:16px 20px 24px 20px;border-top:1px solid #f3f4f6">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="{html.escape(APP_URL)}/watchlist" style="display:inline-block;padding:13px 28px;background:#065f46;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">Open Radar</a>
        </td></tr></table>
        <div style="margin-top:12px;text-align:center;font-size:13px;color:#9ca3af">
          <a href="{html.escape(APP_URL)}/pulse" style="color:#065f46;text-decoration:none;font-weight:600">Full pulse board →</a>
        </div>
      </td></tr>"""

    return subject, email_shell(title=subject, body_html=body, footer=DIGEST_FOOTER, max_width=DIGEST_WIDTH)


def build_open_brief_for_user(
    *,
    display_name: str | None,
    email: str,
    anomalies_doc: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None,
    market_phase_line: str | None = None,
) -> tuple[str, str]:
    first_name = first_name_from_profile(display_name=display_name, email=email)
    return build_open_brief_email(
        first_name=first_name,
        anomalies_doc=anomalies_doc,
        rows=rows,
        market_phase_line=market_phase_line,
    )
