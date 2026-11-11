"""The daily brief: before the US open, only on days something happened.

A day is worth an email when at least one stock the person gets the daily
for has a hard event: it crossed one of our levels, the research call
changed, it moved a lot, or it reports earnings today or tomorrow. Headlines
ride along as the "why" but never trigger a send on their own.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.mail.data import ET, FREE_COVERED_STOCKS, Person, Stock, direction

BIG_MOVE_PCT = 4.0  # floor for any stock
BIG_MOVE_HOLDING_PCT = 3.0  # floor for holdings
BIG_MOVE_TYPICAL_MULT = 2.5  # and at least this many times the stock's normal day
MAX_CARDS = 5
MAX_ALSO = 6

STANCE_LABEL = {
    "accumulate": "Buy more",
    "buy": "Buy more",
    "add": "Buy more",
    "hold": "Keep",
    "watch": "Keep",
    "trim": "Sell some",
    "avoid": "Sell some",
    "sell": "Sell some",
    "reduce": "Sell some",
}


@dataclass
class Item:
    stock: Stock
    kind: str  # level_add | level_trim | call_change | big_move | earnings
    score: float
    tag: str
    tag_tone: str
    headline: str
    detail: str
    source: str = ""
    show_levels: bool = False
    levels: tuple[float | None, float | None] | None = None


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


def why_line(stock: Stock, spy: Stock | None = None) -> tuple[str, str]:
    # only news from the day before the session through its close can explain it
    window = []
    if stock.price_at is not None:
        start = stock.price_at - timedelta(hours=30)
        end = stock.price_at + timedelta(minutes=30)
        window = [h for h in stock.news if start <= h.published_at <= end]
    if window:
        h = window[0]
        when = h.published_at.astimezone(ET).strftime("%-I:%M %p ET %b %-d")
        return h.title, f"{h.source}, {when}" if h.source else when
    if spy and spy.change_pct is not None and abs(spy.change_pct) >= 1 and stock.change_pct is not None \
            and (spy.change_pct > 0) == (stock.change_pct > 0):
        verb = "rose" if spy.change_pct > 0 else "fell"
        return f"We haven't found company news behind this. The S&P 500 {verb} {kit.pct(spy.change_pct, signed=False)} the same day.", ""
    return "We haven't found a confirmed reason for the move yet.", ""


def times(mult: float) -> str:
    """2.5 -> "2.5x", 3.0 -> "3x", 12.4 -> "12x"."""
    if mult >= 10:
        return f"{mult:.0f}x"
    return f"{mult:.1f}".rstrip("0").rstrip(".") + "x"


def big_move_threshold(s: Stock) -> float:
    floor = BIG_MOVE_HOLDING_PCT if s.position == "holding" else BIG_MOVE_PCT
    typical = s.typical_move_pct
    return max(floor, typical * BIG_MOVE_TYPICAL_MULT) if typical else floor


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
            items.append(
                Item(s, "level_add", 100, "Below our buy-more price", "up", f"Closed under our buy-more price {when}",
                     f"{s.ticker} closed at {kit.money_pair(s.price, add_lvl)[0]}, below {kit.money_pair(s.price, add_lvl)[1]}, the price where our call said we'd buy more. {s.call_reason}".strip(),
                     show_levels=True, levels=(add_lvl, s.trim_above))
            )
            continue
        if crossed_trim:
            items.append(
                Item(s, "level_trim", 100, "Above our sell-some price", "caution", f"Closed over our sell-some price {when}",
                     f"{s.ticker} closed at {kit.money_pair(s.price, trim_lvl)[0]}, above {kit.money_pair(s.price, trim_lvl)[1]}, the price where our call said we'd sell some. {s.call_reason}".strip(),
                     show_levels=True, levels=(s.add_below, trim_lvl))
            )
            continue
        if (s.previous_stance and s.calls and s.stable_before_change()
                and direction(s.previous_stance) != direction(s.stance)
                and (today - date.fromisoformat(s.calls[-1].day)).days <= 3):
            before = STANCE_LABEL.get(s.previous_stance, s.previous_stance.title())
            after = s.call_text or STANCE_LABEL.get(s.stance, s.stance.title())
            tone = {"bullish": "up", "bearish": "caution"}.get(direction(s.stance), "well")
            items.append(
                Item(s, "call_change", 90, "Our call changed", tone, f"{before} → {after}", s.call_reason,
                     show_levels=bool(s.add_below or s.trim_above))
            )
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
            if typical:
                # the baseline: how unusual this day was for this stock
                moved += f", {times(abs(s.change_pct) / typical)} its usual daily move"
            items.append(
                Item(s, "big_move", score, "Big move", "up" if up else "down", moved, why, source,
                     show_levels=bool(s.add_below or s.trim_above))
            )
            continue
        if s.earnings_date and s.earnings_date <= next_session(today):
            when_e = earnings_when(s.earnings_date, s.earnings_time, today)
            detail = f"Our current call is {s.call_text.lower()}." if s.call_text else ""
            items.append(Item(s, "earnings", 70, "Earnings", "copper", f"Reports {when_e}", detail))
    items.sort(key=lambda i: (-i.score, i.stock.ticker))
    return items


def subject_for(items: list[Item], today: date) -> str:
    def short(i: Item) -> str:
        s = i.stock
        if i.kind == "big_move":
            return f"{s.ticker} {'up' if (s.change_pct or 0) > 0 else 'down'} {kit.pct(s.change_pct, signed=False)}"
        if i.kind == "level_add":
            return f"{s.ticker} fell to our buy-more price"
        if i.kind == "level_trim":
            return f"{s.ticker} rose past our sell-some price"
        if i.kind == "call_change":
            return f"new call on {s.ticker}"
        return f"{s.ticker} reports {earnings_day(s.earnings_date, today)}" if s.earnings_date else f"{s.ticker} reports soon"

    lead = short(items[0])
    lead = lead[0].upper() + lead[1:]
    if len(items) == 1:
        return lead
    if len(items) == 2:
        return f"{lead}, {short(items[1])}"
    return f"{lead}, {short(items[1])} and {len(items) - 2} more"


def market_line(spy: Stock | None, today: date, stocks: list[Stock] | None = None) -> str:
    if not spy or spy.change_pct is None:
        return ""
    when = session_word(spy.price_at, today)
    if abs(spy.change_pct) < 0.75:
        return f"The S&P 500 moved {kit.pct(spy.change_pct)} {when}, a normal day."
    up = spy.change_pct > 0
    word = "rallied" if up else "sold off"
    line = f"The market {word} {when}: the S&P 500 {'rose' if up else 'fell'} {kit.pct(spy.change_pct, signed=False)}"
    # only say the list moved with the market when most of it did
    moves = [s.change_pct for s in stocks or [] if s.change_pct is not None]
    if moves and sum(1 for m in moves if (m > 0) == up and m != 0) * 2 > len(moves):
        return f"{line}, and most of your stocks moved the same way."
    return f"{line}."


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
    doc.eyebrow(f"Before the open · {today.strftime('%A, %b %-d')}")
    greeting = f"Morning {person.first_name}. " if person.first_name else ""
    n = len(items)
    doc.h1(f"{kit.plural(n, 'thing')} to know in your stocks today" if n <= MAX_CARDS
           else f"A busy day: {n} of your stocks moved or changed. These {MAX_CARDS} matter most")
    covered = len(person.emailed_ids)
    scope = f"the {kit.plural(covered, 'stock')} you track" if person.is_pro else f"your {kit.plural(covered, 'covered stock')}"
    doc.p(f"{greeting}Here's what changed in {scope} since the last close.")
    line = market_line(spy, today, person.emailed_stocks())
    if line:
        doc.note(line)

    for i in shown:
        s = i.stock
        doc.stock(
            ticker=s.ticker,
            name=s.name,
            price=s.price,
            change_pct=s.change_pct,
            tag=i.tag,
            tag_tone=i.tag_tone,
            headline=i.headline,
            detail=i.detail,
            source=i.source,
            levels=(i.levels or (s.add_below, s.trim_above)) if i.show_levels else None,
        )
    if rest:
        doc.h2("Also worth a look", aside=f"{len(rest)} more")
        doc.movers([(i.stock.ticker, i.headline, i.stock.change_pct) for i in rest[:MAX_ALSO]],
                   note=f"And {len(rest) - MAX_ALSO} more on your watchlist." if len(rest) > MAX_ALSO else None)

    shown_ids = {i.stock.id for i in items}
    quiet = [s for s in person.emailed_stocks() if s.id not in shown_ids and s.change_pct is not None]
    if quiet:
        quiet.sort(key=lambda s: -abs(s.change_pct or 0))
        doc.h2("Everything else you track", aside=kit.plural(len(quiet), "stock"))
        doc.movers([(s.ticker, "Holding" if s.position == "holding" else "Watchlist", s.change_pct) for s in quiet[:5]],
                   note=None if len(quiet) <= 5 else f"Plus {len(quiet) - 5} more with smaller moves.")

    # every report date that isn't already its own card, so a stock that also moved keeps its date
    earnings_cards = {i.stock.id for i in items if i.kind == "earnings"}
    coming = sorted(
        [s for s in person.emailed_stocks()
         if s.earnings_date and s.earnings_date >= today and s.id not in earnings_cards],
        key=lambda s: (s.earnings_date, s.ticker),
    )[:4]
    if coming:
        doc.h2("Earnings coming up")
        slots = {"bmo": "Before the open", "amc": "After the close", "during": "During market hours"}
        doc.calendar([(s.earnings_date.strftime("%a %b %-d"), s.ticker, slots.get(s.earnings_time, "Time not confirmed")) for s in coming])

    doc.button("Open your watchlist", kit.app_url("/watchlist"))

    if not person.is_pro:
        hidden = person.uncovered_stocks()
        moved = [s for s in hidden if s.change_pct is not None and abs(s.change_pct) >= BIG_MOVE_PCT]
        if hidden:
            moved.sort(key=lambda s: -abs(s.change_pct or 0))
            extra = f" {kit.join_words([s.ticker for s in moved[:3]])} moved {BIG_MOVE_PCT:.0f}% or more." if moved else ""
            doc.note(
                f"You track {len(person.tracked_ids)} stocks and Free covers {FREE_COVERED_STOCKS} of them.{extra} "
                "Pro covers every stock you track.",
                tone="copper",
                title="Not in this email",
            )
            doc.link("See what Pro covers", kit.app_url("/pricing"))

    preheader = "; ".join(f"{i.stock.ticker}: {i.headline}" for i in shown[:3])
    return kit.render(
        doc,
        kind="daily_brief",
        category="daily",
        subject=subject_for(items, today),
        preheader=preheader,
        unsubscribe_token=unsubscribe_token,
        meta={"date": today.isoformat(), "items": [(i.stock.ticker, i.kind) for i in items]},
    )
