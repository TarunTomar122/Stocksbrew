from __future__ import annotations

import argparse
from typing import Any

from backend.lifecycle_emailing import email_logo_img, send_email
from backend.storage import TraceMoneyStore


def _num(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _generic_rows_from_anomalies(store: TraceMoneyStore, market: str = "US", limit: int = 8) -> list[dict[str, Any]]:
    doc = store.db.collection("tm_daily_anomalies").document(f"{market}__latest").get()
    payload = doc.to_dict() if doc.exists else {}
    anomalies = (payload or {}).get("anomalies") or []
    rows: list[dict[str, Any]] = []
    for item in anomalies[:limit]:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "ticker": str(item.get("ticker") or ""),
                "price": item.get("price"),
                "day_change_pct": item.get("day_change_pct"),
                "day_change_abs": item.get("day_change_abs"),
                "position_type": "watchlist",
                "ai_directive_text": str(item.get("headline") or "").strip() or "Market anomaly detected",
                "ai_directive_rationale": str(item.get("today_brief") or "").strip(),
                "catalysts": [{"title": str(item.get("catalyst") or "").strip()}] if str(item.get("catalyst") or "").strip() else [],
                "news_velocity": {"mentions_1d": int(item.get("news_count") or 0)},
            }
        )
    return rows


def _build_generic_market_newsletter(
    *,
    store: TraceMoneyStore,
    market: str,
    rows: list[dict[str, Any]],
) -> tuple[str, str]:
    reddit_doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    reddit = reddit_doc.to_dict() if reddit_doc.exists else {}
    mood = str((reddit or {}).get("market_mood") or "neutral").strip().title()
    reddit_tickers = (reddit or {}).get("tickers") or []
    reddit_tickers = [r for r in reddit_tickers if isinstance(r, dict)][:5]

    def _logo(ticker: str) -> str:
        t = ticker.strip().upper()
        if not t:
            return ""
        return email_logo_img(ticker=t, logo_url=None, size=34, radius=8)

    mover_cards: list[str] = []
    for row in rows[:6]:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        pct = _num(row.get("day_change_pct"))
        price = _num(row.get("price"))
        headline = str(row.get("ai_directive_text") or "").strip()
        rationale = str(row.get("ai_directive_rationale") or "").strip()
        # Remove noisy fallback text for newsletter UX.
        if "No fresh stock-specific news matched this run" in rationale:
            rationale = ""
        one_liner = headline or rationale or "Momentum-led move; no validated catalyst yet."
        move_color = "#047857" if pct >= 0 else "#b91c1c"
        move_arrow = "▲" if pct >= 0 else "▼"
        mover_cards.append(
            f"""
            <table width='100%' cellpadding='0' cellspacing='0' style='border:1px solid #e5e7eb;border-radius:12px;background:#ffffff'>
              <tr>
                <td style='padding:12px 12px 8px 12px;vertical-align:top;width:40px'>{_logo(ticker)}</td>
                <td style='padding:12px 12px 8px 0;vertical-align:top'>
                  <div style='font-size:16px;font-weight:800;color:#0f172a;line-height:1.1'>{ticker}</div>
                  <div style='font-size:13px;color:#64748b;margin-top:3px'>${price:,.2f} · <span style='color:{move_color};font-weight:700'>{move_arrow} {pct:+.2f}%</span></div>
                </td>
              </tr>
              <tr>
                <td colspan='2' style='padding:0 12px 12px 12px;font-size:13px;color:#334155;line-height:1.4'>{one_liner}</td>
              </tr>
            </table>
            """
        )

    buzz_lines = []
    for item in reddit_tickers:
        ticker = str(item.get("ticker") or "").strip().upper()
        mentions = int(item.get("mention_count") or 0)
        sentiment = str(item.get("sentiment") or "neutral").strip().title()
        summary = str(item.get("summary") or "").strip()
        catalysts = [str(c).strip() for c in (item.get("catalysts") or []) if str(c).strip()]
        catalyst_text = f" Catalyst: {', '.join(catalysts[:2])}." if catalysts else ""
        if ticker:
            buzz_lines.append(
                f"""
                <tr>
                  <td style='padding:0 0 10px 0'>
                    <table width='100%' cellpadding='0' cellspacing='0' style='border:1px solid #e8edf4;border-radius:12px;background:#ffffff'>
                      <tr>
                        <td style='padding:10px 10px 8px 10px;vertical-align:top;width:40px'>{_logo(ticker)}</td>
                        <td style='padding:10px 10px 8px 0;vertical-align:top'>
                          <div style='font-size:14px;font-weight:700;color:#111827'>{ticker}</div>
                          <div style='font-size:12px;color:#6b7280;margin-top:2px'>{mentions} mentions · {sentiment}</div>
                        </td>
                      </tr>
                      <tr><td colspan='2' style='padding:0 10px 10px 10px;font-size:13px;color:#374151;line-height:1.45'>{summary}{catalyst_text}</td></tr>
                    </table>
                  </td>
                </tr>
                """
            )

    movers_html = ""
    if mover_cards:
        for i in range(0, len(mover_cards), 2):
            left = mover_cards[i]
            right = mover_cards[i + 1] if i + 1 < len(mover_cards) else ""
            movers_html += f"""
            <tr>
              <td style='padding:0 0 10px 0;vertical-align:top;width:50%'>{left}</td>
              <td style='padding:0 0 10px 10px;vertical-align:top;width:50%'>{right}</td>
            </tr>
            """
    else:
        movers_html = "<tr><td style='padding:10px 0;color:#6b7280'>No significant movers yet.</td></tr>"
    buzz_html = "".join(buzz_lines) or "<tr><td style='color:#6b7280'>Reddit buzz data not available yet.</td></tr>"
    subject = "Market Open: Movers + Reddit Buzz"
    html = f"""<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 8px"><tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dde3ea;border-radius:18px;overflow:hidden">
<tr><td style="background:#111827">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:18px 22px 6px 22px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#fca5a5;text-transform:uppercase">Market Open</td></tr>
    <tr><td style="padding:0 22px 4px 22px;font-size:30px;font-weight:800;color:#ffffff;line-height:1.05">US Brief</td></tr>
    <tr><td style="padding:0 22px 18px 22px;font-size:14px;color:#d1d5db">Mood: <strong style="color:#ffffff">{mood}</strong> · Biggest movers + top Reddit buzz.</td></tr>
  </table>
</td></tr>

<tr><td style="padding:16px 22px 6px 22px;font-size:18px;font-weight:800;color:#0f172a">Biggest Movers</td></tr>
<tr><td style="padding:0 22px 10px 22px"><table width="100%" cellpadding="0" cellspacing="0">{movers_html}</table></td></tr>

<tr><td style="padding:8px 22px 6px 22px;font-size:18px;font-weight:800;color:#0f172a">Top Reddit Buzz</td></tr>
<tr><td style="padding:0 22px 16px 22px"><table width="100%" cellpadding="0" cellspacing="0">{buzz_html}</table></td></tr>

<tr><td style="padding:10px 22px 24px 22px"><a href="https://www.tikrr.online" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 16px;border-radius:999px">Open Tikrr →</a><span style="font-size:12px;color:#94a3b8;margin-left:10px">Auto-generated at market open.</span></td></tr>
</table></td></tr></table>
</body></html>"""
    return subject, html


