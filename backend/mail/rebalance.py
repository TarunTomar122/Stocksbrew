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
# Stocks listed per strategy (as logo chips) before the email points at the page.
MAX_ROWS = 24


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


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    cut = text.find(". ")
    return text[: cut + 1] if cut > 0 else text


def tracked_tickers(user: dict[str, Any]) -> set[str]:
    """US_NVDA -> NVDA, for the stocks this person tracks."""
    return {str(i).split("_", 1)[-1].upper() for i in user.get("tracked_stocks") or [] if str(i).startswith("US_")}


def _section(doc: kit.Doc, record: dict[str, Any]) -> None:
    """One strategy's changes: the rule in one sentence, then what it bought and sold as logo chips."""
    link = record.get("kind", "stocks") == "stocks"
    if record.get("why"):
        doc.p(_first_sentence(str(record["why"])), muted=True, size=kit.t.TEXT_SM)
    added = list(record.get("added") or [])
    removed = list(record.get("removed") or [])
    # Both sides get room: a big intake never hides every stock that left.
    n_out = min(len(removed), max(MAX_ROWS // 2, MAX_ROWS - len(added)))
    n_in = min(len(added), MAX_ROWS - n_out)
    ins, outs = added[:n_in], removed[:n_out]
    weights = {_weight(i.get("weight")) for i in ins}
    same = len(weights) == 1 and "" not in weights
    if ins:
        doc.h2(f"Bought {len(added)}", aside=f"{weights.pop()} each" if same else None)
        more = f"and {len(added) - len(ins)} more on the strategy page" if len(added) > len(ins) else ""
        doc.chips([(str(i.get("symbol")), None) for i in ins], link=link, more=more)
        doc.text.pop()
        doc.text.extend(f"  {'In':<4} {str(i.get('symbol')):<6} {_weight(i.get('weight')):>6}".rstrip() for i in ins)
    if outs:
        doc.h2(f"Sold {len(removed)}")
        more = f"and {len(removed) - len(outs)} more on the strategy page" if len(removed) > len(outs) else ""
        doc.chips([(str(r.get("symbol")), None) for r in outs], link=link, more=more)
        doc.text.pop()
        doc.text.extend(f"  {'Out':<4} {str(r.get('symbol'))}" for r in outs)
    hidden = len(added) + len(removed) - len(ins) - len(outs)
    if hidden > 0:
        doc.text.append(f"Plus {hidden} more on the strategy page.")


def overlap_line(records: list[dict[str, Any]], tracked: set[str]) -> str:
    """What the rebalance means for this reader: which of their own stocks each strategy bought or sold."""
    def names(items: list[str]) -> str:
        return kit.join_words(items) if len(items) <= 4 else f"{', '.join(items[:4])} and {len(items) - 4} more"

    lines = []
    for r in records:
        came = sorted({str(i.get("symbol")).upper() for i in r.get("added") or []} & tracked)
        left = sorted({str(i.get("symbol")).upper() for i in r.get("removed") or []} & tracked)
        bits = [f"bought {names(came)}" if came else "", f"sold {names(left)}" if left else ""]
        bits = [b for b in bits if b]
        if bits:
            who = str(r.get("name") or "It") if len(records) > 1 else "It"
            lines.append(f"{who} {' and '.join(bits)}.")
    if not lines:
        return "None of the stocks you track came in or left."
    return "Of the stocks you track: " + " ".join(lines) if len(records) > 1 else \
        "Of the stocks you track, it " + lines[0][3:]


def build_note(records: list[dict[str, Any]], *, unsubscribe_token: str | None = None,
               tracked: set[str] | None = None) -> kit.Email | None:
    records = [r for r in records if r.get("slug")]
    if not records:
        return None
    tracked = tracked or set()
    doc = kit.Doc()
    many = len(records) > 1
    day = _day(str(records[0].get("date") or ""))
    picked = {_day(str(r.get("signal_date") or r.get("date") or "")) for r in records}
    when = f" at the close on {picked.pop()}" if len(picked) == 1 else ""
    honest = f"The rules' picks{when}, not trades made for you."
    if many:
        doc.h1(f"{len(records)} strategies you follow rebalanced on {day}.")
    else:
        doc.h1(title(records[0]) + ".")
    lead = overlap_line(records, tracked) if tracked else ""
    sub = " ".join(x for x in (lead, "" if many else str(records[0].get("headline") or "").strip()) if x)
    if sub:
        doc.p(sub, size=kit.t.TEXT_SM)
    for record in records:
        if many:
            doc.divider()
            doc.raw(
                f"<p class='sbi' style='margin:0 0 6px;font-size:18px;line-height:1.3;font-weight:700;color:{kit.t.INK}'>"
                f"<a href='{kit.esc(kit.app_url(f'/strategies/{record['slug']}') + '#rebalance')}' class='sbi' "
                f"style='color:{kit.t.INK};text-decoration:none'>{kit.esc(title(record))}</a></p>",
                title(record),
            )
        _section(doc, record)
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
    if lead and tracked:
        preheader = lead  # what it means for you beats the strategy's own counts
    return kit.render(
        doc,
        kind="strategy_rebalance",
        category="alerts",
        subject=subject,
        preheader=preheader,
        unsubscribe_token=unsubscribe_token,
        meta={"count": len(records), "day": str(records[0].get("date") or "")},
        reason=f"You get this because you follow a strategy on stocksbrew. {honest}",
        dateline=f"Rebalance · {day}",
    )
