"""Account emails: welcome, setup nudges, Pro welcome, plan heads-ups, win-back.

Each is sent at most once per account (the dispatcher dedupes on kind), and
each uses real prices and calls so even the welcome is about stocks, not
about us.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.subscription_entitlement import FREE_COVERED_WORD
from backend.mail.data import ET, FREE_COVERED_STOCKS, Person, Stock, direction, last_day_move
from backend.mail import nyse

SWAP_MIN_MOVE_PCT = 3.0  # the swap email only goes out when a stock outside the covered ones moved this much


def _hello(person: Person) -> str:
    return f"Hi {person.first_name}," if person.first_name else "Hi,"


# --------------------------------------------------------------- welcome

def example_card(stock: Stock, now: datetime | None = None) -> kit.Card:
    """One real stock drawn the way the daily brief draws it: price and move, our call, how unusual the move was,
    and the reason if we have one."""
    from backend.mail.daily import session_word, times, why_line

    today = (now or datetime.now(timezone.utc)).astimezone(ET).date()
    up = (stock.change_pct or 0) > 0
    moved = f"{'Rose' if up else 'Fell'} {kit.pct(stock.change_pct, signed=False)} {session_word(stock.price_at, today)}."
    typical = stock.typical_move_pct
    why, _ = why_line(stock)
    label = kit.call_label(stock.stance, stock.call_text)
    return kit.Card(
        ticker=stock.ticker,
        name=stock.name,
        price=stock.price,
        move=stock.change_pct,
        period=session_word(stock.price_at, today).removeprefix("on "),
        # a stock the reader doesn't track yet shows the call, not its price level
        call=label,
        tag=f"{times(abs(stock.change_pct or 0) / typical)} a normal day" if typical and stock.change_pct else "",
        line=why or moved,
        fallback=kit.recent_move(stock.closes),
    )


def build_welcome(person: Person, popular: list[Stock], *, unsubscribe_token: str | None = None,
                  now: datetime | None = None) -> kit.Email:
    doc = kit.Doc()
    picks = [s for s in popular if s.price is not None][:8]
    lead = next((s for s in picks if s.change_pct is not None), None)
    first = f"Welcome, {person.first_name}." if person.first_name else "Welcome to stocksbrew."
    doc.h1(f"{first} Here's what your stocks will look like.")
    doc.p("One short email before the US open, only on days your stocks change.", muted=True, size=kit.t.TEXT_SM)
    # one real example and one action (council, Nov 12): no list of popular stocks
    if lead is not None:
        doc.cards([example_card(lead, now)])
    doc.button("Add your first stock", kit.app_url("/watchlist"))
    return kit.render(doc, kind="welcome", category="product", subject="Welcome to stocksbrew: add one stock you own",
                      preheader="We'll tell you when it moves, why, and what our call is.",
                      unsubscribe_token=unsubscribe_token, dateline="Welcome")


def build_setup_nudge(person: Person, popular: list[Stock], *, day: int, unsubscribe_token: str | None = None,
                      now: datetime | None = None) -> kit.Email:
    """Day 2 and day 5 after signup, only while the watchlist is still empty."""
    doc = kit.Doc()
    today = (now or datetime.now(timezone.utc)).astimezone(ET).date()

    def session_word(at: datetime | None, today: date) -> str:
        word = kit.day_word(at.astimezone(ET).date(), today) if at else ""
        return word if word in ("today", "yesterday", "") else f"on {word}"
    movers = sorted([s for s in popular if s.change_pct is not None], key=lambda s: -abs(s.change_pct or 0))
    if day <= 2:
        lead = movers[0] if movers else None
        if lead:
            doc.h1(f"{lead.ticker} {kit.verb(lead.change_pct)} {kit.pct(lead.change_pct, signed=False)} {session_word(lead.price_at, today)}.")
            doc.p(f"{_hello(person)} add the stocks you own and we'll watch them like this.",
                  muted=True, size=kit.t.TEXT_SM)
            doc.cards([example_card(lead, now)])
        else:
            doc.h1("Add the stocks you own and we'll start watching them.")
        doc.button("Add your first stock", kit.app_url("/watchlist"))
        subject = "Your watchlist is still empty"
        pre = "Add one stock you own and we'll start following it."
    else:
        lead = movers[0] if movers else None
        if lead:
            doc.h1("Here's what you missed.")
            doc.cards([example_card(lead, now)])
        else:
            doc.h1("This is what a morning brief looks like.")
        doc.button("Track your own stocks", kit.app_url("/watchlist"))
        subject = f"{lead.ticker} {kit.pct(lead.change_pct)}: what that would have looked like" if lead else "What your morning brief would look like"
        pre = "One real card from the last session: the move, the reason, our call."
    return kit.render(doc, kind=f"setup_nudge_d{day}", category="product", subject=subject, preheader=pre,
                      unsubscribe_token=unsubscribe_token, dateline="Getting started")


# ------------------------------------------------------------- pro welcome

def build_pro_welcome(person: Person, *, unsubscribe_token: str | None = None, now: datetime | None = None) -> kit.Email:
    n = len(person.tracked_ids)
    doc = kit.Doc()
    # the coverage said once, in the headline (council, Nov 12)
    doc.h1("You're on Pro. Your stocks are now covered." if n else "You're on Pro.")
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
        doc.cards([kit.Card(ticker=s.ticker, name=s.name, price=s.price, move=s.change_pct,
                            period=kit.day_word(s.price_at.astimezone(ET).date(),
                                                (now or datetime.now(timezone.utc)).astimezone(ET).date()) if s.price_at else "",
                            call=kit.call_pill_text(label, lvl),
                            line=line or kit.recent_move(s.closes), why=kit.recent_move(s.closes) if line else "")
                   for s, label, lvl, line in rows])
    doc.button("Open today's briefing", kit.app_url("/briefing"))
    return kit.render(doc, kind="pro_welcome", category="product",
                      subject=(f"Pro is on: all {n} of your stocks are covered" if n > 1
                               else "Pro is on: your stock is covered" if n == 1 else "Pro is on"),
                      preheader="Every stock you track now gets the call, its price and the reason.",
                      unsubscribe_token=unsubscribe_token, dateline="Pro")


# ----------------------------------------------------------- plan heads-ups

def build_swap_open(person: Person, *, unsubscribe_token: str | None = None, now: datetime | None = None) -> kit.Email | None:
    """Free only: the weekly swap is available and a stock outside the covered ones moved."""
    if person.is_pro:
        return None
    outside = [s for s in person.uncovered_stocks() if s.week_change_pct is not None]
    if not outside:
        return None
    pick = max(outside, key=lambda s: abs(s.week_change_pct or 0))
    if abs(pick.week_change_pct or 0) < SWAP_MIN_MOVE_PCT:
        return None  # nothing outside the covered stocks moved enough to be worth an email
    doc = kit.Doc()
    doc.h1(f"{pick.ticker} {kit.verb(pick.week_change_pct)} {kit.pct(pick.week_change_pct, signed=False)} this week, "
           "outside your covered stocks.")
    doc.p(f"{_hello(person)} this week you can swap one of your {FREE_COVERED_STOCKS} covered stocks for it.")
    # one card for the stock worth swapping in, and one action (council, Nov 12: no tile lists, no second link)
    from backend.mail.weekly import week_card

    doc.cards([week_card(pick, (now or datetime.now(timezone.utc)).astimezone(ET).date(),
                         call=kit.call_label(pick.stance, pick.call_text))])
    doc.button("Choose this week's swap", kit.app_url("/watchlist"))
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
    pro = "has no limit" if pro_cap is None else f"allows {pro_cap}"
    doc.p(f"You're using {used} of {cap} on Free. Pro {pro}.", muted=True, size=kit.t.TEXT_SM)
    doc.button("Compare Free and Pro", kit.app_url("/pricing"))
    return kit.render(doc, kind="limit_reached", category="product", subject=title,
                      preheader="What the limit is, and what Pro changes.", unsubscribe_token=unsubscribe_token,
                      dateline="Your plan")


# --------------------------------------------------------------- win-back

def build_winback(person: Person, *, now: datetime | None = None, unsubscribe_token: str | None = None) -> kit.Email | None:
    """Since the last visit: the biggest moves in the person's stocks from the first close on or after the visit
    (what they had already seen is not counted), or over the last three weeks when we don't know the visit or it is
    older than the stored prices. A few cards, with the last day's move under each."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(ET).date()
    seen = person.last_seen

    # every stock is measured to the same, latest finished session; one whose prices stopped earlier is left out
    end = nyse.last_closed_session(now).isoformat()

    def base(s: Stock) -> int | None:
        if not s.dates or s.dates[-1] != end:
            return None
        if seen:
            # the first close at or after the visit (10am: that day's; the evening: the next session's), which must be
            # in this stock's stored closes: a history that starts later or has a gap there is left out, not guessed
            day = nyse.first_close_at_or_after(seen).isoformat()
        else:
            # three calendar weeks: the session on or before the day 21 days ago, exactly
            day = nyse.session_on_or_before(today - timedelta(days=21)).isoformat()
        i = s.dates.index(day) if day in s.dates else None
        return i if i is not None and i < len(s.closes) - 1 and s.closes[i] else None

    # no stock's history covers the visit: say three weeks instead of claiming a visit baseline
    if seen and not any(base(s) is not None for s in person.emailed_stocks()):
        seen = None

    starts = {s.id: base(s) for s in person.emailed_stocks()}
    stocks = [s for s in person.emailed_stocks() if starts[s.id] is not None]
    if not stocks:
        return None
    # a known visit is the baseline; without one the email says plainly that it covers three weeks
    period = "since your last visit" if seen else "over the past three weeks"

    def change(s: Stock) -> float:
        b = starts[s.id]
        return (s.closes[-1] - s.closes[b]) / s.closes[b] * 100

    ranked = sorted(stocks, key=lambda s: -abs(change(s)))
    lead = ranked[0]
    doc = kit.Doc()
    doc.h1(f"{lead.ticker} {kit.verb(change(lead))} {kit.pct(change(lead), signed=False)} "
           + ("while you were away." if seen else "over the past three weeks."))
    doc.h2("Biggest moves")
    picks = ranked[:4]
    doc.cards([kit.Card(ticker=s.ticker, name=s.name, price=s.closes[-1], move=change(s), period=period,
                        second=(m[0], kit.day_word(m[1], today)) if (m := last_day_move(s)) else None,
                        call=kit.call_label(s.stance, s.call_text)) for s in picks])
    doc.button("Catch up on your watchlist", kit.app_url("/watchlist"))
    doc.rich(
        f"This is our only reminder. Too much email? "
        f"<a class='sbk' href='{kit.esc(kit.settings_url())}' style='color:{kit.t.COPPER};text-decoration:underline'>Get the weekly memo only</a>.",
        f"This is our only reminder. Too much email? Get the weekly memo only: {kit.settings_url()}",
        size=kit.t.TEXT_SM, muted=True,
    )
    return kit.render(doc, kind="winback", category="product",
                      subject=f"{lead.ticker} {kit.pct(change(lead))} {period}",
                      preheader=f"The biggest moves in your {kit.plural(len(stocks), 'stock')} {period}.",
                      unsubscribe_token=unsubscribe_token,
                      dateline="Since your last visit" if seen else "Over the past three weeks")


