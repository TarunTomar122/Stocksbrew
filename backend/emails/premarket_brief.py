from __future__ import annotations

import html
from datetime import date
from typing import Any

from backend.email import APP_URL, first_name_from_profile
from backend.email_content import clean_optional_email_text, limit_optional_email_sentences
from backend.emails._assets import logo_img, ticker_with_logo
from backend.emails._shell import email_shell
from backend.emails._theme import BEARISH, BODY, BULLISH, DIVIDER, INK, MUTED, PRIMARY
from backend.emails.price_alert import _fmt_price, quote_ticker
from backend.premarket_intel import PREMARKET_GAP_THRESHOLD, context_row_matches_ticker

DIGEST_WIDTH = 640
DIGEST_FOOTER = (
    "You receive the pre-market brief as a Pro subscriber. "
    f"<a href='{APP_URL}/profile' style='color:{PRIMARY};text-decoration:none;font-weight:600'>"
    "Email preferences</a>"
    " · Not investment advice."
)


def _gap_color(gap: float) -> str:
    return BULLISH if gap >= 0 else BEARISH


def _gap_arrow(gap: float) -> str:
    return "▲" if gap >= 0 else "▼"


def _context_tape_line(ctx: dict[str, Any]) -> str:
    return limit_optional_email_sentences(ctx.get("tape_line"))


def _table_header(cells: list[tuple[str, str]]) -> str:
    heads = "".join(
        f"<th align='{align}' style='padding:8px 6px;font-size:10px;font-weight:700;"
        f"letter-spacing:0.08em;color:{MUTED};text-transform:uppercase;border-bottom:1px solid {DIVIDER}'>"
        f"{html.escape(label)}</th>"
        for label, align in cells
    )
    return f"<tr>{heads}</tr>"


def _market_table_rows(gappers: list[dict[str, Any]], *, limit: int = 5) -> str:
    rows: list[str] = []
    for row in gappers[:limit]:
        ticker = str(row.get("ticker") or "").strip().upper()
        gap = float(row.get("pre_market_change_pct") or 0)
        pre = _fmt_price(row.get("pre_market_price")) or "—"
        rows.append(
            "<tr>"
            f"<td style='padding:9px 6px;border-top:1px solid {DIVIDER};font-size:14px;font-weight:700;color:{INK}'>{ticker_with_logo(ticker=ticker, logo_url=row.get('logo_url'))}</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid {DIVIDER};font-size:13px;font-weight:700;color:{_gap_color(gap)}'>{_gap_arrow(gap)} {abs(gap):.1f}%</td>"
            f"<td align='right' style='padding:9px 6px;border-top:1px solid {DIVIDER};font-size:13px;color:{BODY}'>{html.escape(pre)}</td>"
            "</tr>"
        )
    return "".join(rows)


def _movers_section(gainers: list[dict[str, Any]], losers: list[dict[str, Any]]) -> str:
    if not gainers and not losers:
        return ""
    parts: list[str] = [
        f"<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid {DIVIDER}'>"
        f"<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:{MUTED};text-transform:uppercase'>"
        "Biggest pre-market movers</div></td></tr>",
    ]
    header = _table_header([("Ticker", "left"), ("Gap", "right"), ("Pre-mkt", "right")])
    if gainers:
        parts.append(
            "<tr><td style='padding:4px 20px 2px 20px'>"
            f"<div style='font-size:12px;font-weight:700;color:{BULLISH}'>Top gainers</div></td></tr>"
            "<tr><td style='padding:0 20px 10px 20px'>"
            f"<table width='100%' cellpadding='0' cellspacing='0'>{header}{_market_table_rows(gainers)}</table>"
            "</td></tr>"
        )
    if losers:
        parts.append(
            "<tr><td style='padding:4px 20px 2px 20px'>"
            f"<div style='font-size:12px;font-weight:700;color:{BEARISH}'>Top losers</div></td></tr>"
            "<tr><td style='padding:0 20px 8px 20px'>"
            f"<table width='100%' cellpadding='0' cellspacing='0'>{header}{_market_table_rows(losers)}</table>"
            "</td></tr>"
        )
    return "".join(parts)


