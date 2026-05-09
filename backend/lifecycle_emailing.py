"""Lifecycle email templates + Brevo sender for Tikrr."""
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from backend.env import load_backend_env

load_backend_env()

BREVO_API = "https://api.brevo.com/v3/smtp/email"
FROM_EMAIL = "yourtrace.online@gmail.com"
FROM_NAME = "Tikrr"
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://www.tikrr.online").rstrip("/")
EMAIL_PREVIEWS_DIR = Path(__file__).resolve().parent / "email_previews"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def send_email(to: str, subject: str, html_body: str) -> bool:
    api_key = os.environ.get("BREVO_API_KEY")
    if not api_key:
        print("[skip] BREVO_API_KEY not set")
        return False
    try:
        import requests

        resp = requests.post(
            BREVO_API,
            headers={"api-key": api_key, "Content-Type": "application/json"},
            json={
                "sender": {"email": FROM_EMAIL, "name": FROM_NAME},
                "to": [{"email": to}],
                "subject": subject,
                "htmlContent": html_body,
            },
            timeout=12,
        )
        if resp.status_code in (200, 201):
            return True
        print(f"[brevo] error {resp.status_code}: {resp.text[:240]}")
        return False
    except Exception as exc:
        print(f"[brevo] exception: {exc}")
        return False


def _card(title: str, lines: list[str], cta_label: str, cta_url: str, kicker: str = "Tikrr") -> str:
    body = "".join([f"<p style='margin:0 0 10px 0;font-size:14px;line-height:1.55;color:#374151'>{line}</p>" for line in lines])
    return f"""<!doctype html><html><body style=\"margin:0;padding:0;background:#f3f4f6\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"padding:28px 14px\"><tr><td align=\"center\">
<table width=\"560\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fff;border:1px solid #e5e7eb;border-radius:16px\">
<tr><td style=\"padding:22px 22px 8px 22px;font:600 12px Arial;color:#6b7280;letter-spacing:.08em;text-transform:uppercase\">{kicker}</td></tr>
<tr><td style=\"padding:0 22px 10px 22px;font:600 24px Arial;color:#111827;line-height:1.2\">{title}</td></tr>
<tr><td style=\"padding:0 22px 6px 22px\">{body}</td></tr>
<tr><td style=\"padding:8px 22px 22px 22px\"><a href=\"{cta_url}\" style=\"display:inline-block;background:#111827;color:#fff;text-decoration:none;font:600 13px Arial;padding:11px 16px;border-radius:999px\">{cta_label} →</a></td></tr>
</table></td></tr></table></body></html>"""


def email_track_blocked(ticker: str | None = None) -> tuple[str, str]:
    subject = f"Your AI Radar for {ticker or 'this stock'} is one click away"
    html = _card(
        title=f"Unlock Radar for {ticker or 'this stock'}",
        lines=[
            "You just tried to add a stock to Radar.",
            "Radar tracking runs personal AI briefs twice daily, so this is a Pro feature.",
            "Upgrade now to track holdings, watchlist names, and get AI stance updates.",
        ],
        cta_label="See Pro plans",
        cta_url=f"{APP_URL}/subscribe",
        kicker="Radar locked",
    )
    return subject, html


def email_checkout_abandoned(plan: str | None = None) -> tuple[str, str]:
    plan_label = "yearly" if plan == "yearly" else "monthly"
    subject = "Complete Pro unlock for your Radar"
    html = _card(
        title="Finish your Pro checkout",
        lines=[
            f"Your {plan_label} checkout was started but not completed.",
            "Once active, Radar, AI briefs, and full heat/screen views unlock instantly.",
            "Pick up where you left off in under a minute.",
        ],
        cta_label="Complete checkout",
        cta_url=f"{APP_URL}/subscribe",
        kicker="Checkout pending",
    )
    return subject, html


