"""Render every email with real data into a folder of HTML files.

    python -m backend.mail.preview --uid <uid> --out <dir>

Reads production data read-only (LocalDB over HTTP when LOCALDB_URL is set,
otherwise the configured store). Sends nothing and writes nothing to the
database. Writes one .html and one .txt per email plus an index.html.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.mail import alerts, daily, lifecycle, rebalance, weekly
from backend.mail.data import load_person, stocks_by_id, tracked_counts
from backend.mail.kit import Email
from backend.mail.weekly import WEEK_NEWS_HOURS
from backend.subscription_entitlement import FREE_COVERED_STOCKS, FREE_COVERED_WORD, PAYWALL_V2

FREE_AGENTS = 1 if PAYWALL_V2 else 2  # lib/entitlements.ts: agents, free


def _source():
    import os

    if os.environ.get("LOCALDB_URL") and os.environ.get("LOCALDB_API_TOKEN"):
        from backend.mail.source import HttpSource

        return HttpSource()
    from backend.mail.source import StoreSource
    from backend.storage import TraceMoneyStore

    return StoreSource(TraceMoneyStore().db)


def render_all(uid: str, now: datetime | None = None, src=None) -> tuple[list[tuple[str, Email | None, str]], dict]:
    now = now or datetime.now(timezone.utc)
    src = src or _source()
    person = load_person(src, uid, now=now)
    if person is None:
        raise SystemExit(f"no user {uid}")
    popular_ids = [i for i, _ in tracked_counts(src, limit=10)]
    popular = stocks_by_id(src, popular_ids, now=now)
    market = {s.ticker: s for s in stocks_by_id(src, ["US_SPY"], now=now)}

    import copy

    free_view = copy.deepcopy(person)
    free_view.is_pro = False
    free_view.covered_ids = free_view.tracked_ids[:FREE_COVERED_STOCKS]

    out: list[tuple[str, Email | None, str]] = []
    out.append(("1 · Daily brief (Pro)", daily.build_daily(person, now=now, market=market), "Trading days, about 8:30am ET, only when something changed"))
    out.append(("1b · Daily brief (Free)", daily.build_daily(free_view, now=now, market=market), f"Same email for a Free account: covered {FREE_COVERED_WORD} only, plus what's outside"))
    week_person = load_person(src, uid, now=now, news_hours=WEEK_NEWS_HOURS)
    out.append(("2 · Weekly memo", weekly.build_weekly(week_person, market=market, now=now), "Saturdays, 9am ET"))
    findings = alerts.load_findings(src, uid, since=alerts.bundle_since(None, now))  # the same window the alerts job reads
    out.append(("3 · Alerts", alerts.build_alerts(person, findings, now=now), "When an agent job finds something, bundled over 15 minutes"))
    sell, calls = sample_findings(person)
    out.append(("3b · Alert: sell-some price (sample)", alerts.build_alerts(person, sell, now=now) if sell else None,
                "A 'When to sell some' agent. A real Sell some call and its real sell-some price; when no close has reached "
                "it yet, a what-if close set right at it"))
    out.append(("3c · Alert: call changed (sample)", alerts.build_alerts(person, calls, now=now) if calls else None,
                "An 'Our call changes' agent. Sample from real call changes this week; no such run has fired yet"))
    out.append(("3f · Price alert you set", _price_alert_sample(src, uid, person, now),
                "Within 15 minutes of a hand-set price alert being crossed (alerts job). Your real alert when one has "
                "fired; otherwise a what-if alert set just past the latest price"))
    out.append(("3d · Research ready", _brief_ready_sample(person),
                "When a stock someone asked about gets its first research (backend/brief_ready_alerts.py)"))
    out.append(("3e · Strategy rebalance (Pro)", rebalance.build_note(rb := _rebalance_sample(src, uid, now), tracked={s.ticker for s in person.stocks}, now=now,
                                         quotes=rebalance.quotes_for(src, rb, now, {s.ticker for s in person.stocks})),
                "Pro, the evening a strategy you follow rebalances (STRATEGY_REBALANCE_NOTES=1)"))
    new_user = copy.deepcopy(person)
    new_user.stocks, new_user.tracked_ids, new_user.covered_ids, new_user.is_pro = [], [], [], False
    # the welcome and day-5 nudge show one real card, so load the most-moved popular stock in full
    from backend.mail.data import with_example

    moved = with_example(src, popular, now)
    out.append(("4 · Welcome", lifecycle.build_welcome(new_user, moved, now=now), "Right after signup"))
    out.append(("4b · Setup nudge, day 2", lifecycle.build_setup_nudge(new_user, moved, day=2, now=now), "Day 2, only if the watchlist is empty"))
    out.append(("4c · Setup nudge, day 5", lifecycle.build_setup_nudge(new_user, moved, day=5, now=now), "Day 5, only if still empty. Last setup email"))
    out.append(("5 · Pro welcome", lifecycle.build_pro_welcome(person, now=now), "Right after upgrading"))
    out.append(("6a · Weekly swap open (Free)", lifecycle.build_swap_open(free_view, now=now), "Free only, when the weekly swap opens and an uncovered stock moved"))
    out.append(("6b · Limit reached (Free)", lifecycle.build_limit_reached(
        free_view, title="Free runs one agent at a time" if PAYWALL_V2 else "Free runs two agents at a time",
        body=(
            "You tried to start a second agent. The one you have keeps running, and the new one is saved and paused until you pause the first."
            if PAYWALL_V2 else
            "You tried to start a third agent job. Your other two keep running, and the new one is saved and paused until you turn one off."
        ),
        used=FREE_AGENTS, cap=FREE_AGENTS, pro_cap=20), "Free only, the first time a limit is hit each month"))
    out.append(("7 · We miss you", lifecycle.build_winback(_away(person, now), now=now), "Once, after 21 days without a visit"))
    info = {"uid": uid[:6], "tracked": len(person.tracked_ids), "pro": person.is_pro, "generated_at": now.isoformat()}
    return out, info


def _away(person, now: datetime):
    """The account as the win-back sees it: last here 21 days ago (the job sends it 21 to 60 days after a visit)."""
    import copy

    away = copy.deepcopy(person)
    away.last_seen = now - timedelta(days=21)
    return away


def _finding(**values) -> alerts.Finding:
    """A Finding from keyword values, keeping only the fields this version of alerts.Finding has."""
    from dataclasses import fields

    names = {f.name for f in fields(alerts.Finding)}
    return alerts.Finding(**{k: v for k, v in values.items() if k in names})


def sample_findings(person) -> tuple[list[alerts.Finding], list[alerts.Finding]]:
    """What a sell-some agent and a call-change agent would report for this person, from their real data.

    Sell some: a stock whose current call is Sell some (never one we say to buy or keep), at its real
    sell-some price. A real close at or over it is used when there is one; otherwise the stock closest to its
    price is shown closing right at it, which is a what-if and labelled so in the gallery. Call changes: the
    stocks whose call word changed in the last week, with the day it changed. Either list can be empty.
    """
    from backend.mail import kit

    sell: list[alerts.Finding] = []
    candidates = [s for s in person.stocks if kit.call_label(s.stance, s.call_text) == kit.SELL and s.trim_above
                  and len(s.closes) >= 2 and s.closes[-2]]
    hit = next((s for s in candidates if s.closes[-1] >= (s.trim_above or 0)), None)
    pick = hit or min(candidates, key=lambda s: (s.trim_above or 0) / s.closes[-1], default=None)
    if pick is not None:
        level = pick.trim_above or 0.0
        close = pick.closes[-1] if hit else level
        # a real hit moves from the close before it; a what-if moves from the latest real close
        move = (close / pick.closes[-2 if hit else -1] - 1) * 100
        day = pick.dates[-1]
        sell.append(_finding(job_name="When to sell some", ticker=pick.ticker, kind="level", zone="trim", level=level,
                             close=close, change_pct=move, at=day, run_day=day, run_close=day, source="Daily closing prices",
                             headline=f"{pick.ticker} {kit.verb(move)} {abs(move):.1f}% to {kit.money(close)}, at its {kit.money(level)} sell-some level",
                             detail="", url=f"/stock/{pick.ticker}"))
    calls: list[alerts.Finding] = []
    latest = max((s.dates[-1] for s in person.stocks if s.dates), default="")
    for s in person.stocks:
        labels = [kit.call_label(c.stance) for c in s.calls]
        if len(labels) < 2 or not labels[-1]:
            continue
        i = len(labels) - 1
        while i > 0 and labels[i - 1] == labels[-1]:
            i -= 1
        if i == 0 or not labels[i - 1]:
            continue
        day = s.calls[i].day
        if not latest or day < _days_before(latest, 7):
            continue
        before, after = labels[i - 1], labels[-1]
        calls.append(_finding(job_name="Our call changes", ticker=s.ticker, kind="call", call_from=before, call_to=after,
                              headline=f"Our call on {s.ticker} moved from {before} to {after}", detail=s.calls[i].reason,
                              source="Our research call", at=day, url=f"/stock/{s.ticker}"))
    calls.sort(key=lambda f: (f.at, f.ticker or ""), reverse=True)
    return sell, calls[:4]


def _days_before(iso: str, days: int) -> str:
    from datetime import date

    try:
        return (date.fromisoformat(iso[:10]) - timedelta(days=days)).isoformat()
    except ValueError:
        return ""


def _price_alert_sample(src, uid: str, person, now: datetime) -> Email | None:
    """The person's own hand-set price alert that has fired, or, when none has, a what-if: their first alert's
    stock with the alert price set just past its latest price (so the email shows real price and move)."""
    from backend.mail.data import stocks_by_id

    mine = alerts.load_price_alerts(src).get(uid, [])
    for a in mine:
        stock = next(iter(stocks_by_id(src, [str(a.get("instrument_id") or f"US_{a.get('ticker')}")], now=now)), None)
        email = alerts.build_price_alert(stock, a, now=now) if stock else None
        if email:
            return email
    stock = next((s for s in person.stocks if s.price and s.change_pct is not None and s.change_pct < 0), None)
    if stock is None:
        return None
    what_if = {"id": "what-if", "condition": "below", "target_price": float(round(stock.price * 1.01))}
    return alerts.build_price_alert(stock, what_if, now=now)


def _brief_ready_sample(person) -> Email | None:
    """The research-ready email through its live entry point (backend/emails/brief_ready.py), for one real stock."""
    from backend.emails.brief_ready import build_brief_ready_email

    s = next((x for x in person.stocks if x.price is not None and x.news), None) or next((x for x in person.stocks if x.price), None)
    if s is None:
        return None
    built = build_brief_ready_email(ticker=s.ticker, headline=s.news[0].title if s.news else None, company_name=s.name,
                                    price=s.price, day_change_pct=s.change_pct)
    subject, page = built
    return Email(kind="brief_ready", category="alerts", subject=subject, preheader="", html=page, text="", meta={})


def _rebalance_sample(src, uid: str, now: datetime) -> list[dict]:
    """The latest rebalance day: the person's followed strategies if any rebalanced then, otherwise every one (a sample)."""
    since = (now - timedelta(days=62)).date().isoformat()
    rows = [data for _, data in src.query(rebalance.COLLECTION, [("date", ">=", since)], limit=500) if data.get("slug") and data.get("date")]
    if not rows:
        return []
    day = max(str(r["date"]) for r in rows)
    latest = sorted((r for r in rows if r["date"] == day), key=lambda r: str(r["slug"]))
    follows = rebalance.followed(src.get(f"users/{uid}") or {})
    mine = [r for r in latest if r["slug"] in follows]
    return mine or latest[:2]