def _news_section_rows(
    tickers: list[str],
    context_by_ticker: dict[str, dict[str, Any]],
    overnight_by_ticker: dict[str, dict[str, Any]],
    company_by_ticker: dict[str, str],
    logo_by_ticker: dict[str, str],
) -> str:
    items: list[str] = []
    seen: set[str] = set()
    for ticker in tickers:
        sym = ticker.upper()
        if sym in seen:
            continue
        tape_line = ""
        for ctx in (context_by_ticker.get(sym), overnight_by_ticker.get(sym)):
            if isinstance(ctx, dict):
                if not context_row_matches_ticker(
                    ctx,
                    sym,
                    company_by_ticker.get(sym, ""),
                ):
                    continue
                tape_line = _context_tape_line(ctx)
            if tape_line:
                break
        if not tape_line:
            continue
        seen.add(sym)
        items.append(
            f"<tr><td style='padding:8px 0;border-top:1px solid {DIVIDER}'>"
            "<table cellpadding='0' cellspacing='0'><tr>"
            f"<td width='30'>{logo_img(ticker=sym, logo_url=logo_by_ticker.get(sym), size=20)}</td>"
            f"<td style='font-size:14px;font-weight:800;color:{INK}'>{html.escape(sym)}</td>"
            "</tr></table>"
            f"<div style='margin-top:6px;font-size:13px;line-height:1.55;color:{BODY}'>{html.escape(tape_line)}</div>"
            "</td></tr>"
        )
        if len(items) >= 6:
            break
    return "".join(items)