def email_free_high_intent(tickers: list[str]) -> tuple[str, str]:
    focus = ", ".join(tickers[:3]) if tickers else "your watched stocks"
    subject = f"Stop scanning headlines. Get a stance on {tickers[0] if tickers else 'your stocks'}"
    html = _card(
        title="You’ve been researching the same names",
        lines=[
            f"Recent activity: {focus}.",
            "Use Pro Radar to turn those names into tracked positions with AI coverage.",
            "You’ll get clear catalysts, risks, and what changed since last brief.",
        ],
        cta_label="Unlock Pro Radar",
        cta_url=f"{APP_URL}/subscribe",
        kicker="High intent detected",
    )
    return subject, html


def email_free_alert_teaser(ticker: str) -> tuple[str, str]:
    subject = f"Get emailed the moment {ticker} crosses your level"
    html = _card(
        title=f"Set instant alert coverage for {ticker}",
        lines=[
            "You’ve checked this stock multiple times recently.",
            "With Pro, you can set price alerts and get notified the moment thresholds break.",
            "No need to keep refreshing the page.",
        ],
        cta_label="Unlock alerts",
        cta_url=f"{APP_URL}/subscribe",
        kicker="Alert teaser",
    )
    return subject, html


def email_pro_welcome() -> tuple[str, str]:
    subject = "Pro is active. Do these 3 things now"
    html = _card(
        title="You’re in. Radar is unlocked.",
        lines=[
            "1) Add your core holdings to Radar.",
            "2) Add watchlist names you’re stalking.",
            "3) Set at least one price alert so you never miss a break.",
        ],
        cta_label="Open Radar",
        cta_url=f"{APP_URL}/watchlist",
        kicker="Pro active",
    )
    return subject, html


