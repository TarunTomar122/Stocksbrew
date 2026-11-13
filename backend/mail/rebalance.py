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
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.mail import kit
from backend.mail.data import ET, parse_ts
from backend.mail.source import Source
from backend.subscription_entitlement import is_pro_user

COLLECTION = "tm_strategy_rebalances"
# Only rebalances this recent are sent, so switching the note on never mails an old one.
RECENT_DAYS = 3
# The job writes every strategy in one run; wait until the newest record of a day is this old so one email has them all.
SETTLE_MINUTES = 30
# Stocks listed per side in the plain-text part before it points at the strategy page.
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


def _day(iso: str, today: date) -> str:
    """"yesterday", "Monday", or "Nov 3" beyond a week (kit.day_word)."""
    return kit.day_word(iso, today)


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


def tracked_tickers(user: dict[str, Any]) -> set[str]:
    """US_NVDA -> NVDA, for the stocks this person tracks."""
    return {str(i).split("_", 1)[-1].upper() for i in user.get("tracked_stocks") or [] if str(i).startswith("US_")}


CARDS_PER_SIDE = 4  # stock cards per side (bought, sold) for one strategy; the strategy page has the full list
CARDS_PER_SIDE_MANY = 2  # when several strategies rebalanced the same day


def _picks(items: list[dict[str, Any]], tracked: set[str], weight_key: str, n: int = CARDS_PER_SIDE) -> list[dict[str, Any]]:
    """The biggest weights up to `n`, after every stock the reader tracks (which the limit never cuts)."""
    def weight(i: dict[str, Any]) -> float:
        try:
            return float(i.get(weight_key) or 0)
        except (TypeError, ValueError):
            return 0.0
    mine = sum(1 for i in items if str(i.get("symbol")).upper() in tracked)
    return sorted(items, key=lambda i: (str(i.get("symbol")).upper() not in tracked, -weight(i)))[:max(n, mine)]


def quotes_for(src: Source | None, records: list[dict[str, Any]], now: datetime, tracked: set[str] | None = None) -> dict:
    """Latest quotes (price, day move, name) for the stocks the note will show as cards; {} without a source."""
    if src is None:
        return {}
    from backend.mail.data import stocks_by_id

    tracked = tracked or set()
    tickers: list[str] = []
    for r in records:
        for items, key in ((_named(r.get("added")), "weight"), (_named(r.get("removed")), "previous_weight")):
            # the same cards _section draws: every tracked stock, then the biggest weights among the rest
            tickers += [str(i.get("symbol")).upper() for i in items if str(i.get("symbol")).upper() in tracked]
            others = [i for i in items if str(i.get("symbol")).upper() not in tracked]
            tickers += [str(i.get("symbol")).upper() for i in _picks(others, set(), key)]
    ids = [f"US_{t}" for t in dict.fromkeys(tickers) if t]
    return {s.ticker: s for s in stocks_by_id(src, ids, now=now)} if ids else {}


def _named(items: Any) -> list[dict[str, Any]]:
    """Entries with a symbol; one without is left out rather than shown as a stock called "NONE"."""
    return [i for i in items or [] if isinstance(i, dict) and str(i.get("symbol") or "").strip()]


def _first_sentence(text: str) -> str:
    text = (text or "").strip()
    cut = text.find(". ")
    return text[: cut + 1] if cut > 0 else text


