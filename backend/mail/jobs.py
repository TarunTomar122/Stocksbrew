"""Run the email jobs.

    python -m backend.mail.jobs daily      # trading days, ~8:30am ET
    python -m backend.mail.jobs weekly     # Saturday, ~9am ET
    python -m backend.mail.jobs alerts     # every 15 minutes: agent findings, hand-set price alerts that fired,
                                           # and the rebalance note when STRATEGY_REBALANCE_NOTES=1
    python -m backend.mail.jobs lifecycle  # hourly

Every job is a dry run unless `--send` (or `--to`) is given. `--send` only
works where LOCALDB_PATH is set (the VPS), so a laptop can never send from or
log to the wrong store. `--to you@x.com --uid <uid>` really sends that one
person's email, but to your address, skipping their preferences, dedupe and
caps, and logs nothing: for checking a real render in a real inbox. Its
unsubscribe links are that person's real ones, so don't click them.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable

from backend.mail import alerts, daily, lifecycle, rebalance, send, weekly
from backend.mail.data import ET, load_person, parse_ts, stocks_by_id, tracked_counts, with_example
from backend.mail.source import HttpSource, Source, StoreSource
from backend.mail.weekly import WEEK_NEWS_HOURS
from backend.subscription_entitlement import is_pro_user

USER_FIELDS = [
    "email", "email_lower", "display_name", "created_at", "last_sign_in_at", "is_subscribed", "subscriptionStatus",
    "proGifted", "proGiftExpiresAt", "tracked_stocks", "covered_stocks", "covered_adds_log", "unsubscribed",
    "email_unsubscribed_all", "tracked_strategies", *send.PREF_FIELD.values(),
]


def open_source(sending: bool) -> tuple[Source, Any]:
    if sending and not send.unsubscribe_token("check", "daily"):
        # Gmail and Yahoo want a one-click unsubscribe on bulk mail; without the
        # secret there is no signed link and no List-Unsubscribe header.
        sys.exit("--send needs EMAIL_UNSUBSCRIBE_SECRET (the same value as on Vercel).")
    if os.environ.get("LOCALDB_PATH"):
        from backend.storage import TraceMoneyStore

        store = TraceMoneyStore()
        return StoreSource(store.db), store
    if sending:
        sys.exit("--send needs LOCALDB_PATH (run it on the VPS). Use --to for a one-off test send.")
    return HttpSource(), None


def users(src: Source, only_uid: str | None) -> Iterable[tuple[str, dict]]:
    if only_uid:
        doc = src.get(f"users/{only_uid}")
        return [(only_uid, doc)] if doc else []
    return [(p.split("/")[-1], d) for p, d in src.query("users", [], limit=10000, select=USER_FIELDS)]


def run(job: str, *, dry_run: bool, only_uid: str | None, to: str | None, limit: int, now: datetime) -> Counter:
    src, store = open_source(sending=not dry_run and not to)
    stats: Counter = Counter()
    market = {s.ticker: s for s in stocks_by_id(src, ["US_SPY"], now=now)}
    popular: list = []
    et_now = now.astimezone(ET)

    if job == "daily" and et_now.weekday() >= 5 and not only_uid:
        print("weekend, no daily")
        return stats
    if job == "lifecycle":
        popular = stocks_by_id(src, [i for i, _ in tracked_counts(src, limit=8)], now=now)
        try:
            popular = with_example(src, popular, now)  # one real card for the welcome and setup emails
        except Exception as exc:  # the example is a nice-to-have; the emails read fine without it
            print(f"[mail] example stock skipped: {exc!r}")
    # The note at each rebalance rides on the alerts run (rebalance.py); read the records once per run.
    rebalances: list = []
    # hand-set price alerts (tm_alerts), read once per run; the old sender skips them under MAIL_V2_ACTIVE=1
    price_alerts: dict[str, list[dict]] = {}
    if job == "alerts":
        try:
            price_alerts = alerts.load_price_alerts(src)
        except Exception as exc:  # a bad read costs the price alerts this run, never the agent alerts
            print(f"[mail] price alerts skipped: {exc!r}")
    if job == "alerts" and rebalance.enabled():
        try:
            rebalances = rebalance.load_recent(src, now)
        except Exception as exc:  # the note must never stop the alert emails
            print(f"[mail] rebalance notes skipped: {exc!r}")

    builders: dict[str, Callable] = {
        "daily": lambda uid, user, hist: _daily(src, uid, user, now, market),
        "weekly": lambda uid, user, hist: _weekly(src, uid, user, now, market),
        "alerts": lambda uid, user, hist: (_alerts(src, uid, user, now, hist) + _price_alert_emails(src, now, price_alerts.get(uid, []))
                                           + _rebalance_notes(src, user, now, hist, rebalances)),
        "lifecycle": lambda uid, user, hist: _lifecycle(src, uid, user, now, hist, popular),
    }
    build = builders[job]
    for uid, user in users(src, only_uid):
        if limit and stats["checked"] >= limit:
            break
        if not (user.get("email") or user.get("email_lower")):
            continue
        stats["checked"] += 1
        try:
            _run_one(job, build, src, store, uid, user, now=now, dry_run=dry_run and not to, to=to, stats=stats)
        except send.LogFailed as exc:
            # without the log the next run would send the same email again
            stats["error"] += 1
            stats["aborted"] += 1
            print(f"[mail] {job} stopped: {exc}")
            break
        except Exception as exc:  # one bad account must not stop the batch
            stats["error"] += 1
            print(f"[mail] {job} {uid[:6]} failed: {exc!r}")
    return stats


def _run_one(job, build, src, store, uid, user, *, now, dry_run, to, stats: Counter) -> None:
    hist = send.History.load(src, uid, now=now)
    planned = build(uid, user, hist)
    for email, key, *after in planned:
        send.personalize(email, uid)
        out = send.deliver(store=store, uid=uid, user=user, email=email, dedupe_key=key,
                           history=hist, dry_run=dry_run, to_override=to)
        stats[out.status] += 1
        print(f"[mail] {job:9} {uid[:6]} {out.status:13} {email.kind:16} {email.subject[:90]}")
        # a step that only follows a real send (a price alert is marked fired): never in a dry run or a --to test,
        # and also on a dupe, so an alert emailed by an earlier run stops being checked
        if after and store is not None and not dry_run and not to and out.status in ("sent", "skipped_dupe"):
            after[0](store)
    if not planned:
        stats["nothing"] += 1


# ------------------------------------------------------------------ builders

def _daily(src, uid, user, now, market):
    if not (user.get("tracked_stocks") or []):
        return []
    person = load_person(src, uid, now=now)
    if person is None:
        return []
    email = daily.build_daily(person, now=now, market=market)
    if email is None:
        return []
    session = max((s.price_at for s in person.emailed_stocks() if s.price_at), default=None)
    # one daily per market session: a holiday re-run finds the same session and stops
    key = f"daily_{session.astimezone(ET).date().isoformat() if session else now.date().isoformat()}"
    return [(email, key)]


def _weekly(src, uid, user, now, market):
    if not (user.get("tracked_stocks") or []):
        return []
    # a week of news, so the memo can say what drove the best and worst stock
    person = load_person(src, uid, now=now, news_hours=WEEK_NEWS_HOURS)
    email = weekly.build_weekly(person, market=market, now=now) if person else None
    year, week, _ = now.astimezone(ET).isocalendar()
    return [(email, f"weekly_{year}-W{week:02d}")] if email else []


def _alerts(src, uid, user, now, hist, clock: Callable[[], datetime] | None = None):
    since = alerts.bundle_since(hist.alerts_until, now)
    # The bundle covers runs up to the moment we read them. Recording that
    # moment (not the later sent_at) means a run that lands while this email
    # is being sent is picked up by the next bundle instead of being skipped.
    until = (clock or (lambda: datetime.now(timezone.utc)))()
    findings = alerts.load_findings(src, uid, since=since)
    if not findings:
        return []
    person = load_person(src, uid, now=now, with_news=False, with_calls=False)
    email = alerts.build_alerts(person, findings, now=now) if person else None
    if email is None:
        return []
    email.meta["until"] = until.isoformat()
    return [(email, f"alerts_{now.strftime('%Y-%m-%dT%H:%M')}")]


def _price_alert_emails(src, now, items: list[dict]):
    """One email per hand-set price alert that fired, deduped on the alert (the old sender's key), then marked
    fired so it is not checked again. Prices come from the same latest quotes as every other email."""
    if not items:
        return []
    ids = [str(a.get("instrument_id") or f"US_{str(a.get('ticker')).upper()}") for a in items]
    quotes = {s.id: s for s in stocks_by_id(src, list(dict.fromkeys(ids)), now=now)}
    out = []
    for alert, iid in zip(items, ids):
        stock = quotes.get(iid)
        email = alerts.build_price_alert(stock, alert, now=now) if stock else None
        if email is None:
            continue
        alert_id = str(alert.get("id") or "")
        out.append((email, f"price_alert:{alert_id}", lambda store, alert_id=alert_id: _mark_fired(store, alert_id)))
    return out


def _mark_fired(store, alert_id: str) -> None:
    """The web app shows a fired alert as done (backend/price_alerts.py mark_alert_triggered writes the same)."""
    stamp = datetime.now(timezone.utc).isoformat()
    store.db.collection(alerts.PRICE_ALERTS).document(alert_id).update(
        {"triggered": True, "triggered_at": stamp, "active": False, "updated_at": stamp})


def _rebalance_notes(src, user, now, hist, records):
    """One note per rebalance day for a Pro person following a strategy that rebalanced."""
    try:
        return _rebalance_note(src, user, now, hist, records)
    except Exception as exc:  # a bad record costs this note, never the person's other alerts
        print(f"[mail] rebalance note failed: {exc!r}")
        return []


def _rebalance_note(src, user, now, hist, records):
    found = rebalance.due(user, records, now) if records else None
    if not found:
        return []
    day, picked = found
    key = rebalance.dedupe_key(day)
    if key in hist.keys:
        return []  # sent on an earlier run; checked here so the log is not a skipped line every 15 minutes
    tracked = rebalance.tracked_tickers(user)
    email = rebalance.build_note(picked, tracked=tracked, now=now, quotes=rebalance.quotes_for(src, picked, now, tracked))
    return [(email, key)] if email else []


def _lifecycle(src, uid, user, now, hist, popular):
    created = parse_ts(user.get("created_at"))
    last_seen = parse_ts(user.get("last_sign_in_at"))
    tracked = user.get("tracked_stocks") or []
    age = (now - created) if created else None
    out = []

    def person(**kw):
        return load_person(src, uid, now=now, **kw)

    if age is not None and age <= timedelta(hours=48) and "welcome" not in hist.keys:
        p = person(with_news=False, with_calls=False)
        if p:
            out.append((lifecycle.build_welcome(p, popular, now=now), "welcome"))
    if not tracked and age is not None:
        for day in (2, 5):
            key = f"setup_nudge_d{day}"
            if timedelta(days=day) <= age < timedelta(days=day + 1) and key not in hist.keys:
                p = person(with_news=False, with_calls=False)
                if p:
                    out.append((lifecycle.build_setup_nudge(p, popular, day=day, now=now), key))
    if is_pro_user(user) and "pro_welcome" not in hist.keys and _converted_recently(src, uid, now):
        p = person(with_news=False)
        if p:
            out.append((lifecycle.build_pro_welcome(p), "pro_welcome"))
    et_now = now.astimezone(ET)
    # Monday, and not before 9am ET: the hourly run would otherwise send it just after midnight
    if not is_pro_user(user) and tracked and et_now.weekday() == 0 and et_now.hour >= 9 and _swap_available(user, now):
        year, week, _ = now.astimezone(ET).isocalendar()
        key = f"swap_open_{year}-W{week:02d}"
        if key not in hist.keys:
            p = person(with_news=False, with_calls=False)
            email = lifecycle.build_swap_open(p) if p else None
            if email:
                out.append((email, key))
    if tracked and last_seen and timedelta(days=21) <= now - last_seen < timedelta(days=60):
        key = f"winback_{last_seen.date().isoformat()}"
        if key not in hist.keys:
            p = person(with_news=False)
            email = lifecycle.build_winback(p, now=now) if p else None
            if email:
                out.append((email, key))
    return [(e, k) for e, k in out if e is not None][:1]  # at most one account email per run


def _converted_recently(src, uid, now) -> bool:
    since = (now - timedelta(days=3)).isoformat()
    rows = src.query("tm_lifecycle_events", [("uid", "==", uid), ("type", "==", "subscription_converted")], limit=20,
                     select=["created_at"])
    return any(str(r.get("created_at") or "") >= since for _, r in rows)


def _swap_available(user: dict, now: datetime) -> bool:
    """Free swaps one covered stock per rolling week (lib/entitlements-coverage.ts)."""
    week_ago = now - timedelta(days=7)
    for entry in user.get("covered_adds_log") or []:
        if not isinstance(entry, dict) or entry.get("kind") != "swap":
            continue
        at = parse_ts(entry.get("at"))
        if at and at > week_ago:
            return False
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("job", choices=["daily", "weekly", "alerts", "lifecycle"])
    ap.add_argument("--send", action="store_true", help="actually send (VPS only)")
    ap.add_argument("--uid", help="only this account")
    ap.add_argument("--to", help="send this account's email to this address instead; logs nothing")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    if args.to and not args.uid:
        sys.exit("--to needs --uid")
    stats = run(args.job, dry_run=not args.send, only_uid=args.uid, to=args.to, limit=args.limit,
                now=datetime.now(timezone.utc))
    print(dict(stats))
    if stats["aborted"]:
        sys.exit(1)  # show up as a failed unit in systemctl, not a quiet success


if __name__ == "__main__":
    main()
