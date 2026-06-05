"""Lifecycle email templates + Brevo sender for stocksbrew."""
from __future__ import annotations

import os
import html
from urllib.parse import quote
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

from backend.env import load_backend_env

load_backend_env()

BREVO_API = "https://api.brevo.com/v3/smtp/email"
FROM_EMAIL = "yourtrace.online@gmail.com"
FROM_NAME = "stocksbrew"
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "https://www.stocksbrew.online").rstrip("/")
EMAIL_PREVIEWS_DIR = Path(__file__).resolve().parent / "email_previews"
PH_LAUNCH_TEMPLATE = "07_ph_personal_launch.html"
PH_LAUNCH_SUBJECT = "I launched on Product Hunt today and would love your take"
DEFAULT_PH_LAUNCH_URL = "https://www.producthunt.com/posts/stocksbrew"


def load_email_preview(filename: str) -> str:
    path = EMAIL_PREVIEWS_DIR / filename
    return path.read_text(encoding="utf-8")


def first_name_from_profile(*, display_name: str | None = None, email: str = "") -> str:
    raw = str(display_name or "").strip()
    if raw:
        token = raw.split()[0].strip(".,")
        if token:
            return token[:1].upper() + token[1:]
    local = str(email or "").split("@", 1)[0].strip()
    if local:
        token = local.replace(".", " ").replace("_", " ").split()[0]
        cleaned = "".join(ch for ch in token if ch.isalpha())
        if len(cleaned) >= 2:
            return cleaned[:1].upper() + cleaned[1:].lower()
    return "there"


def email_ph_personal_launch(
    *,
    first_name: str,
    product_hunt_url: str | None = None,
) -> tuple[str, str]:
    html = load_email_preview(PH_LAUNCH_TEMPLATE)
    html = html.replace("{{first_name}}", first_name)
    ph_url = str(product_hunt_url or os.environ.get("PH_LAUNCH_URL") or DEFAULT_PH_LAUNCH_URL).strip()
    html = html.replace(DEFAULT_PH_LAUNCH_URL, ph_url)
    return PH_LAUNCH_SUBJECT, html


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


def _card(title: str, lines: list[str], cta_label: str, cta_url: str, kicker: str = "stocksbrew") -> str:
    body = "".join([f"<p style='margin:0 0 10px 0;font-size:14px;line-height:1.55;color:#374151'>{line}</p>" for line in lines])
    return f"""<!doctype html><html><body style=\"margin:0;padding:0;background:#f3f4f6\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"padding:28px 14px\"><tr><td align=\"center\">
<table width=\"560\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fff;border:1px solid #e5e7eb;border-radius:16px\">
<tr><td style=\"padding:22px 22px 8px 22px;font:600 12px Arial;color:#6b7280;letter-spacing:.08em;text-transform:uppercase\">{kicker}</td></tr>
<tr><td style=\"padding:0 22px 10px 22px;font:600 24px Arial;color:#111827;line-height:1.2\">{title}</td></tr>
<tr><td style=\"padding:0 22px 6px 22px\">{body}</td></tr>
<tr><td style=\"padding:8px 22px 22px 22px\"><a href=\"{cta_url}\" style=\"display:inline-block;background:#111827;color:#fff;text-decoration:none;font:600 13px Arial;padding:11px 16px;border-radius:999px\">{cta_label} →</a></td></tr>
</table></td></tr></table></body></html>"""


def _esc(value: Any) -> str:
    return html.escape(str(value or ""))


def _rich_shell(
    *,
    title: str,
    eyebrow: str,
    intro: str,
    sections: list[str],
    cta_label: str,
    cta_url: str,
    footer: str = "You’re getting this because you use stocksbrew. Not investment advice. Not a broker.",
    secondary_cta_label: str | None = None,
    secondary_cta_url: str | None = None,
) -> str:
    ctas = [
        (
            f"<a href='{_esc(cta_url)}' style='display:inline-block;background:#111111;color:#ffffff;text-decoration:none;"
            f"font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px'>{_esc(cta_label)} &rarr;</a>"
        )
    ]
    if secondary_cta_label and secondary_cta_url:
        ctas.append(
            f"<a href='{_esc(secondary_cta_url)}' style='display:inline-block;margin-left:10px;color:#111111;"
            f"text-decoration:none;font-size:14px;font-weight:600'>{_esc(secondary_cta_label)} &rarr;</a>"
        )
    sections_html = "".join(sections)
    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>{_esc(title)}</title>