def _sector_rows(sector_summary: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for item in sector_summary[:6]:
        sector = str(item.get("sector") or "Other")
        avg = float(item.get("avg_gap_pct") or 0)
        count = int(item.get("count") or 0)
        rows.append(
            "<tr>"
            f"<td style='padding:8px 6px;border-top:1px solid {DIVIDER};font-size:13px;color:{BODY}'>{html.escape(sector)}</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid {DIVIDER};font-size:13px;font-weight:700;color:{_gap_color(avg)}'>{_gap_arrow(avg)} {abs(avg):.1f}%</td>"
            f"<td align='right' style='padding:8px 6px;border-top:1px solid {DIVIDER};font-size:12px;color:{MUTED}'>{count} names</td>"
            "</tr>"
        )
    return "".join(rows)


def build_premarket_brief_email(
    *,
    first_name: str,
    premarket: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None = None,
    market_phase_line: str | None = None,
    premarket_context: dict[str, Any] | None = None,
    overnight_headlines: dict[str, dict[str, Any]] | None = None,
) -> tuple[str, str]:
    premarket = premarket or {}
    rows = rows or []
    context_by_ticker = (premarket_context or {}).get("by_ticker") or {}
    overnight_by_ticker = overnight_headlines or {}
    by_ticker: dict[str, dict[str, Any]] = premarket.get("by_ticker") or {}

    book_hits: list[tuple[dict[str, Any], dict[str, Any], float]] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        hit = by_ticker.get(ticker)
        if not ticker or not hit:
            continue
        gap = float(hit.get("pre_market_change_pct") or 0.0)
        if abs(gap) < PREMARKET_GAP_THRESHOLD:
            continue
        book_hits.append((row, hit, gap))
    book_hits.sort(key=lambda item: abs(item[2]), reverse=True)

    gainers = sorted(
        list(premarket.get("gappers_up") or []),
        key=lambda row: float(row.get("pre_market_change_pct") or 0),
        reverse=True,
    )[:5]
    losers = sorted(
        list(premarket.get("gappers_down") or []),
        key=lambda row: float(row.get("pre_market_change_pct") or 0),
    )[:5]
    sector_summary = list(premarket.get("sector_summary") or [])

    news_tickers = [
        str(row.get("ticker") or "").strip().upper()
        for row, _, _ in book_hits[:8]
        if str(row.get("ticker") or "").strip()
    ]
    company_by_ticker = {
        str(row.get("ticker") or "").strip().upper(): str(
            row.get("instrument_name")
            or row.get("name")
            or row.get("display_name")
            or row.get("ticker")
            or ""
        ).strip()
        for row in rows
        if str(row.get("ticker") or "").strip()
    }
    logo_by_ticker = {
        str(row.get("ticker") or "").strip().upper(): str(row.get("logo_url") or "").strip()
        for row in rows
        if str(row.get("ticker") or "").strip()
    }
    news_rows = _news_section_rows(
        news_tickers,
        context_by_ticker,
        overnight_by_ticker,
        company_by_ticker,
        logo_by_ticker,
    )

    emoji = ("☀️", "👀", "☕")[date.today().toordinal() % 3]
    if book_hits:
        top_ticker, _top_hit, top_gap = book_hits[0]
        sym = str(top_ticker.get("ticker") or "").upper()
        subject = f"{emoji} Before the bell: {sym} {_gap_arrow(top_gap)} {abs(top_gap):.1f}%"
        if len(book_hits) > 1:
            subject += f" · {len(book_hits)} on your book"
    else:
        subject = f"{emoji} What's moving before the bell"

    hi = f"{first_name}, " if first_name and first_name != "there" else ""
    if book_hits:
        count = len(book_hits)
        intro = f"{hi}{count} {'name is' if count == 1 else 'names are'} gapping pre-market."
    else:
        intro = f"{hi}here are the biggest pre-market movers before the open."

    phase_line = clean_optional_email_text(market_phase_line)
    phase_block = ""
    if phase_line:
        phase_block = (
            f"<div style='margin-top:10px;font-size:13px;color:{PRIMARY};font-weight:600'>"
            f"{html.escape(phase_line)}</div>"
        )

    sections: list[str] = []

    if news_rows:
        sections.append(
            "<tr><td style='padding:18px 20px 6px 20px'>"
            f"<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:{MUTED};text-transform:uppercase'>"
            "News on your book</div></td></tr>"
            f"<tr><td style='padding:0 20px 8px 20px'><table width='100%' cellpadding='0' cellspacing='0'>{news_rows}</table></td></tr>"
        )

    movers_block = _movers_section(gainers, losers)
    if movers_block:
        sections.append(movers_block)

    if sector_summary:
        sections.append(
            f"<tr><td style='padding:18px 20px 6px 20px;border-top:1px solid {DIVIDER}'>"
            f"<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:{MUTED};text-transform:uppercase'>"
            "Sectors pre-market</div></td></tr>"
            "<tr><td style='padding:0 20px 12px 20px'>"
            "<table width='100%' cellpadding='0' cellspacing='0'>"
            + _table_header([("Sector", "left"), ("Avg gap", "right"), ("", "right")])
            + _sector_rows(sector_summary)
            + "</table></td></tr>"
        )

    body = f"""
      <tr><td style="padding:24px 20px 8px 20px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{MUTED};text-transform:uppercase">Pre-market brief</div>
        <div style="margin-top:8px;font-size:24px;font-weight:800;color:{INK};letter-spacing:-0.03em">Before the open</div>
        <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:{BODY}">{html.escape(intro)}</p>
        {phase_block}
      </td></tr>
      {''.join(sections)}
      <tr><td style="padding:16px 20px 24px 20px;border-top:1px solid {DIVIDER}">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="{html.escape(APP_URL)}/watchlist" style="display:inline-block;padding:13px 28px;background:{PRIMARY};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">Open Watchlist</a>
        </td></tr></table>
        <div style="margin-top:12px;text-align:center;font-size:13px;color:{MUTED}">
          <a href="{html.escape(APP_URL)}/pulse" style="color:{PRIMARY};text-decoration:none;font-weight:600">Full pre-market board →</a>
        </div>
      </td></tr>"""

    return subject, email_shell(title=subject, body_html=body, footer=DIGEST_FOOTER, max_width=DIGEST_WIDTH)


def build_premarket_brief_for_user(
    *,
    display_name: str | None,
    email: str,
    premarket: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None,
    market_phase_line: str | None = None,
    premarket_context: dict[str, Any] | None = None,
    overnight_headlines: dict[str, dict[str, Any]] | None = None,
) -> tuple[str, str]:
    first_name = first_name_from_profile(display_name=display_name, email=email)
    return build_premarket_brief_email(
        first_name=first_name,
        premarket=premarket,
        rows=rows,
        market_phase_line=market_phase_line,
        premarket_context=premarket_context,
        overnight_headlines=overnight_headlines,
    )