# ------------------------------------------------------------ research ready

def build_brief_ready(*, ticker: str, name: str = "", price: float | None = None, change_pct: float | None = None,
                      headline: str = "", unsubscribe_token: str | None = None) -> kit.Email:
    """The stock someone asked about has its first research (backend/brief_ready_alerts.py sends it). ``price`` is in
    dollars; pass None for any other currency rather than print it with a $."""
    ticker = str(ticker or "").strip().upper()
    short = kit._short_name(name) if name and name.upper() != ticker else ""
    doc = kit.Doc()
    doc.h1(f"Our research on {short or ticker} is ready.")
    from backend.mail.headline_case import headline_case

    line = headline_case(headline, name) if headline else ""
    line = "" if kit.is_title_case(line) else line  # a scraped Title Case headline is not shown (owner rule 8)
    # the latest quote's move; it may be from the last session rather than today, so it says so
    doc.cards([kit.Card(ticker=ticker, name=name, price=price, move=change_pct, period="last session", line=line)])
    doc.button(f"Open {ticker}", kit.stock_url(ticker))
    return kit.render(doc, kind="brief_ready", category="alerts", subject=f"Our research on {ticker} is ready",
                      preheader=line or f"Financials, news and our call on {short or ticker}.",
                      unsubscribe_token=unsubscribe_token, reason="You get this because you asked to hear when this research was ready.",
                      dateline="Research ready")
