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
    findings = alerts.load_findings(src, uid, since=now - timedelta(days=3))
    out.append(("3 · Alerts", alerts.build_alerts(person, findings, now=now), "When an agent job finds something, bundled over 15 minutes"))
    out.append(("3b · Strategy rebalance (Pro)", rebalance.build_note(_rebalance_sample(src, uid, now), tracked={s.ticker for s in person.stocks}),
                "Pro, the evening a strategy you follow rebalances (STRATEGY_REBALANCE_NOTES=1)"))
    new_user = copy.deepcopy(person)
    new_user.stocks, new_user.tracked_ids, new_user.covered_ids, new_user.is_pro = [], [], [], False
    # the welcome and day-5 nudge show one real card, so load the most-moved popular stock in full
    from backend.mail.data import with_example

    moved = with_example(src, popular, now)
    out.append(("4 · Welcome", lifecycle.build_welcome(new_user, moved, now=now), "Right after signup"))
    out.append(("4b · Setup nudge, day 2", lifecycle.build_setup_nudge(new_user, moved, day=2, now=now), "Day 2, only if the watchlist is empty"))
    out.append(("4c · Setup nudge, day 5", lifecycle.build_setup_nudge(new_user, moved, day=5, now=now), "Day 5, only if still empty. Last setup email"))
    out.append(("5 · Pro welcome", lifecycle.build_pro_welcome(person), "Right after upgrading"))
    out.append(("6a · Weekly swap open (Free)", lifecycle.build_swap_open(free_view), "Free only, when the weekly swap opens and an uncovered stock moved"))
    out.append(("6b · Limit reached (Free)", lifecycle.build_limit_reached(
        free_view, title="Free runs one agent at a time" if PAYWALL_V2 else "Free runs two agents at a time",
        body=(
            "You tried to start a second agent. The one you have keeps running, and the new one is saved and paused until you pause the first."
            if PAYWALL_V2 else
            "You tried to start a third agent job. Your other two keep running, and the new one is saved and paused until you turn one off."
        ),
        used=FREE_AGENTS, cap=FREE_AGENTS, pro_cap=20), "Free only, the first time a limit is hit each month"))
    out.append(("7 · We miss you", lifecycle.build_winback(person, now=now), "Once, after 21 days without a visit"))
    info = {"uid": uid[:6], "tracked": len(person.tracked_ids), "pro": person.is_pro, "generated_at": now.isoformat()}
    return out, info


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
