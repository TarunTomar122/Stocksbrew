"""Account emails: welcome, setup nudges, Pro welcome, plan heads-ups, win-back.

Each is sent at most once per account (the dispatcher dedupes on kind), and
each uses real prices and calls so even the welcome is about stocks, not
about us.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from backend.mail import kit
from backend.subscription_entitlement import FREE_COVERED_WORD
from backend.mail.data import ET, FREE_COVERED_STOCKS, Person, Stock, direction

SWAP_MIN_MOVE_PCT = 3.0  # the swap email only goes out when a stock outside the covered ones moved this much


def _hello(person: Person) -> str:
    return f"Hi {person.first_name}," if person.first_name else "Hi,"


# --------------------------------------------------------------- welcome

def example_card(stock: Stock, now: datetime | None = None) -> kit.Card:
    """One real stock drawn the way the daily brief draws it: the move, the reason if we have one, our call."""
    from backend.mail.daily import session_word, times, why_line

    today = (now or datetime.now(timezone.utc)).astimezone(ET).date()
    up = (stock.change_pct or 0) > 0
    moved = f"{'Rose' if up else 'Fell'} {kit.pct(stock.change_pct, signed=False)} {session_word(stock.price_at, today)}."
    typical = stock.typical_move_pct
    why, _ = why_line(stock)
    label = kit.call_label(stock.stance, stock.call_text)
    return kit.Card(
        ticker=stock.ticker,
        figure=kit.pct(stock.change_pct) if stock.change_pct is not None else "",
        figure_value=stock.change_pct,
        # a stock the reader doesn't track yet shows the call, not its price level
        call=label,
        line=why or moved,
        meta=" · ".join(x for x in (
            f"{times(abs(stock.change_pct or 0) / typical)} a normal day for {stock.ticker}" if typical else "",
            f"{stock.price_at.astimezone(ET).strftime('%b %-d')} close" if stock.price_at else "") if x),
        fallback=kit.recent_move(stock.closes),
    )


def build_welcome(person: Person, popular: list[Stock], *, unsubscribe_token: str | None = None,
                  now: datetime | None = None) -> kit.Email:
    doc = kit.Doc()
    picks = [s for s in popular if s.price is not None][:8]
    lead = next((s for s in picks if s.change_pct is not None), None)
    first = f"Welcome, {person.first_name}." if person.first_name else "Welcome to stocksbrew."
    doc.h1(f"{first} Add a stock you own, and you'll get a card like this when it moves.")
    doc.p("One short email before the US open, and only on days something changed in your stocks.",
          muted=True, size=kit.t.TEXT_SM)
    if lead is not None:
        doc.cards([example_card(lead, now)])
    rest = [s for s in picks if s is not lead]
    if rest:
        when = max((s.price_at for s in rest if s.price_at), default=None)
        doc.h2("Where most people start", aside=f"{when.astimezone(ET).strftime('%b %-d')} close" if when else None)
        doc.chips([(s.ticker, s.change_pct) for s in rest])
    doc.button("Add your first stock", kit.app_url("/watchlist"))
    return kit.render(doc, kind="welcome", category="product", subject="Welcome to stocksbrew: add one stock you own",
                      preheader="We'll tell you when it moves, why, and what our call is.",
                      unsubscribe_token=unsubscribe_token, dateline="Welcome")


def build_setup_nudge(person: Person, popular: list[Stock], *, day: int, unsubscribe_token: str | None = None,
                      now: datetime | None = None) -> kit.Email:
    """Day 2 and day 5 after signup, only while the watchlist is still empty."""
    doc = kit.Doc()
    movers = sorted([s for s in popular if s.change_pct is not None], key=lambda s: -abs(s.change_pct or 0))
    if day <= 2:
        lead = movers[0] if movers else None
        if lead:
            doc.h1(f"{lead.ticker} {kit.verb(lead.change_pct)} {kit.pct(lead.change_pct, signed=False)} in the last session.")
            doc.p(f"{_hello(person)} add the stocks you own and we'll watch them like this, with the reason and our call.",
                  muted=True, size=kit.t.TEXT_SM)
            doc.cards([example_card(lead, now)])
        else:
            doc.h1("Add the stocks you own and we'll start watching them.")
        rest = movers[1:8]
        if rest:
            when = max((s.price_at for s in rest if s.price_at), default=None)
            doc.h2("Other popular stocks", aside=f"{when.astimezone(ET).strftime('%b %-d')} close" if when else None)
            doc.chips([(s.ticker, s.change_pct) for s in rest])
        doc.button("Add your first stock", kit.app_url("/watchlist"))
        subject = "Your watchlist is still empty"
        pre = "Add one stock you own and we'll start following it."
    else:
        lead = movers[0] if movers else None
        if lead:
            doc.h1(f"{lead.ticker} {kit.verb(lead.change_pct)} {kit.pct(lead.change_pct, signed=False)} in the last session.")
            doc.p(f"{_hello(person)} if {lead.ticker} were on your watchlist, this is the card you'd have got this morning.",
                  muted=True, size=kit.t.TEXT_SM)
            doc.cards([example_card(lead, now)])
        else:
            doc.h1("This is what a morning brief looks like.")
        doc.button("Track your own stocks", kit.app_url("/watchlist"))
        subject = f"{lead.ticker} {kit.pct(lead.change_pct)}: what that would have looked like" if lead else "What your morning brief would look like"
        pre = "One real card from the last session: the move, the reason, our call."
    return kit.render(doc, kind=f"setup_nudge_d{day}", category="product", subject=subject, preheader=pre,
                      unsubscribe_token=unsubscribe_token, dateline="Getting started")


# ------------------------------------------------------------- pro welcome

def build_pro_welcome(person: Person, *, unsubscribe_token: str | None = None) -> kit.Email:
    n = len(person.tracked_ids)
    newly = max(0, n - FREE_COVERED_STOCKS)
    doc = kit.Doc()
    if n == 1:
        doc.h1("You're on Pro, and the stock you track is covered now.")
    else:
        doc.h1(f"You're on Pro. All {n} stocks you track are covered now." if n else "You're on Pro.")
    lead = (
        f"{_hello(person)} thanks for going Pro. {kit.plural(newly, 'more stock')} now {'shows' if newly == 1 else 'show'} up "
        f"in your morning brief and weekly memo with our call, its price and the reason."
        if newly
        else f"{_hello(person)} thanks for going Pro. Every stock you add from now on gets the full read."
    )
    doc.p(lead, muted=True, size=kit.t.TEXT_SM)
    newly_covered = [s for s in person.stocks if s.id not in set(person.tracked_ids[:FREE_COVERED_STOCKS])]

    # calls that ask for something (buy more or sell some), closest to their own level first
    def level_of(s: Stock) -> float | None:
        return kit.call_level(kit.call_label(s.stance, s.call_text), s.add_below, s.trim_above)

    def gap(s: Stock) -> float:
        lvl = level_of(s)
        return abs(s.price - lvl) / lvl if lvl and s.price else 9.0

    with_levels = sorted([s for s in newly_covered if s.price and direction(s.stance) != "neutral" and level_of(s)], key=gap)[:2]
    if with_levels:
        rows = []
        for s in with_levels:
            label = kit.call_label(s.stance, s.call_text)
            lvl = level_of(s)
            g = (s.price - lvl) / lvl * 100
            # within 0.2% is usually a level set at that close, which says nothing on its own
            line = "" if abs(g) <= 0.2 else (f"{kit.pct(abs(g), signed=False)} {'under' if g < 0 else 'over'} our "
                                             f"{'buy-more' if label == kit.BUY else 'sell-some'} price.")
            rows.append((s, label, lvl, kit.cap(line)))
        doc.h2("Two you couldn't see before" if len(rows) == 2 else "One you couldn't see before")
        doc.cards([kit.Card(ticker=s.ticker, figure=kit.pct(s.change_pct) if s.change_pct is not None else kit.money(s.price),
                            figure_value=s.change_pct, call=kit.call_pill_text(label, lvl),
                            line=line or kit.recent_move(s.closes), why=kit.recent_move(s.closes) if line else "")
                   for s, label, lvl, line in rows])
    doc.button("Open today's briefing", kit.app_url("/briefing"))
    return kit.render(doc, kind="pro_welcome", category="product",
                      subject=(f"Pro is on: all {n} of your stocks are covered" if n > 1
                               else "Pro is on: your stock is covered" if n == 1 else "Pro is on"),
                      preheader="Every stock you track now gets the call, its price and the reason.",
                      unsubscribe_token=unsubscribe_token, dateline="Pro")


# ----------------------------------------------------------- plan heads-ups

def build_swap_open(person: Person, *, unsubscribe_token: str | None = None) -> kit.Email | None:
    """Free only: the weekly swap is available and a stock outside the covered ones moved."""
    if person.is_pro:
        return None
    covered = [s for s in person.stocks if s.id in set(person.covered_ids)]
    outside = [s for s in person.uncovered_stocks() if s.week_change_pct is not None]
    if not outside:
        return None
    pick = max(outside, key=lambda s: abs(s.week_change_pct or 0))
    if abs(pick.week_change_pct or 0) < SWAP_MIN_MOVE_PCT:
        return None  # nothing outside the covered stocks moved enough to be worth an email
    doc = kit.Doc()
    doc.h1(f"{pick.ticker} {kit.verb(pick.week_change_pct)} {kit.pct(pick.week_change_pct, signed=False)} this week, "
           "and it isn't one of your covered stocks.")
    doc.p(
        f"{_hello(person)} this week you can swap one of your {FREE_COVERED_STOCKS} covered stocks for {pick.ticker}, "
        "or for any other stock you track."
    )
    end = max((s.dates[-1] for s in person.stocks if s.dates), default="")
    week = f"week to {date.fromisoformat(end).strftime('%b %-d')}" if end else "this week"
    doc.h2(f"Biggest weeks outside your {FREE_COVERED_WORD}", aside=week)
    doc.tiles([(s.ticker, s.week_change_pct, "") for s in sorted(outside, key=lambda s: -abs(s.week_change_pct or 0))[:4]])
    if covered:
        calls = {kit.call_label(s.stance, s.call_text) for s in covered}
        same = calls.pop() if len(calls) == 1 else ""
        doc.h2("Covered now", aside=f"{week} · every one is {same}" if same and len(covered) > 1 else week)
        doc.tiles([(s.ticker, s.week_change_pct, "" if same else kit.call_label(s.stance, s.call_text)) for s in covered])
    doc.button("Choose this week's swap", kit.app_url("/watchlist"))
    doc.link("Or cover every stock with Pro", kit.app_url("/pricing"))
    return kit.render(doc, kind="swap_open", category="product",
                      subject=f"{pick.ticker} {kit.pct(pick.week_change_pct)} this week, outside your {FREE_COVERED_WORD}",
                      preheader="Your weekly swap is open: cover it instead of one of your current stocks.",
                      unsubscribe_token=unsubscribe_token, dateline="Your weekly swap")


def build_limit_reached(person: Person, *, title: str, body: str, used: int, cap: int, pro_cap: int | None = None,
                        unsubscribe_token: str | None = None) -> kit.Email:
    """Sent once per limit per month, the first time a Free account hits it.

    `pro_cap` is the Pro limit from lib/entitlements.ts (agents: 20); None means Pro has no limit.
    """
    doc = kit.Doc()
    doc.h1(title.rstrip(".") + ".")
    # "Hi Tarun, you tried..." reads right; a body that starts with a name keeps its capital
    if body.split(" ", 1)[0] in {"You", "Your"}:
        body = body[:1].lower() + body[1:]
    doc.p(f"{_hello(person)} {body}")
    pro = "has no limit" if pro_cap is None else f"allows up to {pro_cap}"
    doc.p(f"You're using {used} of {cap} on Free, and Pro {pro}. Nothing you've saved is deleted.", muted=True, size=kit.t.TEXT_SM)
    doc.button("Compare Free and Pro", kit.app_url("/pricing"))
    doc.link("Or manage what's running", kit.app_url("/agents/jobs"))
    return kit.render(doc, kind="limit_reached", category="product", subject=title,
                      preheader="What the limit is, and what Pro changes.", unsubscribe_token=unsubscribe_token,
                      dateline="Your plan")


# --------------------------------------------------------------- win-back

def build_winback(person: Person, *, now: datetime | None = None, unsubscribe_token: str | None = None) -> kit.Email | None:
    now = now or datetime.now(timezone.utc)
    stocks = [s for s in person.emailed_stocks() if len(s.closes) >= 16 and s.closes[-16]]
    if not stocks:
        return None
    sessions = 15

    def change(s: Stock) -> float:
        return (s.closes[-1] - s.closes[-1 - sessions]) / s.closes[-1 - sessions] * 100

    ranked = sorted(stocks, key=lambda s: -abs(change(s)))
    doc = kit.Doc()
    lead = ranked[0]
    start_day = date.fromisoformat(lead.dates[-1 - sessions]) if len(lead.dates) > sessions else None
    end_day = date.fromisoformat(lead.dates[-1]) if lead.dates else None
    span = f"from {start_day.strftime('%b %-d')} to {end_day.strftime('%b %-d')}" if start_day and end_day else "in three weeks"
    doc.h1(f"{lead.ticker} {kit.verb(change(lead))} {kit.pct(change(lead), signed=False)} while you were away.")
    avg = sum(change(s) for s in stocks) / len(stocks)
    rose = sum(1 for s in stocks if round(change(s), 1) > 0)
    doc.p(f"{_hello(person)} here's your list {span}: your {kit.plural(len(stocks), 'stock')} averaged {kit.pct(avg)} and "
          f"{rose} rose.",
          muted=True, size=kit.t.TEXT_SM)
    doc.h2("Biggest moves", aside=span)
    doc.tiles([(s.ticker, change(s), kit.call_label(s.stance, s.call_text)) for s in ranked[:8]])
    doc.button("Catch up on your watchlist", kit.app_url("/watchlist"))
    doc.rich(
        f"This is the only reminder we'll send. If the morning brief is too much, "
        f"<a class='sbk' href='{kit.esc(kit.settings_url())}' style='color:{kit.t.COPPER};text-decoration:underline'>switch to the weekly memo only</a>.",
        f"This is the only reminder we'll send. If the morning brief is too much, switch to the weekly memo only: {kit.settings_url()}",
        size=kit.t.TEXT_SM, muted=True,
    )
    return kit.render(doc, kind="winback", category="product",
                      subject=f"{lead.ticker} {kit.pct(change(lead))} since your last visit",
                      preheader=f"Three weeks in your {kit.plural(len(stocks), 'stock')}, in one minute.",
                      unsubscribe_token=unsubscribe_token, dateline="While you were away")