</head>
<body style='margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif'>
  <table width='100%' cellpadding='0' cellspacing='0' style='padding:32px 16px'><tr><td align='center'>
    <table width='580' cellpadding='0' cellspacing='0'>
      <tr><td style='padding-bottom:20px'><span style='font-size:24px;font-weight:800;color:#111111;letter-spacing:-0.05em'>stocksbrew</span></td></tr>
    </table>
    <table width='580' cellpadding='0' cellspacing='0' style='background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden'>
      <tr><td style='padding:32px'>
        <div style='font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:12px'>{_esc(eyebrow)}</div>
        <div style='font-size:30px;font-weight:800;color:#111111;line-height:1.15;letter-spacing:-0.03em;margin-bottom:10px'>{_esc(title)}</div>
        <div style='font-size:15px;color:#4b5563;line-height:1.65'>{intro}</div>
      </td></tr>
      {sections_html}
      <tr><td style='padding:24px 32px 32px 32px'>{"".join(ctas)}</td></tr>
    </table>
    <table width='580' cellpadding='0' cellspacing='0' style='margin-top:18px'>
      <tr><td style='font-size:12px;color:#9ca3af;line-height:1.7'>{footer}</td></tr>
    </table>
  </td></tr></table>
</body>
</html>"""


def _section(title: str, body: str) -> str:
    return (
        "<tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>"
        f"<tr><td style='padding:18px 32px 0 32px'><div style='font-size:12px;font-weight:700;color:#9ca3af;"
        f"letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px'>{_esc(title)}</div>"
        f"<div style='font-size:14px;color:#374151;line-height:1.65'>{body}</div></td></tr>"
    )


def _bullet_section(title: str, bullets: list[str]) -> str:
    items = "".join(
        f"<li style='margin:0 0 8px 18px'>{_esc(item)}</li>"
        for item in bullets
        if str(item or "").strip()
    )
    return _section(title, f"<ul style='padding:0;margin:0'>{items}</ul>")


def _is_bad_logo_url(raw: str) -> bool:
    s = str(raw or "").strip().lower()
    if not s:
        return True
    if "google.com/s2/favicons" in s:
        return True
    if "/favicon" in s:
        return True
    return False


def _proxied_logo(url: str) -> str:
    return f"{APP_URL}/api/logo-proxy?url={quote(url, safe='')}"


def email_logo_src(*, ticker: str, logo_url: str | None = None) -> str:
    symbol = str(ticker or "").strip().upper()
    candidate = str(logo_url or "").strip()
    if candidate and not _is_bad_logo_url(candidate):
        return _proxied_logo(candidate)
    if symbol:
        finnhub = (
            "https://static2.finnhub.io/file/publicdatany/finnhubimage/"
            f"stock_logo/{quote(symbol.replace('.', '-'))}.png"
        )
        return _proxied_logo(finnhub)
    fmp = f"https://financialmodelingprep.com/image-stock/{quote(symbol)}.png"
    return _proxied_logo(fmp)


def email_logo_img(*, ticker: str, logo_url: str | None = None, size: int = 42, radius: int = 10) -> str:
    src = email_logo_src(ticker=ticker, logo_url=logo_url)
    return (
        f"<img src='{src}' width='{size}' height='{size}' "
        f"style='border-radius:{radius}px;object-fit:contain;background:#ffffff;border:1px solid #e5e7eb;padding:2px;display:block' />"
    )


def email_track_blocked(ticker: str | None = None) -> tuple[str, str]:
    label = ticker or "this stock"
    subject = f"Unlock Radar for {label}"
    html = _rich_shell(
        title=f"{label} is where the product starts to matter",
        eyebrow="Radar locked",
        intro=(
            f"You tried to add <strong style='color:#111111'>{_esc(label)}</strong> to Radar. "
            "That’s the right behavior. The useful version of stocksbrew starts when your names are tracked, scored, and monitored for you."
        ),
        sections=[
            _bullet_section("What Pro unlocks", [
                "A standing buy / hold / sell call on every stock you track",
                "A daily Radar email instead of checking five tabs",
                "Alerts when a thesis or setup actually changes",
            ]),
            _section("Why this matters", "Without Radar, you still have a stock page. With Radar, the app becomes a monitoring system."),
        ],
        cta_label="Unlock Pro Radar",
        cta_url=f"{APP_URL}/subscribe",
    )
    return subject, html


def email_checkout_abandoned(plan: str | None = None) -> tuple[str, str]:
    plan_label = "yearly" if plan == "yearly" else "monthly"
    subject = "Finish unlocking Pro"
    html = _rich_shell(
        title="You were close. Don’t leave Radar half on.",
        eyebrow="Checkout pending",
        intro=(
            f"Your {plan_label} Pro checkout started but didn’t complete. "
            "If you’re paying attention to your stocks regularly, this is the point where the product goes from interesting to useful."
        ),
        sections=[
            _bullet_section("What changes once Pro is on", [
                "Unlimited Radar names instead of a tiny free set",
                "Daily email with real stance and movement across your book",
                "Alerts when setups shift into something worth acting on",
            ]),
        ],
        cta_label="Complete checkout",
        cta_url=f"{APP_URL}/subscribe",
    )
    return subject, html


def email_free_high_intent(tickers: list[str]) -> tuple[str, str]:
    focus = ", ".join(tickers[:3]) if tickers else "your watched stocks"
    subject = f"Stop scanning headlines. Get a stance on {tickers[0] if tickers else 'your stocks'}"
    html = _rich_shell(
        title="You’re doing the work manually right now",
        eyebrow="High intent detected",
        intro=(
            f"We keep seeing the same names in your research flow: <strong style='color:#111111'>{_esc(focus)}</strong>. "
            "That usually means one thing: you care enough to check, but you still don’t have a system running for you."
        ),
        sections=[
            _section("What Radar changes", "Instead of re-reading news and rechecking charts, you get one standing stance, the reason it changed, and the next action to consider."),
        ],
        cta_label="Turn these into Radar names",
        cta_url=f"{APP_URL}/subscribe",
    )
    return subject, html


def email_free_alert_teaser(ticker: str) -> tuple[str, str]:
    subject = f"Get emailed the moment {ticker} crosses your level"
    html = _rich_shell(
        title=f"Stop refreshing {ticker}",
        eyebrow="Alert teaser",
        intro=(
            f"You’ve come back to <strong style='color:#111111'>{_esc(ticker)}</strong> more than once. "
            "That usually means you’re waiting for a price or setup condition. Let the app watch it."
        ),
        sections=[
            _bullet_section("What the alert should do", [
                "Tell you the level broke",
                "Explain whether the move helps or hurts the thesis",
                "Point you back to the stock page with current context",
            ])
        ],
        cta_label="Unlock alerts",
        cta_url=f"{APP_URL}/subscribe",
    )
    return subject, html


def email_pro_welcome() -> tuple[str, str]:
    subject = "Pro is active. Do these 3 things now"
    html = _rich_shell(
        title="Radar is live. Make it useful today.",
        eyebrow="Pro active",
        intro="Most people underuse products like this in the first five minutes. Do the setup once and the emails become much better.",
        sections=[
            _bullet_section("Do these now", [
                "Add core holdings first so the daily digest is position-aware",
                "Add stalking names second so you get idea flow, not just maintenance",
                "Set at least one alert so you feel the product pull you back at the right time",
            ])
        ],
        cta_label="Open Radar",
        cta_url=f"{APP_URL}/watchlist",
    )
    return subject, html


def email_pro_directive_change(
    *,
    ticker: str,
    position_type: str,
    prev_stance: str,
    new_stance: str,
    directive_text: str | None = None,
) -> tuple[str, str]:
    pos = "holding" if str(position_type).lower() == "holding" else "watching"
    title = (
        f"{ticker} flipped to Trim in your holdings"
        if pos == "holding"
        else f"{ticker} flipped to Accumulate in your watchlist"
    )
    subject = title
    line = (directive_text or "").strip()
    if not line:
        line = (
            "This is a fresh stance change from your previous Radar build."
            f" ({prev_stance} → {new_stance})"
        )
    html = _rich_shell(
        title=title,
        eyebrow="Directive change",
        intro=(
            f"<strong style='color:#111111'>{_esc(ticker)}</strong> moved from "
            f"<strong>{_esc(prev_stance.title())}</strong> to <strong>{_esc(new_stance.title())}</strong> in your "
            f"{'holdings' if pos == 'holding' else 'watchlist'}."
        ),
        sections=[
            _section("What changed", _esc(line)),
            _section("Why you got this", "This only fires on actual stance transitions, not on every Radar rebuild."),
        ],
        cta_label=f"Open {ticker} in Radar",
        cta_url=f"{APP_URL}/watchlist",
    )
    return subject, html


def email_first_radar_item(first_name: str) -> tuple[str, str]:
    subject = "Your first Radar stock is live"
    html = _rich_shell(
        title=f"{first_name}, your first stock is being watched now",
        eyebrow="Radar started",
        intro=(
            "You added your first Radar name. Good. The next step is making the product smart enough to reflect your actual book, not one isolated stock."
        ),
        sections=[
            _bullet_section("Best next moves", [
                "Add the holdings you care about most",
                "Add one or two names you are stalking",
                "Reply if something in the brief feels off or missing",
            ]),
        ],
        cta_label="Open your Radar",
        cta_url=f"{APP_URL}/watchlist",
    )
    return subject, html


def email_pro_earnings_setup(doc: dict[str, Any], *, position_type: str = "watchlist") -> tuple[str, str]:
    report = doc.get("report") or {}
    decision = report.get("decision_guide") or {}
    setup = report.get("setup") or {}
    ticker = str(doc.get("ticker") or "").strip().upper()
    event_date = str(doc.get("event_date") or "").strip()
    headline = str(report.get("headline") or f"{ticker} earnings setup").strip()
    summary = str(report.get("summary") or "").strip()
    holder_line = str(decision.get("for_holders") or "").strip()
    watcher_line = str(decision.get("for_watchers") or "").strip()
    confidence = (report.get("confidence") or {}).get("score_0_100")
    subject = f"{ticker} reports soon: what to watch"
    audience_line = holder_line if position_type == "holding" else watcher_line
    confidence_line = f"Confidence: {int(confidence)}/100." if isinstance(confidence, (int, float)) else ""
    html = _rich_shell(
        title=headline or f"{ticker} earnings setup",
        eyebrow="Earnings setup",
        intro=(
            f"<strong style='color:#111111'>{_esc(ticker)}</strong> reports on <strong>{_esc(event_date)}</strong>. "
            f"{_esc(summary)}"
        ),
        sections=[
            _section("What to do", _esc(audience_line or "Open the full setup and review the decision guide before the print.")),
            _section(
                "Why the setup matters",
                _esc(str(setup.get("pre_earnings_positioning") or "")) + (f" {_esc(confidence_line)}" if confidence_line else ""),
            ),
            _bullet_section(
                "Key monitor list",
                [str(item) for item in (decision.get("key_monitor_list") or [])[:4]],
            ),
        ],
        cta_label=f"Open {ticker}",
        cta_url=f"{APP_URL}/stock/{ticker}",
    )
    return subject, html


def email_stock_request_backlog_cleared(
    *,
    first_name: str,
    fulfilled_count: int,
    sample_tickers: list[str],
) -> tuple[str, str]:
    subject = "Your stock requests are live on stocksbrew"
    samples = ", ".join(sample_tickers[:12])
    if len(sample_tickers) > 12:
        samples += f", and {len(sample_tickers) - 12} more"
    events_url = f"{APP_URL}/events"
    upcoming_url = f"{APP_URL}/upcoming-events"
    lines = [
        f"Hi {first_name},",
        "Thanks for being a Pro member and for your patience while we worked through your stock requests.",
        f"We have published {fulfilled_count} of the names you asked for. You can search for them on stocksbrew, open each stock page, and add them to Radar like any other ticker.",
    ]
    if samples:
        lines.append(f"Includes: {samples}.")
    lines.extend(
        [
            "Two newer pages you may like for earnings season:",
            (
                f"<a href=\"{events_url}\" style=\"color:#0052ff;font-weight:600\">Events</a>: "
                "fresh post-earnings reports and scenario odds for stocks that just reported."
            ),
            (
                f"<a href=\"{upcoming_url}\" style=\"color:#0052ff;font-weight:600\">Upcoming events</a>: "
                "AI pre-earnings setups for names reporting in the next 7 days."
            ),
            "If anything still does not show up, reply with the ticker and we will fix it quickly.",
        ]
    )
    html = _card(
        title="Your requests are ready",
        lines=lines,
        cta_label="Open Radar",
        cta_url=f"{APP_URL}/watchlist",
        kicker="Thanks for helping us grow coverage",
    )
    return subject, html


def email_stock_request_ready(*, ticker: str, company_name: str | None = None) -> tuple[str, str]:
    display = (company_name or ticker).strip()
    subject = f"{ticker} is now live on stocksbrew"
    html = _card(
        title=f"{display} is ready to track",
        lines=[
            f"We added {ticker} to stocksbrew based on your request.",
            "You can now open the stock page, track it in Radar, and get fresh updates.",
            "Thanks for helping us improve coverage.",
        ],
        cta_label=f"Open {ticker}",
        cta_url=f"{APP_URL}/stock/{ticker}",
        kicker="Stock request fulfilled",
    )
    return subject, html


def email_pro_daily_digest(
    rows: list[dict[str, Any]],
    market_snapshot_rows: list[dict[str, Any]] | None = None,
    *,
    radar_brief: dict[str, Any] | None = None,
    radar_events: list[dict[str, Any]] | None = None,
    radar_today_setup: dict[str, Any] | None = None,
) -> tuple[str, str]:
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

    def _logo(row: dict[str, Any]) -> str:
        ticker = str(row.get("ticker") or "").strip().upper()
        logo_url = str(row.get("logo_url") or "").strip()
        return email_logo_img(ticker=ticker, logo_url=logo_url, size=42, radius=10)

    def _clean_sentence(text: str) -> str:
        return " ".join(str(text or "").split()).strip()

    def _compact_sentence(text: str, limit: int) -> str:
        cleaned = _clean_sentence(text)
        if len(cleaned) <= limit:
            return cleaned
        head = cleaned[: limit - 1]
        last_space = head.rfind(" ")
        trimmed = (head[:last_space] if last_space > 24 else head).strip()
        return f"{trimmed or head}…"

    def _is_weak_line(text: str) -> bool:
        t = _clean_sentence(text).lower()
        if not t:
            return True
        weak_patterns = (
            "review holding",
            "keep watching",
            "watch for entry setup",
            "headlines today",
            "nothing unusual today",
            "market momentum check",
            "hold, watch closely",
        )
        return any(pattern in t for pattern in weak_patterns)

    def _best_catalyst(row: dict[str, Any]) -> str:
        cats = row.get("catalysts") or []
        if not isinstance(cats, list):
            return ""
        for c in cats:
            if not isinstance(c, dict):
                continue
            title = _clean_sentence(str(c.get("title") or c.get("kind") or ""))
            if title:
                return title
        return ""

    def _directive(row: dict[str, Any]) -> str:
        # Keep this field strictly directive-first.
        text = _clean_sentence(str(row.get("ai_directive_text") or ""))
        if text and not _is_weak_line(text):
            return text
        for key in ("suggested_action", "directive", "action"):
            value = row.get(key)
            if isinstance(value, str) and value.strip():
                candidate = _clean_sentence(value)
                if candidate and not _is_weak_line(candidate):
                    return candidate
            if isinstance(value, dict):
                nested = _clean_sentence(str(value.get("text") or ""))
                if nested and not _is_weak_line(nested):
                    return nested
        chg = _num(row.get("day_change_pct"))
        if abs(chg) >= 4.0:
            return "Size risk before adding exposure."
        if abs(chg) >= 2.0:
            return "Wait for confirmation before acting."
        return "No action edge yet."

    def _ai_take(row: dict[str, Any]) -> str:
        rationale = _clean_sentence(str(row.get("ai_directive_rationale") or ""))
        if rationale and not _is_weak_line(rationale):
            return rationale

        news = row.get("news_velocity") or {}
        mentions = int(_num(news.get("mentions_1d"))) if isinstance(news, dict) else 0
        catalyst_text = _best_catalyst(row)

        parts: list[str] = []
        if catalyst_text:
            parts.append(catalyst_text[:70])
        if mentions > 0:
            parts.append(f"{mentions} headline{'s' if mentions != 1 else ''} today")

        if not parts:
            chg = _num(row.get("day_change_pct"))
            if abs(chg) >= 5:
                return "Large move with thin signal quality; treat as high-volatility tape."
            return "Signal quality is mixed; wait for cleaner confirmation."
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
                f"<td style='vertical-align:middle;width:48px'>{_logo(row)}</td>"
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

    brief_line = ""
    if isinstance(radar_brief, dict):
        brief_line = _clean_sentence(str(radar_brief.get("narrative") or ""))
    if not brief_line:
        brief_line = "Personalized Radar summary across your tracked names."

    event_lines: list[str] = []
    if isinstance(radar_events, list):
        for event in radar_events[:3]:
            if not isinstance(event, dict):
                continue
            ticker = _clean_sentence(str(event.get("ticker") or ""))
            title = _clean_sentence(str(event.get("title") or ""))
            body = _clean_sentence(str(event.get("body") or ""))
            line = " ".join(part for part in [ticker, title, body] if part).strip()
            if line:
                event_lines.append(line[:140])
    events_html = ""
    if event_lines:
        rows_html = "".join(
            f"<tr><td style='padding:0 32px 8px 32px;font-size:13px;line-height:1.5;color:#374151'>• {line}</td></tr>"
            for line in event_lines
        )
        events_html = (
            "<tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>"
            "<tr><td style='padding:14px 32px 8px 32px'><div style='font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.12em;text-transform:uppercase'>Radar Signals</div></td></tr>"
            f"{rows_html}"
        )

    preopen_html = ""
    if isinstance(radar_today_setup, dict):
        setup_headline = _clean_sentence(str(radar_today_setup.get("headline") or ""))
        setup_body = _clean_sentence(str(radar_today_setup.get("body") or ""))
        setup_signals = radar_today_setup.get("signals") or []
        setup_rows = []
        if isinstance(setup_signals, list):
            for item in setup_signals[:3]:
                if not isinstance(item, dict):
                    continue
                ticker = _clean_sentence(str(item.get("ticker") or ""))
                title = _clean_sentence(str(item.get("title") or ""))
                title_prefix = f"{ticker} " if ticker else ""
                if title and title_prefix and title.upper().startswith(title_prefix.upper()):
                    title = title[len(title_prefix):].strip()
                body = _clean_sentence(str(item.get("why_it_matters") or ""))
                evidence = item.get("evidence") or []
                evidence_line = ""
                if isinstance(evidence, list):
                    evidence_line = " · ".join(_compact_sentence(str(v), 46) for v in evidence[:2] if _clean_sentence(str(v)))
                line_body = _compact_sentence(body, 118) if body else ""
                if title or line_body:
                    setup_rows.append(
                        "<tr><td style='padding:0 32px 10px 32px'>"
                        "<div style='background:#f8fbff;border:1px solid #dbe7ff;border-radius:12px;padding:14px 16px'>"
                        f"<div style='font-size:13px;font-weight:700;color:#111827;margin-bottom:4px'>{_esc(ticker)}</div>"
                        f"<div style='font-size:13px;font-weight:600;color:#1f2937;line-height:1.4'>{_esc(_compact_sentence(title, 54))}</div>"
                        + (f"<div style='margin-top:5px;font-size:13px;color:#4b5563;line-height:1.5'>{_esc(line_body)}</div>" if line_body else "")
                        + (f"<div style='margin-top:6px;font-size:11px;color:#6b7280'>{_esc(evidence_line)}</div>" if evidence_line else "")
                        + "</div></td></tr>"
                    )
        if setup_headline or setup_rows:
            preopen_html = (
                "<tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>"
                "<tr><td style='padding:14px 32px 8px 32px'><div style='font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.12em;text-transform:uppercase'>Before open</div></td></tr>"
                + (
                    f"<tr><td style='padding:0 32px 10px 32px'><div style='font-size:15px;font-weight:700;color:#111827'>{_esc(setup_headline)}</div>"
                    + (f"<div style='margin-top:6px;font-size:13px;color:#4b5563;line-height:1.55'>{_esc(_compact_sentence(setup_body, 160))}</div>" if setup_body and not setup_rows else "")
                    + "</td></tr>"
                    if setup_headline or setup_body
                    else ""
                )
                + "".join(setup_rows)
            )

    if hold_top and watch_top:
        intro = "Here's what moved across your holdings and watchlist, plus three wildcard movers from your Radar."
    elif watch_top:
        intro = "You have watchlist movement today. Add holdings to make this digest even more personalized."
    elif hold_top:
        intro = "Holdings are moving today. Add watchlist names to broaden idea flow in this digest."
    else:
        intro = "Radar is quiet right now. We still surface useful movers so tomorrow's setup is easier."
    if brief_line:
        intro = brief_line

    subject = "Your daily Radar pulse"
    html = f"""<!doctype html><html lang='en'><head><meta charset='UTF-8' /><meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>Your daily Radar pulse - stocksbrew</title></head>