def _find_user_by_email(store: TraceMoneyStore, email: str) -> tuple[str | None, dict[str, Any]]:
    value = email.strip().lower()
    if not value:
        return None, {}
    query = (
        store.db.collection("users")
        .where("email_lower", "==", value)
        .limit(1)
        .stream()
    )
    for doc in query:
        return doc.id, (doc.to_dict() or {})
    return None, {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Send one market-open newsletter preview email")
    parser.add_argument("--to", required=True, help="Target email")
    parser.add_argument("--market", default="US")
    parser.add_argument("--generic-only", action="store_true", help="Force generic (non-radar) newsletter payload")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = str(args.market or "US").upper()
    target = str(args.to or "").strip()
    if not target:
        raise ValueError("Missing --to")

    uid, user = (None, {})
    if not args.generic_only:
        uid, user = _find_user_by_email(store, target)
    rows: list[dict[str, Any]] = []
    mode = "generic"
    radar_brief: dict[str, Any] | None = None
    radar_events: list[dict[str, Any]] | None = None

    if (not args.generic_only) and uid and bool(user.get("is_subscribed")):
        view = store.get_watchlist_view(uid) or {}
        candidate_rows = view.get("rows") if isinstance(view, dict) else []
        if isinstance(candidate_rows, list) and candidate_rows:
            rows = candidate_rows
            brief_value = view.get("brief") if isinstance(view, dict) else None
            events_value = view.get("event_radar") if isinstance(view, dict) else None
            radar_brief = brief_value if isinstance(brief_value, dict) else None
            radar_events = events_value if isinstance(events_value, list) else None
            mode = "personalized"

    if not rows:
        rows = _generic_rows_from_anomalies(store, market=market, limit=8)
        mode = "generic"

    if not rows:
        market_rows = store.get_market_price_snapshot(market)
        ranked = sorted(
            market_rows,
            key=lambda row: abs(_num(row.get("day_change_pct", row.get("change_pct")))),
            reverse=True,
        )
        for item in ranked[:8]:
            rows.append(
                {
                    "ticker": str(item.get("ticker") or item.get("symbol") or ""),
                    "price": item.get("price") or item.get("current"),
                    "day_change_pct": item.get("day_change_pct", item.get("change_pct")),
                    "day_change_abs": item.get("day_change_abs", item.get("change_abs")),
                    "position_type": "watchlist",
                    "ai_directive_text": "Top market mover",
                    "ai_directive_rationale": "Picked from broad market snapshot.",
                }
            )

    if args.generic_only:
        subject, html = _build_generic_market_newsletter(store=store, market=market, rows=rows)
    else:
        from backend.lifecycle_emailing import email_pro_daily_digest

        market_rows = store.get_market_price_snapshot(market)
        subject, html = email_pro_daily_digest(
            rows,
            market_rows,
            radar_brief=radar_brief,
            radar_events=radar_events,
        )

    if args.dry_run:
        print({"mode": mode, "to": target, "subject": subject, "row_count": len(rows)})
        return

    ok = send_email(target, subject, html)
    print({"mode": mode, "to": target, "subject": subject, "row_count": len(rows), "sent": bool(ok)})
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