def email_pro_daily_digest(rows: list[dict[str, Any]], market_snapshot_rows: list[dict[str, Any]] | None = None) -> tuple[str, str]:
    def _num(v: Any) -> float:
        try:
            return float(v)
        except Exception:
            return 0.0

    def _price(v: Any) -> str:
        n = _num(v)
        return f"${n:,.2f}"

    def _pct(v: float) -> str:
        arrow = "▲" if v >= 0 else "▼"
        color = "#10b981" if v >= 0 else "#ef4444"
        return f"<span style='font-size:12px;font-weight:600;color:{color}'>{arrow} {v:+.2f}%</span>"

    def _abs(v: Any) -> str:
        n = _num(v)
        color = "#10b981" if n >= 0 else "#ef4444"
        return f"<span style='font-size:11px;color:{color}'>{n:+.2f}</span>"

    def _logo(ticker: str) -> str:
        return (
            f"<img src='https://financialmodelingprep.com/image-stock/{ticker}.png' width='42' height='42' "
            "style='border-radius:10px;object-fit:contain;background:#ffffff;border:1px solid #e5e7eb;padding:2px;display:block' />"
        )

    def _directive(row: dict[str, Any]) -> str:
        # Keep this field strictly directive-first.
        text = str(row.get("ai_directive_text") or "").strip()
        if text:
            return text
        for key in ("suggested_action", "directive", "action"):
            value = row.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                text = str(value.get("text") or "").strip()
                if text:
                    return text
        return "Hold, watch closely."

    def _ai_take(row: dict[str, Any]) -> str:
        rationale = str(row.get("ai_directive_rationale") or "").strip()
        if rationale:
            return rationale
        news = row.get("news_velocity") or {}
        mentions = int(_num(news.get("mentions_1d"))) if isinstance(news, dict) else 0
        catalysts = row.get("catalysts") or []
        catalyst_text = ""
        if isinstance(catalysts, list) and catalysts:
            c0 = catalysts[0] if isinstance(catalysts[0], dict) else {}
            catalyst_text = str(c0.get("title") or c0.get("kind") or "").strip()

        parts: list[str] = []
        if catalyst_text:
            parts.append(catalyst_text[:70])
        if mentions > 0:
            parts.append(f"{mentions} headline{'s' if mentions != 1 else ''} today")

        if not parts:
            return "Nothing unusual today. Keep watching trend and risk."
        if len(parts) == 1:
            return parts[0] + "."
        return f"{parts[0]}. {parts[1]}."

    def _chip(row: dict[str, Any]) -> str:
        cats = row.get("catalysts") or []
        if isinstance(cats, list) and cats:
            c0 = cats[0] if isinstance(cats[0], dict) else {}
            title = str(c0.get("title") or c0.get("kind") or "").strip().upper()
            if title:
                tone = "#b45309"
                return (
                    f"<div style='font-size:10px;font-weight:700;color:{tone};text-transform:uppercase;"
                    f"letter-spacing:0.06em;margin-top:2px'>{title[:34]}</div>"
                )
        return ""

    def _market_wildcards(
        market_rows: list[dict[str, Any]] | None,
        used_tickers: set[str],
        max_items: int = 3,
    ) -> list[dict[str, Any]]:
        if not market_rows:
            return []
        candidates: list[dict[str, Any]] = []
        for row in market_rows:
            ticker = str(row.get("ticker") or row.get("symbol") or "").strip().upper()
            if not ticker or ticker in used_tickers:
                continue
            day_change_pct = _num(row.get("day_change_pct"))
            if day_change_pct == 0:
                day_change_pct = _num(row.get("change_pct"))
            if day_change_pct == 0:
                continue
            price_value = row.get("price")
            if price_value in (None, ""):
                price_value = row.get("current")
            day_change_abs = row.get("day_change_abs")
            if day_change_abs in (None, ""):
                day_change_abs = row.get("change_abs")
            candidates.append(
                {
                    "ticker": ticker,
                    "price": price_value,
                    "day_change_pct": day_change_pct,
                    "day_change_abs": day_change_abs,
                    "ai_directive_text": "Market momentum check",
                    "ai_directive_rationale": "Added from broad market movers so your digest still highlights fresh action.",
                    "catalysts": row.get("catalysts") or [],
                }
            )
        candidates.sort(key=lambda r: abs(_num(r.get("day_change_pct"))), reverse=True)
        return candidates[:max_items]

    holdings = [r for r in rows if str(r.get("position_type") or "").lower() == "holding"]
    watchlist = [r for r in rows if str(r.get("position_type") or "").lower() != "holding"]
    holdings_sorted = sorted(holdings, key=lambda r: abs(_num(r.get("day_change_pct"))), reverse=True)
    watchlist_sorted = sorted(watchlist, key=lambda r: abs(_num(r.get("day_change_pct"))), reverse=True)

    used: set[str] = set()
    hold_top = holdings_sorted[:3]
    watch_top = watchlist_sorted[:3]
    for row in hold_top + watch_top:
        t = str(row.get("ticker") or "").strip().upper()
        if t:
            used.add(t)

    rest = [r for r in rows if str(r.get("ticker") or "").strip().upper() not in used]
    wild_top = sorted(rest, key=lambda r: abs(_num(r.get("day_change_pct"))), reverse=True)[:3]

    def _rows_block(items: list[dict[str, Any]], section_title: str) -> str:
        blocks: list[str] = [
            f"<tr><td style='padding:14px 32px 8px 32px'><div style='font-size:12px;font-weight:700;color:#9ca3af;"
            f"letter-spacing:0.12em;text-transform:uppercase'>{section_title}</div></td></tr>"
        ]
        for idx, row in enumerate(items):
            ticker = str(row.get("ticker") or "-").upper()
            chg = _num(row.get("day_change_pct"))
            blocks.append(
                f"<tr><td style='padding:12px 32px'><table width='100%' cellpadding='0' cellspacing='0'><tr>"
                f"<td style='vertical-align:middle;width:48px'>{_logo(ticker)}</td>"
                f"<td style='padding-left:14px;vertical-align:middle'>"
                f"<div style='font-size:15px;font-weight:700;color:#111111'>{ticker}</div>{_chip(row)}</td>"
                f"<td style='text-align:right;vertical-align:middle'>"
                f"<div style='font-size:15px;font-weight:700;color:#111111'>{_price(row.get('price'))}</div>"
                f"{_pct(chg)}<div>{_abs(row.get('day_change_abs'))}</div></td></tr>"
                f"<tr><td colspan='3' style='padding-top:10px;padding-bottom:4px'>"
                f"<div style='background:#f8f9fa;"
                f"border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:#374151;line-height:1.55'>"
                f"<strong style='color:#111111'>{_directive(row)}</strong> {_ai_take(row)}</div></td></tr></table></td></tr>"
            )
            if idx != len(items) - 1:
                blocks.append("<tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>")
        return "".join(blocks)

    def _empty_state_block(section_title: str, title: str, body: str) -> str:
        return (
            f"<tr><td style='padding:14px 32px 8px 32px'><div style='font-size:12px;font-weight:700;color:#9ca3af;"
            f"letter-spacing:0.12em;text-transform:uppercase'>{section_title}</div></td></tr>"
            f"<tr><td style='padding:0 32px 12px 32px'>"
            f"<div style='background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px'>"
            f"<div style='font-size:13px;font-weight:700;color:#111827;margin-bottom:4px'>{title}</div>"
            f"<div style='font-size:13px;color:#6b7280;line-height:1.5'>{body}</div>"
            f"</div></td></tr>"
        )

    wild_items = wild_top
    if not wild_items:
        wild_items = _market_wildcards(market_snapshot_rows, used, max_items=3)

    sections: list[str] = []
    if hold_top:
        sections.append(_rows_block(hold_top, "Holdings · Movers & AI take"))
    elif watch_top:
        sections.append(
            _empty_state_block(
                "Holdings · Movers & AI take",
                "No holdings added yet",
                "Add core holdings in Radar to get stronger position-first guidance here.",
            )
        )

    if watch_top:
        sections.append(_rows_block(watch_top, "Watchlist · Movers & AI take"))
    elif hold_top:
        sections.append(
            _empty_state_block(
                "Watchlist · Movers & AI take",
                "Watchlist is empty",
                "Add a few stalking names so tomorrow's digest includes idea flow beyond holdings.",
            )
        )

    if wild_items:
        sections.append(_rows_block(wild_items, "Wild cards · Big movers"))
    else:
        sections.append(
            _empty_state_block(
                "Wild cards · Big movers",
                "No additional movers yet",
                "We'll fill this section when broader market names show unusual momentum.",
            )
        )

    sections_html = "<tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>".join(sections)

    if hold_top and watch_top:
        intro = "Here's what moved across your holdings and watchlist, plus three wildcard movers from your Radar."
    elif watch_top:
        intro = "You have watchlist movement today. Add holdings to make this digest even more personalized."
    elif hold_top:
        intro = "Holdings are moving today. Add watchlist names to broaden idea flow in this digest."
    else:
        intro = "Radar is quiet right now. We still surface useful movers so tomorrow's setup is easier."

    subject = "Your daily Radar pulse"
    html = f"""<!doctype html><html lang='en'><head><meta charset='UTF-8' /><meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>Your daily Radar pulse — Tikrr</title></head>
<body style='margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif'>
  <table width='100%' cellpadding='0' cellspacing='0' style='padding:32px 16px'><tr><td align='center'>
    <table width='580' cellpadding='0' cellspacing='0'><tr><td style='padding-bottom:20px'>
      <span style='font-size:24px;font-weight:800;color:#111111;letter-spacing:-0.05em'>tikrr</span></td></tr></table>
    <table width='580' cellpadding='0' cellspacing='0' style='background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden'>
      <tr><td style='padding:28px 32px 20px 32px'>
        <div style='font-size:30px;font-weight:800;color:#111111;line-height:1.15;letter-spacing:-0.03em;margin-bottom:8px'>Your Radar today</div>
        <div style='font-size:15px;color:#6b7280;line-height:1.6'>{intro}</div></td></tr>
      <tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>
      {sections_html}
      <tr><td style='padding:24px 32px 32px 32px'><a href='{APP_URL}/watchlist' style='display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:999px;letter-spacing:-0.01em'>Open Radar &rarr;</a>
      <div style='margin-top:10px;font-size:12px;color:#9ca3af'>Next digest tomorrow morning. AI briefs refresh twice daily.</div></td></tr>
    </table>
  </td></tr></table></body></html>"""
    return subject, html