<body style='margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif'>
  <table width='100%' cellpadding='0' cellspacing='0' style='padding:32px 16px'><tr><td align='center'>
    <table width='580' cellpadding='0' cellspacing='0'><tr><td style='padding-bottom:20px'>
      <span style='font-size:24px;font-weight:800;color:#111111;letter-spacing:-0.05em'>stocksbrew</span></td></tr></table>
    <table width='580' cellpadding='0' cellspacing='0' style='background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden'>
      <tr><td style='padding:28px 32px 20px 32px'>
        <div style='font-size:30px;font-weight:800;color:#111111;line-height:1.15;letter-spacing:-0.03em;margin-bottom:8px'>Your Radar today</div>
        <div style='font-size:15px;color:#6b7280;line-height:1.6'>{intro}</div></td></tr>
      <tr><td style='padding:0 32px'><div style='height:1px;background:#f3f4f6'></div></td></tr>
      {preopen_html}
      {sections_html}
      {events_html}
      <tr><td style='padding:24px 32px 32px 32px'><a href='{APP_URL}/watchlist' style='display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:999px;letter-spacing:-0.01em'>Open Radar &rarr;</a>
      <div style='margin-top:10px;font-size:12px;color:#9ca3af'>Calls and alerts update as news, fundamentals, and price action change.</div></td></tr>
    </table>
  </td></tr></table></body></html>"""
    return subject, html


def _premarket_stock_row(
    *,
    ticker: str,
    logo_url: str | None,
    gap_pct: float,
    note: str,
) -> str:
    up = gap_pct >= 0
    color = "#047857" if up else "#b91c1c"
    arrow = "&#9650;" if up else "&#9660;"
    logo = email_logo_src(ticker=ticker, logo_url=logo_url)
    return (
        "<tr><td style='padding:10px 0;border-top:1px solid #f3f4f6'>"
        "<table width='100%' cellpadding='0' cellspacing='0'><tr>"
        f"<td width='34' valign='top'><img src='{_esc(logo)}' width='30' height='30' "
        "style='border-radius:8px;object-fit:cover' alt='' /></td>"
        "<td valign='top' style='padding-left:10px'>"
        f"<span style='font-size:14px;font-weight:700;color:#111827'>{_esc(ticker)}</span> "
        f"<span style='font-size:13px;font-weight:700;color:{color}'>{arrow} {abs(gap_pct):.1f}%</span>"
        f"<div style='font-size:13px;color:#6b7280;line-height:1.5;margin-top:2px'>{_esc(note)}</div>"
        "</td></tr></table></td></tr>"
    )


def email_pre_market_brief(
    first_name: str,
    premarket: dict[str, Any] | None,
    rows: list[dict[str, Any]] | None = None,
    *,
    market_phase_line: str | None = None,
    reporting_today: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Build the personalized pre-market brief: setup, your book before the
    bell, market-wide gappers, and who reports before the open."""
    premarket = premarket or {}
    rows = rows or []
    by_ticker: dict[str, dict[str, Any]] = premarket.get("by_ticker") or {}
    gappers_up = premarket.get("gappers_up") or []
    gappers_down = premarket.get("gappers_down") or []

    sections: list[str] = []

    # On your book before the bell (personalized).
    book_rows_html: list[str] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        hit = by_ticker.get(ticker)
        if not ticker or not hit:
            continue
        gap = float(hit.get("pre_market_change_pct") or 0.0)
        directive = str(row.get("ai_directive_text") or "").strip()
        pos = "Holding" if row.get("position_type") == "holding" else "Watching"
        note = directive or f"{pos} on your Radar."
        book_rows_html.append(
            _premarket_stock_row(ticker=ticker, logo_url=row.get("logo_url"), gap_pct=gap, note=note)
        )
        if len(book_rows_html) >= 5:
            break
    book_count = len(book_rows_html)
    if book_rows_html:
        sections.append(
            _section(
                "On your book before the bell",
                f"<table width='100%' cellpadding='0' cellspacing='0'>{''.join(book_rows_html)}</table>",
            )
        )

    # Market-wide gappers.
    movers_html: list[str] = []
    for r in (gappers_up[:3] + gappers_down[:2]):
        movers_html.append(
            _premarket_stock_row(
                ticker=str(r.get("ticker") or ""),
                logo_url=r.get("logo_url"),
                gap_pct=float(r.get("pre_market_change_pct") or 0.0),
                note=str(r.get("name") or ""),
            )
        )
    if movers_html:
        sections.append(
            _section(
                "Moving before the bell",
                f"<table width='100%' cellpadding='0' cellspacing='0'>{''.join(movers_html)}</table>",
            )
        )

    # Reporting before the open.
    if reporting_today:
        bullets = []
        for ev in reporting_today[:5]:
            t = str(ev.get("ticker") or "").strip().upper()
            call = str(ev.get("call") or "").strip()
            bullets.append(f"{t}{(' — ' + call) if call else ''}")
        if bullets:
            sections.append(_bullet_section("Reporting before the open", bullets))

    hi = f"{first_name}, " if first_name and first_name != "there" else ""
    if book_count > 0:
        intro = (
            f"{hi}{book_count} {'name' if book_count == 1 else 'names'} on your book "
            "are moving before the open. Here is the setup and what it means."
        )
        subject = f"Before the open: {book_count} of your names are moving"
    else:
        intro = f"{hi}here is what is set up before the bell today."
        subject = "Before the open: today's setup"
    if market_phase_line:
        intro = f"{_esc(market_phase_line)} {intro}"

    html = _rich_shell(
        title="Before the open",
        eyebrow="Pre-market brief",
        intro=intro,
        sections=sections,
        cta_label="See the full setup",
        cta_url=f"{APP_URL}/premarket",
    )
    return subject, html