def write(out_dir: Path, rendered, info) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    cards = []
    for i, (label, email, when) in enumerate(rendered):
        slug = f"{i:02d}"
        if email is None:
            cards.append(f"<li><b>{html.escape(label)}</b><br><i>Not sent today: nothing qualified.</i> {html.escape(when)}</li>")
            continue
        (out_dir / f"{slug}.html").write_text(email.html)
        (out_dir / f"{slug}.txt").write_text(f"Subject: {email.subject}\nPreheader: {email.preheader}\n\n{email.text}")
        cards.append(
            f"<li><a href='{slug}.html'><b>{html.escape(label)}</b></a><br>"
            f"<span>Subject: {html.escape(email.subject)}</span><br><small>{html.escape(when)}</small></li>"
        )
    index = out_dir / "index.html"
    index.write_text(
        "<!doctype html><meta charset='utf-8'><title>Email previews</title>"
        "<body style='font:15px -apple-system,sans-serif;background:#f0eadd;padding:32px;max-width:760px;margin:auto'>"
        f"<h1>stocksbrew emails</h1><p>Rendered {html.escape(info['generated_at'][:16])} UTC from real data.</p>"
        f"<ol style='line-height:1.6'>{''.join(cards)}</ol></body>"
    )
    (out_dir / "manifest.json").write_text(json.dumps(
        [{"label": l, "subject": e.subject if e else None, "preheader": e.preheader if e else None, "when": w} for l, e, w in rendered],
        indent=2,
    ))
    return index


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uid", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--snapshot", help="record reads to this JSON file, or replay it if it exists (same data before and after a change)")
    ap.add_argument("--now", help="render as of this ISO time, e.g. 2026-11-11T13:30:00+00:00 (use with --snapshot)")
    args = ap.parse_args()
    now = datetime.fromisoformat(args.now) if args.now else None
    src = None
    if args.snapshot:
        from backend.mail.source import SnapshotSource

        src = SnapshotSource(args.snapshot) if Path(args.snapshot).exists() else SnapshotSource(args.snapshot, _source())
    rendered, info = render_all(args.uid, now=now, src=src)
    if src is not None:
        src.save()
    index = write(Path(args.out), rendered, info)
    for label, email, _ in rendered:
        print(f"{label:34} {'(quiet, not sent)' if email is None else email.subject}")
    print(index)


if __name__ == "__main__":
    main()
