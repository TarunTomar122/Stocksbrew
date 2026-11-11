"""The note at each rebalance: what a strategy you follow bought and sold, and why.

Pro only (lib/entitlements.ts: followed_strategies). The after-close job
(backend/agentdata/backtest_strategies.py) writes one record per strategy
rebalance into ``tm_strategy_rebalances``; the alerts job (every 15 minutes)
picks the ones for strategies a person follows and sends one email per
rebalance day, under the alerts preference, its daily cap and its unsubscribe
link. Off unless ``STRATEGY_REBALANCE_NOTES=1`` is set for the mail jobs.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Any

from backend.mail import kit
from backend.mail.data import parse_ts
from backend.mail.source import Source
from backend.subscription_entitlement import is_pro_user

COLLECTION = "tm_strategy_rebalances"
# Only rebalances this recent are sent, so switching the note on never mails an old one.
RECENT_DAYS = 3
# The job writes every strategy in one run; wait until the newest record of a day is this old so one email has them all.
SETTLE_MINUTES = 30
# Rows listed per strategy before the email points at the page.
MAX_ROWS = 10


def enabled() -> bool:
    return os.environ.get("STRATEGY_REBALANCE_NOTES") == "1"


def load_recent(src: Source, now: datetime) -> list[dict[str, Any]]:
    """Rebalance records from the last few days, oldest first."""
    since = (now - timedelta(days=RECENT_DAYS)).date().isoformat()
    rows = src.query(COLLECTION, [("date", ">=", since)], limit=500)
    out = [data for _, data in rows if isinstance(data.get("slug"), str) and isinstance(data.get("date"), str)]
    return sorted(out, key=lambda r: (r["date"], str(r.get("slug"))))


def followed(user: dict[str, Any]) -> dict[str, datetime | None]:
    """Slug -> when the person started following it (users/{uid}.tracked_strategies)."""
    out: dict[str, datetime | None] = {}
    for item in user.get("tracked_strategies") or []:
        if isinstance(item, dict) and isinstance(item.get("slug"), str):
            out[item["slug"]] = parse_ts(item.get("tracked_at"))
    return out


def due(user: dict[str, Any], records: list[dict[str, Any]], now: datetime) -> tuple[str, list[dict[str, Any]]] | None:
    """The rebalance day to send for this person and its records, or None.

    Pro, followed before the record was written, and settled. When more than one
    day qualifies (the job was late), the latest day wins; dedupe stops repeats.
    """
    if not is_pro_user(user):
        return None
    follows = followed(user)
    if not follows:
        return None
    by_day: dict[str, list[dict[str, Any]]] = {}
    newest: dict[str, datetime] = {}
    for record in records:
        written = parse_ts(record.get("generated_at"))
        day = record["date"]
        if written and (day not in newest or written > newest[day]):
            newest[day] = written
        if record["slug"] not in follows:
            continue
        since = follows[record["slug"]]
        if since is not None and written is not None and since > written:
            continue
        by_day.setdefault(day, []).append(record)
    settled = [day for day in by_day if day in newest and now - newest[day] >= timedelta(minutes=SETTLE_MINUTES)]
    if not settled:
        return None
    day = max(settled)
    return day, by_day[day]


def dedupe_key(day: str) -> str:
    return f"strategy_rebalance_{day}"


def _day(iso: str) -> str:
    try:
        return date.fromisoformat(iso[:10]).strftime("%b %-d")
    except ValueError:
        return iso


def _weight(value: Any) -> str:
    try:
        number = float(value) * 100
    except (TypeError, ValueError):
        return ""
    return f"{number:.1f}%" if number < 10 and abs(number - round(number)) > 0.05 else f"{number:.0f}%"


def title(record: dict[str, Any]) -> str:
    """One line for one strategy: "Momentum leaders swapped 3 of its 25 stocks"."""
    name = str(record.get("name") or "A strategy you follow")
    stocks = record.get("kind", "stocks") == "stocks"
    unit, units = ("stock", "stocks") if stocks else ("fund", "funds")
    added = len(record.get("added") or [])
    removed = len(record.get("removed") or [])
    before = int(record.get("previously_held") or 0)
    if record.get("market_ok") is False:
        return f"{name} sold everything and moved to cash"
    if added and not before:
        return f"{name} bought {kit.plural(added, unit, units)} after a spell in cash"
    if added and added == removed and before:
        return f"{name} swapped {added} of its {kit.plural(before, unit, units)}"
    if added and removed:
        return f"{name} added {kit.plural(added, unit, units)} and dropped {removed}"
    if added:
        return f"{name} added {kit.plural(added, unit, units)}"
    if removed:
        return f"{name} dropped {kit.plural(removed, unit, units)}"
    return f"{name} changed its weights"


def build_note(records: list[dict[str, Any]], *, unsubscribe_token: str | None = None) -> kit.Email | None:
    records = [r for r in records if r.get("slug")]
    if not records:
        return None
    doc = kit.Doc()
    many = len(records) > 1
    day = _day(str(records[0].get("date") or ""))
    if many:
        doc.h1(f"{len(records)} strategies you follow rebalanced")
        doc.p(f"{kit.join_words([str(r.get('name')) for r in records])}, on {day}.", muted=True, size=kit.t.TEXT_SM)
    else:
        doc.h1(title(records[0]))
    for record in records:
        slug = str(record["slug"])
        if many:
            doc.h2(title(record), aside=_day(str(record.get("date") or "")))
        if record.get("why"):
            doc.p(str(record["why"]))
        added = list(record.get("added") or [])
        removed = list(record.get("removed") or [])
        # Both sides get room: a big intake never hides every stock that left.
        n_out = min(len(removed), max(MAX_ROWS // 2, MAX_ROWS - len(added)))
        n_in = min(len(added), MAX_ROWS - n_out)
        rows: list[tuple[str, str, str, str]] = []
        for item in added[:n_in]:
            rows.append((str(item.get("symbol")), "in", _weight(item.get("weight")), str(item.get("reason") or "")))
        for item in removed[:n_out]:
            rows.append((str(item.get("symbol")), "out", "", str(item.get("reason") or "")))
        if rows:
            doc.changes(rows, link=record.get("kind", "stocks") == "stocks")
            hidden = len(added) + len(removed) - len(rows)
            if hidden > 0:
                doc.p(f"Plus {hidden} more on the strategy page.", muted=True, size=kit.t.TEXT_SM)
        if many:
            doc.link(f"Open {record.get('name')}", kit.app_url(f"/strategies/{slug}") + "#rebalance")
    picked = {_day(str(r.get("signal_date") or r.get("date") or "")) for r in records}
    when = f" at the close on {picked.pop()}" if len(picked) == 1 else ""
    doc.p(f"The rules' picks{when}, not trades made for you.", muted=True, size=kit.t.TEXT_SM)
    if many:
        doc.button("See your strategies", kit.app_url("/strategies"))
    else:
        doc.button("Open the strategy", kit.app_url(f"/strategies/{records[0]['slug']}") + "#rebalance")

    if many:
        subject = f"{len(records)} of your strategies rebalanced: {kit.join_words([str(r.get('name')) for r in records][:3])}"
        preheader = " ".join(str(r.get("headline") or "") for r in records[:2]).strip()
    else:
        subject = title(records[0])
        preheader = str(records[0].get("headline") or "")
    return kit.render(
        doc,
        kind="strategy_rebalance",
        category="alerts",
        subject=subject,
        preheader=preheader,
        unsubscribe_token=unsubscribe_token,
        meta={"count": len(records), "day": str(records[0].get("date") or "")},
        reason="You get this because you follow a strategy on stocksbrew.",
    )
