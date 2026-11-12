"""The daily brief: before the US open, only on days something happened.

A day is worth an email when at least one stock the person gets the daily
for has a hard event: it crossed one of our levels, the research call
changed, it moved a lot (in the last session or before today's open), or it
reports earnings today or tomorrow. Headlines ride along as the "why" but
never trigger a send on their own.

The email leads with one line about what matters most to this person today,
then up to three insight cards (each a figure against a baseline), then a card
per stock: what happened, why it matters to them, our call, one number.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.mail.data import ET, FREE_COVERED_STOCKS, Headline, Person, Stock, _mentions, direction, is_reason_headline

BIG_MOVE_PCT = 4.0  # floor for any stock
BIG_MOVE_HOLDING_PCT = 3.0  # floor for holdings
BIG_MOVE_TYPICAL_MULT = 2.5  # and at least this many times the stock's normal day
PREMARKET_MOVE_PCT = 4.0  # a pre-market move this big is news on its own (and 2.5x the normal day)
MAX_CARDS = 8

@dataclass
class Item:
    stock: Stock
    kind: str  # level_add | level_trim | call_change | big_move | premarket | earnings
    score: float
    headline: str  # what happened, one sentence with its number
    detail: str  # why it matters to this person
    source: str = ""
    level: float | None = None  # the level a level item crossed
    fallback: str = ""  # said instead of `detail` when another card says the same thing
    meta: str = ""  # a small line under the card that differs per stock


def next_session(day: date) -> date:
    d = day + timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def earnings_day(d: date, today: date) -> str:
    if d == today:
        return "today"
    if (d - today).days == 1:
        return "tomorrow"
    if (d - today).days < 7:
        return d.strftime("%A")
    return d.strftime("%A, %b %-d")


def earnings_when(d: date, time: str, today: date) -> str:
    slot = {"bmo": "before the open", "amc": "after the close", "during": "during market hours"}.get(time, "")
    return f"{earnings_day(d, today)} {slot}".strip()


def session_word(at: datetime | None, today: date) -> str:
    if at is None:
        return "in the last session"
    d = at.astimezone(ET).date()
    if d == today:
        return "today"
    if (today - d).days == 1:
        return "yesterday"
    return f"on {d.strftime('%A')}"


_DATELINE = re.compile(r"^[A-Z][A-Z .'-]+,(?: [A-Z][A-Za-z.]+,)? [A-Z][a-z]+ \d{1,2}, \d{4}\s*-+\s*")
_EXCHANGE_TAG = re.compile(r"\s*\((?:NASDAQ|NasdaqGS|NasdaqGM|NYSE|NYSEAMERICAN|Nasdaq|NYSE American)\s*:\s*[A-Z.]+\)")


def _clean_summary(text: str) -> str:
    """Drop press-release datelines ("SAN JOSE, Calif., November 11, 2026--") and exchange tags ("(NASDAQ:MU)")."""
    return _EXCHANGE_TAG.sub("", _DATELINE.sub("", text or "")).strip()


_JUNK_SUMMARY = re.compile(r"we just (published|covered)|is one of the|\bour list\b|\branks?\b \d|key takeaways", re.I)


_CAUSE = re.compile(r"\b(as|after|on|despite|amid|following|because|with|over|ahead of|due to)\b", re.I)
_UP_WORDS = re.compile(r"\b(rise|rises|rose|rising|jump|jumps|jumped|surge|surges|surged|soar|soars|soared|gain|gains|gained|"
                       r"climb|climbs|climbed|rally|rallies|rallied|spike|spikes|spiked|pop|pops|popped|advance|advances|"
                       r"higher|rebound|rebounds|leaps?)\b", re.I)
_DOWN_WORDS = re.compile(r"\b(fall|falls|fell|falling|slip|slips|slipped|drop|drops|dropped|slide|slides|slid|sink|sinks|sank|"
                         r"tumble|tumbles|tumbled|plunge|plunges|plunged|decline|declines|declined|lower|sheds?|sinking|"
                         r"slump|slumps|slumped|sell-off|selloff)\b", re.I)


def reason_text(h: Headline, stock: Stock, move: float | None = None) -> str:
    """The headline as a reason a person would write, or "" when it isn't one.

    Scraped Title Case headlines are rewritten in sentence case; when the summary's first
    sentence names the company and reads cleanly, that is used instead. A wire headline about
    several companies is cut to this stock's clause. The result must name a cause ("as", "after",
    "despite"...) and must not contradict `move` (the move it is meant to explain, default the
    last session's); a number that disagrees with `move` by more than a point is dropped.
    """
    move = stock.change_pct if move is None else move
    title = h.title.strip()
    summary = _clean_summary(h.summary)
    text = ""
    if kit.is_title_case(title) and summary:
        first = re.split(r"(?<=[.!?])\s+", summary, maxsplit=1)[0].strip()
        if (30 <= len(first) <= 200 and _mentions(first, stock) and not _JUNK_SUMMARY.search(first)
                and not first.endswith("…") and is_reason_headline(first)):
            text = first
    if not text:
        text = own_clause(kit.sentence_case(title, h.summary), stock)
    text = fix_numbers(text, stock, move)
    if not _CAUSE.search(text) or not agrees(text, stock, move):
        return ""
    return text


def fix_numbers(text: str, stock: Stock, move: float | None) -> str:
    """Headlines are often written mid-session ("Sandisk surges 8%") while the card shows the close (+12.3%).
    In the clause about this stock, a move that disagrees with `move` by more than a point is dropped,
    so the card never shows two different numbers for the same day."""
    if move is None:
        return text
    parts = text.split("; ")
    idx = next((i for i, p in enumerate(parts) if _mentions(p, stock)), None)
    if idx is None:
        return text

    def drop(m: re.Match) -> str:
        return "" if abs(float(m.group(1)) - abs(move)) > 1.0 else m.group(0)

    parts[idx] = re.sub(r"\s(?:about\s|nearly\s|almost\s|over\s)?(\d+(?:\.\d+)?)%", drop, parts[idx])
    return "; ".join(parts)


def own_clause(text: str, stock: Stock) -> str:
    """A wire headline about several companies, cut down to this stock's own clause.

    "Seagate spikes 9%, Sandisk surges 8% as CoreWeave's results revive AI trade; Micron climbs 7%"
    -> "Sandisk surges 8% as CoreWeave's results revive AI trade". A clause with no cause of its own
    ("Nebius gains 13%") is not a reason, and reason_text then drops the headline.
    """
    parts = [p.strip() for p in re.split(r";\s+|,\s+(?=[A-Z])", text) if p.strip()]
    if len(parts) < 2:
        return text
    mine = [p for p in parts if _mentions(p, stock)]
    return mine[0] if mine else text


def agrees(text: str, stock: Stock, move: float | None = None) -> bool:
    """A headline that says the stock fell can't explain a move up (and the other way round).

    Only the clause about this stock is read, since a wire headline often covers several companies.
    """
    move = stock.change_pct if move is None else move
    if move is None:
        return True
    own = next((p for p in text.split("; ") if _mentions(p, stock)), text)
    up, down = bool(_UP_WORDS.search(own)), bool(_DOWN_WORDS.search(own))
    if move > 0:
        return not (down and not up)
    return not (up and not down)


def first_reason(stock: Stock, start: datetime, end: datetime, move: float | None) -> tuple[str, str]:
    """The newest headline published between start and end that explains `move`, with its source."""
    for h in sorted((h for h in stock.news if start <= h.published_at <= end), key=lambda h: h.published_at, reverse=True):
        text = reason_text(h, stock, move)
        if text:
            return text, source_line(h)
    return "", ""


def why_line(stock: Stock, spy: Stock | None = None) -> tuple[str, str]:
    """A confirmed reason for the last session's move and its source, or ("", "") when we have none.

    Only news from the day before the session through its close can explain it.
    When nothing explains it we write nothing (owner rule): no "no confirmed reason" filler.
    """
    if stock.price_at is not None:
        found = first_reason(stock, stock.price_at - timedelta(hours=30), stock.price_at + timedelta(minutes=30), stock.change_pct)
        if found[0]:
            return found
    if spy and spy.change_pct is not None and abs(spy.change_pct) >= 1 and stock.change_pct is not None \
            and (spy.change_pct > 0) == (stock.change_pct > 0):
        verb = "rose" if spy.change_pct > 0 else "fell"
        return f"The whole market moved: the S&P 500 {verb} {kit.pct(spy.change_pct, signed=False)} the same day.", ""
    return "", ""


def premarket_why(stock: Stock, now: datetime) -> tuple[str, str]:
    """A reason for this morning's pre-market move: only news since the last close, checked against that move."""
    if stock.price_at is None:
        return "", ""
    return first_reason(stock, stock.price_at, now, stock.premarket_pct)


def source_line(h: Headline) -> str:
    """"Yahoo Finance · Nov 11, 9:05am ET": where a reason came from and when, short enough for a card."""
    at = h.published_at.astimezone(ET)
    when = f"{at.strftime('%b %-d')}, {at.strftime('%-I:%M%p').lower()} ET"
    return f"{h.source} · {when}" if h.source else when


def times(mult: float) -> str:
    """2.5 -> "2.5x", 3.0 -> "3x", 12.4 -> "12x"."""
    if mult >= 10:
        return f"{mult:.0f}x"
    return f"{mult:.1f}".rstrip("0").rstrip(".") + "x"


def big_move_threshold(s: Stock) -> float:
    floor = BIG_MOVE_HOLDING_PCT if s.position == "holding" else BIG_MOVE_PCT
    typical = s.typical_move_pct
    return max(floor, typical * BIG_MOVE_TYPICAL_MULT) if typical else floor


def _yours(s: Stock) -> str:
    return "You hold it" if s.position == "holding" else "It's on your watchlist"


def _call(s: Stock) -> str:
    return kit.call_label(s.stance, s.call_text)


def items_for(person: Person, now: datetime, spy: Stock | None = None) -> list[Item]:
    today = now.astimezone(ET).date()
    items: list[Item] = []
    for s in person.emailed_stocks():
        if s.price is None:
            continue
        when = session_word(s.price_at, today)
        add_lvl, trim_lvl = s.standing_levels()
        # a crossing only counts while the current call still agrees with it:
        # "add zone" under a call that now says hold would contradict itself
        crossed_add = bool(add_lvl and s.prev_close and s.prev_close > add_lvl >= s.price
                           and direction(s.stance) == "bullish")
        crossed_trim = bool(trim_lvl and s.prev_close and s.prev_close < trim_lvl <= s.price
                            and direction(s.stance) != "bullish")
        if crossed_add:
            why = (f"You hold it. {kit.recent_move(s.closes)}" if s.position == "holding"
                   else f"On your watchlist. {kit.recent_move(s.closes)}").strip()
            items.append(Item(s, "level_add", 100, kit.level_phrase(s.price, add_lvl, "add") + f" {when}.", why, level=add_lvl))
            continue
        if crossed_trim:
            why = (f"You hold it. {kit.recent_move(s.closes)}" if s.position == "holding"
                   else f"On your watchlist. {kit.recent_move(s.closes)}").strip()
            items.append(Item(s, "level_trim", 100, kit.level_phrase(s.price, trim_lvl, "trim") + f" {when}.", why, level=trim_lvl))
            continue
        if (s.previous_stance and s.calls and s.stable_before_change()
                and direction(s.previous_stance) != direction(s.stance)
                and (today - date.fromisoformat(s.calls[-1].day)).days <= 3):
            before = kit.call_label(s.previous_stance)
            after = _call(s)
            items.append(Item(s, "call_change", 90, f"We moved our call from {before} to {after}.", s.call_reason))
            # context for the card when several calls share the same canned reason
            items[-1].fallback = kit.recent_move(s.closes)
            continue
        threshold = big_move_threshold(s)
        if s.change_pct is not None and abs(s.change_pct) >= threshold:
            up = s.change_pct > 0
            why, source = why_line(s, spy)
            typical = s.typical_move_pct
            score = 80 + min(15, abs(s.change_pct) / typical) if typical else 80 + abs(s.change_pct) / 4
            if s.position == "holding":
                score += 5
            moved = f"{'Rose' if up else 'Fell'} {kit.pct(s.change_pct, signed=False)} {when}"
            # the baseline: how unusual this day was for this stock
            moved += f", {times(abs(s.change_pct) / typical)} its usual daily move." if typical else "."
            it = Item(s, "big_move", score, moved, why, source)
            it.meta = f"{times(abs(s.change_pct) / typical)} a normal day for {s.ticker}" if typical else ""
            items.append(it)
            continue
        pre = s.premarket_pct
        typical = s.typical_move_pct
        if pre is not None and abs(pre) >= max(PREMARKET_MOVE_PCT, (typical or 0) * BIG_MOVE_TYPICAL_MULT):
            up = pre > 0
            line = f"{'Up' if up else 'Down'} {kit.pct(pre, signed=False)} before the open"
            line += f", {times(abs(pre) / typical)} its usual daily move." if typical else "."
            why, source = premarket_why(s, now)
            it = Item(s, "premarket", 78 + min(10, abs(pre) / 2), line, why, source)
            it.meta = f"{times(abs(pre) / typical)} a normal day for {s.ticker}" if typical else ""
            items.append(it)
            continue
        if s.earnings_date and s.earnings_date <= next_session(today):
            when_e = earnings_when(s.earnings_date, s.earnings_time, today)
            it = Item(s, "earnings", 70, f"Reports {when_e}.", "")
            it.meta = f"A normal day moves it {kit.pct(typical, signed=False)}" if typical else ""
            items.append(it)
    items.sort(key=lambda i: (-i.score, i.stock.ticker))
    return items


# ------------------------------------------------------------------ words

def _phrase(group: list[Item], today: date, *, short: bool) -> str:
    """One clause for one or more items of the same kind."""
    i = group[0]
    names = kit.join_words([g.stock.ticker for g in group])
    s = i.stock
    if i.kind == "level_add":
        return f"{names} {'at' if short else 'reached'} our buy-more price"
    if i.kind == "level_trim":
        return f"{names} {'at' if short else 'reached'} our sell-some price"
    if i.kind == "call_change":
        return f"{names} now {_call(s)}" if short else f"we moved {names} to {_call(s)}"
    if i.kind == "big_move":
        up = (s.change_pct or 0) > 0
        return f"{s.ticker} {'up' if up else 'down'} {kit.pct(s.change_pct, signed=False)}" if short else \
            f"{s.ticker} {kit.verb(s.change_pct)} {kit.pct(s.change_pct, signed=False)}"
    if i.kind == "premarket":
        up = (s.premarket_pct or 0) > 0
        return f"{s.ticker} {'up' if up else 'down'} {kit.pct(s.premarket_pct, signed=False)} pre-market" if short else \
            f"{s.ticker} is {'up' if up else 'down'} {kit.pct(s.premarket_pct, signed=False)} before the open"
    day = earnings_day(s.earnings_date, today) if s.earnings_date else "soon"
    return f"{names} {'report' if len(group) > 1 else 'reports'} {day}"


def _groups(items: list[Item]) -> list[list[Item]]:
    """Level and call items of the same kind (and the same new call) read as one clause; moves stay one each."""
    out: list[list[Item]] = []
    keyed: dict[tuple, list[Item]] = {}
    for i in items:
        if i.kind in ("level_add", "level_trim", "call_change", "earnings"):
            key = (i.kind, _call(i.stock) if i.kind == "call_change" else "",
                   i.stock.earnings_date if i.kind == "earnings" else None)
            if key in keyed:
                keyed[key].append(i)
                continue
            keyed[key] = [i]
            out.append(keyed[key])
        else:
            out.append([i])
    return out


def subject_for(items: list[Item], today: date) -> str:
    groups = _groups(items)
    parts = [_phrase(g, today, short=True) for g in groups[:2]]
    subject = kit.cap(", ".join(parts))
    rest = len(items) - sum(len(g) for g in groups[:2])
    if len(subject) > 60 and len(parts) > 1:
        subject = kit.cap(parts[0])
        rest = len(items) - len(groups[0])
    return f"{subject} + {rest} more" if rest > 0 else subject


def headline_for(items: list[Item], today: date) -> str:
    """One idea and one number: the most important change, said plainly."""
    i = items[0]
    st = i.stock
    if i.kind in ("level_add", "level_trim") and i.level and st.price:
        word = "buy-more" if i.kind == "level_add" else "sell-some"
        gap = (st.price - i.level) / i.level * 100
        if abs(gap) <= 0.2:
            return f"{st.ticker} closed right at our {word} price of {kit.money(i.level)}."
        return f"{st.ticker} closed {kit.pct(abs(gap), signed=False)} {'under' if gap < 0 else 'over'} our {word} price of {kit.money(i.level)}."
    if i.kind == "call_change":
        return f"We moved {st.ticker} to {_call(st)}."
    if i.kind == "big_move":
        return f"{st.ticker} {kit.verb(st.change_pct)} {kit.pct(st.change_pct, signed=False)}, {i.meta.split(' for ')[0]}." if i.meta \
            else f"{st.ticker} {kit.verb(st.change_pct)} {kit.pct(st.change_pct, signed=False)}."
    if i.kind == "premarket":
        return f"{st.ticker} is {'up' if (st.premarket_pct or 0) > 0 else 'down'} {kit.pct(st.premarket_pct, signed=False)} before the open."
    return f"{st.ticker} reports {earnings_when(st.earnings_date, st.earnings_time, today)}." if st.earnings_date else f"{st.ticker} reports soon."


def _avg(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def insights_for(person: Person, items: list[Item], spy: Stock | None, today: date) -> list[kit.Insight]:
    stocks = [s for s in person.emailed_stocks() if s.change_pct is not None]
    out: list[kit.Insight] = []
    if len(stocks) >= 2:
        avg = _avg([s.change_pct for s in stocks])
        rose = sum(1 for s in stocks if round(s.change_pct or 0, 1) > 0)
        top = max(stocks, key=lambda s: abs(s.change_pct or 0))
        when = session_word(max((s.price_at for s in stocks if s.price_at), default=None), today)
        vs = f", against {kit.pct(spy.change_pct)} for the S&P 500" if spy and spy.change_pct is not None else ""
        out.append(kit.Insight(kit.pct(avg), f"Your {len(stocks)} stocks {when}{vs}. {rose} rose; {top.ticker} moved most, "
                               f"{kit.pct(top.change_pct)}.", avg))
    holdings = [s for s in stocks if s.position == "holding"]
    if len(holdings) >= 2 and len(holdings) < len(stocks):
        h_avg = _avg([s.change_pct for s in holdings])
        lead = max(holdings, key=lambda s: abs(s.change_pct or 0))
        out.append(kit.Insight(kit.pct(h_avg), f"The {len(holdings)} you hold. {lead.ticker} moved most, {kit.pct(lead.change_pct)}.", h_avg))
    pre = [s for s in person.emailed_stocks() if s.premarket_pct is not None and abs(s.premarket_pct) >= 1]
    if pre:
        top = max(pre, key=lambda s: abs(s.premarket_pct or 0))
        others = len(pre) - 1
        tail = f" {kit.plural(others, 'other')} of yours {'is' if others == 1 else 'are'} moving 1% or more." if others else ""
        out.append(kit.Insight(kit.pct(top.premarket_pct), f"{top.ticker} before the open, your biggest pre-market move.{tail}",
                               top.premarket_pct))
    week_end = today + timedelta(days=(4 - today.weekday()) if today.weekday() < 5 else 6)
    reporting = sorted([s for s in person.emailed_stocks() if s.earnings_date and today <= s.earnings_date <= week_end],
                       key=lambda s: (s.earnings_date, s.ticker))
    earnings_cards = {i.stock.id for i in items[:MAX_CARDS] if i.kind == "earnings"}
    if reporting and len(out) < 3 and reporting[0].id not in earnings_cards:
        first = reporting[0]
        label = _call(first)
        call = kit.call_pill_text(label, kit.call_level(label, first.add_below, first.trim_above))
        more = f" {kit.plural(len(reporting) - 1, 'more')} of yours report by Friday." if len(reporting) > 1 else ""
        out.append(kit.Insight(kit.cap(earnings_day(first.earnings_date, today)),
                               f"{first.ticker} reports{' ' + {'bmo': 'before the open', 'amc': 'after the close'}.get(first.earnings_time, '') if first.earnings_time in ('bmo', 'amc') else ''}."
                               f"{' Our call going in: ' + call + '.' if call else ''}{more}"))
    if len(out) < 3:
        near = []
        for s in person.emailed_stocks():
            if not s.price or _call(s) != kit.BUY:
                continue
            lvl = kit.call_level(kit.BUY, s.add_below, s.trim_above)
            if lvl and s.price <= lvl * 1.02:
                near.append((s.price / lvl - 1, s))
        near.sort(key=lambda x: x[0])
        if near:
            tickers = [s.ticker for _, s in near]
            names = kit.join_words(tickers) if len(tickers) <= 3 else f"{', '.join(tickers[:3])} and {len(tickers) - 3} more"
            out.append(kit.Insight(str(len(near)), f"of your stocks {'is' if len(near) == 1 else 'are'} at, under or within 2% of "
                                   f"our buy-more price: {names}."))
    return out[:3]


def card_for(i: Item, today: date) -> kit.Card:
    s = i.stock
    label = _call(s)
    add, trim = s.add_below, s.trim_above
    level = i.level if i.kind in ("level_add", "level_trim") else kit.call_level(label, add, trim)
    if i.kind == "premarket":
        figure, value = kit.pct(s.premarket_pct), s.premarket_pct
    else:
        figure, value = (kit.pct(s.change_pct), s.change_pct) if s.change_pct is not None else ("", None)
    line, why = i.headline, i.detail
    if i.kind in ("level_add", "level_trim"):
        when = session_word(s.price_at, today)
        line = f"Closed at {kit.money_pair(s.price, i.level)[0]} {when}." if s.price and i.level else i.headline
    if i.kind == "big_move":
        # the figure already says how much; the card leads with why, when we know it
        line, why = (i.detail, "") if i.detail else (i.headline, "")
    if i.kind in ("level_add", "level_trim", "earnings") and s.premarket_pct is not None and abs(s.premarket_pct) >= 1:
        why = f"{why} {kit.pct(s.premarket_pct)} before the open this morning.".strip()
    return kit.Card(
        ticker=s.ticker,
        figure=figure,
        figure_value=value,
        call=kit.call_pill_text(label, level),
        line=line,
        why=why,
        meta=i.meta if i.kind == "earnings" else "",  # the section header carries the move's baseline
        fallback=i.fallback or kit.recent_move(s.closes),
    )


SECTIONS = [
    ("level_add", "At our buy-more price"),
    ("level_trim", "At our sell-some price"),
    ("call_change", "Calls we changed"),
    ("big_move", "Moved more than usual"),
    ("premarket", "Moving before the open"),
    ("earnings", "Reporting today or tomorrow"),
]


def build_daily(person: Person, *, now: datetime | None = None, market: dict[str, Stock] | None = None,
                unsubscribe_token: str | None = None) -> kit.Email | None:
    """Return the email, or None on a quiet day."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(ET).date()
    spy = (market or {}).get("SPY")
    items = items_for(person, now, spy)
    if not items:
        return None

    shown = items[:MAX_CARDS]
    rest = items[MAX_CARDS:]
    doc = kit.Doc()
    hello = f"Morning {person.first_name}. " if person.first_name else ""
    doc.h1(headline_for(items, today))
    covered = len(person.emailed_ids)
    closed = max((s.price_at for s in person.emailed_stocks() if s.price_at), default=None)
    close_word = f"the {closed.astimezone(ET).strftime('%b %-d')} close" if closed else "the last close"
    moved = [s for s in person.emailed_stocks() if s.change_pct is not None]
    if len(moved) >= 2:
        avg = _avg([s.change_pct for s in moved])
        rose = sum(1 for s in moved if round(s.change_pct or 0, 1) > 0)
        vs = f", against {kit.pct(spy.change_pct)} for the S&P 500" if spy and spy.change_pct is not None else ""
        whose = f"the {kit.plural(covered, 'stock')} you track" if person.is_pro else f"your {kit.plural(covered, 'covered stock')}"
        read = (f"{hello}Across {whose} the average move was {kit.pct(avg)}{vs}, and {rose} of {len(moved)} rose. "
                f"Prices are to {close_word}.")
    else:
        scope = f"the {kit.plural(covered, 'stock')} you track" if person.is_pro else f"your {kit.plural(covered, 'covered stock')}"
        read = f"{hello}Here's what changed in {scope} since {close_word}."
    doc.p(read, muted=True, size=kit.t.TEXT_SM)
    doc.insights(insights_for(person, items, spy, today)[1:] if len(moved) >= 2 else insights_for(person, items, spy, today))

    # a big move we can't explain is just a number: it goes in the tiles, not a card of its own
    unexplained = [i for i in shown if i.kind in ("big_move", "premarket") and not i.detail]
    for kind, title in SECTIONS:
        group = [i for i in shown if i.kind == kind and i not in unexplained]
        if not group:
            continue
        aside = None
        if kind in ("big_move", "premarket"):
            mults = sorted(float(i.meta.split("x ")[0]) for i in group if i.meta and i.meta.split("x ")[0].replace(".", "").isdigit())
            sources = sorted({i.source.split(" · ")[0] for i in group if i.source})
            span = (f"{times(mults[0])} to {times(mults[-1])} a normal day" if len(mults) > 1 and mults[0] != mults[-1]
                    else f"{times(mults[0])} a normal day" if mults else "")
            aside = " · ".join(x for x in (span, f"via {kit.join_words(sources)}" if sources else "") if x) or None
        doc.h2(title, aside=aside)
        doc.cards([card_for(i, today) for i in group])
    rest = unexplained + rest
    if rest:
        doc.h2("Also moved more than usual" if all(i.kind in ("big_move", "premarket") for i in rest) else "Also moved or changed",
               aside=kit.plural(len(rest), "stock"))
        doc.tiles([(i.stock.ticker, i.stock.premarket_pct if i.kind == "premarket" else i.stock.change_pct, _call(i.stock))
                   for i in rest[:8]])
        if len(rest) > 8:
            doc.p(f"And {len(rest) - 8} more in the app.", muted=True, size=kit.t.TEXT_SM)

    # No "rest of your stocks" list: a wall of quiet tickers crowds the email and says nothing (owner, Nov 11).

    # every report date that isn't already its own card, so a stock that also moved keeps its date
    earnings_cards = {i.stock.id for i in items if i.kind == "earnings"}
    coming = sorted(
        [s for s in person.emailed_stocks()
         if s.earnings_date and s.earnings_date >= today and s.id not in earnings_cards],
        key=lambda s: (s.earnings_date, s.ticker),
    )[:4]
    if coming:
        doc.h2("Earnings coming up")
        slots = {"bmo": "before the open", "amc": "after the close", "during": "during market hours"}
        doc.calendar([(s.earnings_date.strftime("%a %b %-d"), s.ticker,
                       kit.cap(f"{slots.get(s.earnings_time, 'time not confirmed')} · {_call(s)}" if _call(s)
                               else slots.get(s.earnings_time, "time not confirmed")))
                      for s in coming])

    doc.button("Open today's briefing", kit.app_url("/briefing"))

    if not person.is_pro:
        hidden = person.uncovered_stocks()
        moved = [s for s in hidden if s.change_pct is not None and abs(s.change_pct) >= BIG_MOVE_PCT]
        if hidden:
            moved.sort(key=lambda s: -abs(s.change_pct or 0))
            extra = (f" {kit.join_words([f'{s.ticker} ({kit.pct(s.change_pct)})' for s in moved[:3]])} "
                     f"moved {BIG_MOVE_PCT:.0f}% or more and {'isn’t' if len(moved[:3]) == 1 else 'aren’t'} in this email.") if moved else ""
            doc.note(
                f"You track {len(person.tracked_ids)} stocks and Free covers {FREE_COVERED_STOCKS} of them.{extra}",
                tone="copper",
                link=("Pro covers every stock you track", kit.app_url("/pricing")),
            )

    pre_bits = []
    if spy and spy.change_pct is not None:
        pre_bits.append(f"S&P 500 {kit.pct(spy.change_pct)} {session_word(spy.price_at, today)}")
    pre_bits.append("; ".join(f"{i.stock.ticker}: {i.headline.rstrip('.')}" for i in shown[:2]))
    preheader = ". ".join(b for b in pre_bits if b) + "."
    return kit.render(
        doc,
        kind="daily_brief",
        category="daily",
        subject=subject_for(items, today),
        preheader=preheader,
        unsubscribe_token=unsubscribe_token,
        meta={"date": today.isoformat(), "items": [(i.stock.ticker, i.kind) for i in items]},
        dateline=f"{today.strftime('%a, %b %-d')} · before the open",
    )