def _section(doc: kit.Doc, record: dict[str, Any], tracked: set[str], quotes: dict, today: date, n: int = CARDS_PER_SIDE) -> None:
    """One strategy's changes as stock cards with price and day move. The stocks the reader tracks come first, all of
    them, under "Stocks you track" with a Bought or Sold pill (said once in the heading, not on every card); then a
    few of the rest a side, biggest weight first. The plain text keeps the whole list. The rule itself lives on the
    strategy page (owner rule 8)."""
    link = record.get("kind", "stocks") == "stocks"
    added, removed = _named(record.get("added")), _named(record.get("removed"))

    def symbol(i: dict[str, Any]) -> str:
        return str(i.get("symbol")).upper()

    def card(i: dict[str, Any], *, bought: bool, pill: str = "") -> kit.Card:
        t = symbol(i)
        q = quotes.get(t)
        # why the rules bought it, when that is one short plain sentence ("Closed 7.2% above its 200-day average.")
        why = _first_sentence(str(i.get("reason") or "")) if bought else ""
        return kit.Card(ticker=t, name=q.name if q else "", price=q.price if q else None, move=q.change_pct if q else None,
                        period=kit.day_word(q.price_at.astimezone(ET).date(), today) if q and q.price_at else "",
                        call=pill, line=why if "Rank" not in why else "", link=link)

    mine = [(i, True) for i in added if symbol(i) in tracked] + [(i, False) for i in removed if symbol(i) in tracked]
    if mine:
        doc.h2("Stocks you track")
        before = len(doc.text)
        doc.cards([card(i, bought=b, pill="Bought" if b else "Sold") for i, b in mine])
        del doc.text[before:]
        doc.text.extend(f"  {'In' if b else 'Out':<4} {symbol(i)}" for i, b in mine)
    for items, bought, word in ((added, True, "Bought"), (removed, False, "Sold")):
        if not items:
            continue
        others = [i for i in items if symbol(i) not in tracked]
        shown = _picks(others, set(), "weight" if bought else "previous_weight", n)
        weights = {_weight(i.get("weight")) for i in items} if bought else set()
        same = len(weights) == 1 and "" not in weights
        # the strategy's title above says how many came in and left ("swapped 18 of its 20 stocks"): the heading
        # counts them only when the title doesn't ("sold everything and moved to cash")
        counted = re.search(rf"\b{len(items)}\b", title(record))
        doc.h2(word if counted else f"{word} {len(items)}", aside=f"{weights.pop()} each" if same else None)
        before = len(doc.text)
        doc.cards([card(i, bought=bought) for i in shown])
        del doc.text[before:]  # the plain text lists every stock instead of the cards
        doc.text.extend(f"  {'In' if bought else 'Out':<4} {symbol(i):<6} {_weight(i.get('weight')) if bought else ''}".rstrip()
                        for i in items[:MAX_ROWS])
        if len(others) > len(shown):
            doc.p(f"And {len(others) - len(shown)} more on the strategy page.", muted=True, size=kit.t.TEXT_SM)
    hidden = max(0, len(added) - MAX_ROWS) + max(0, len(removed) - MAX_ROWS)
    if hidden:
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
               tracked: set[str] | None = None, now: datetime | None = None, quotes: dict | None = None) -> kit.Email | None:
    """``quotes`` (ticker -> data.Stock, from quotes_for) gives the cards their price and day move."""
    records = [r for r in records if r.get("slug")]
    if not records:
        return None
    tracked = tracked or set()
    doc = kit.Doc()
    many = len(records) > 1
    today = (now or datetime.now(timezone.utc)).astimezone(ET).date()
    day = _day(str(records[0].get("date") or ""), today)
    on = day if day in ("today", "yesterday") else f"on {day}" if day else "this week"
    picked = {kit.close_word(when, today) for r in records if (when := str(r.get("signal_date") or r.get("date") or ""))}
    # "at yesterday's close", "at Monday's close", "at the Nov 3 close"
    close = picked.pop() if len(picked) == 1 else ""
    when = (f" at {close[:1].lower() + close[1:]}" if close.startswith(("Today", "Yesterday")) else
            f" at {close}" if "'" in close else f" at the {close}" if close else "")
    honest = f"The rules' picks{when}, not trades made for you."
    if many:
        doc.h1(f"{len(records)} strategies you follow rebalanced {on}.")
    else:
        doc.h1(title(records[0]) + ".")
    # what it means for the reader, in one line of 15 words at most; the cards show their own stocks first
    lead = overlap_line(records, tracked) if tracked else ""
    lead = lead if kit.fits(lead) else ""
    if lead:
        doc.p(lead, size=kit.t.TEXT_SM)
    for record in records:
        if many:
            doc.divider()
            doc.raw(
                f"<p class='sbi' style='margin:0 0 6px;font-size:18px;line-height:1.3;font-weight:700;color:{kit.t.INK}'>"
                f"<a href='{kit.esc(kit.app_url(f'/strategies/{record['slug']}') + '#rebalance')}' class='sbi' "
                f"style='color:{kit.t.INK};text-decoration:none'>{kit.esc(title(record))}</a></p>",
                title(record),
            )
        _section(doc, record, tracked, quotes or {}, today, CARDS_PER_SIDE_MANY if many else CARDS_PER_SIDE)
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
        dateline=f"Rebalance · {kit.cap(day)}" if day else "Rebalance",
    )
