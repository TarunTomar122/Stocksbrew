"""Account emails: welcome, setup nudges, Pro welcome, plan heads-ups, win-back.

Each is sent at most once per account (the dispatcher dedupes on kind), and
each uses real prices and calls so even the welcome is about stocks, not
about us.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.mail import kit
from backend.mail.data import ET, FREE_COVERED_STOCKS, Person, Stock, direction

WINBACK_AFTER_DAYS = 21


def _hello(person: Person) -> str:
    return f"Hi {person.first_name}," if person.first_name else "Hi,"


# --------------------------------------------------------------- welcome

def build_welcome(person: Person, popular: list[Stock], *, unsubscribe_token: str | None = None) -> kit.Email:
    doc = kit.Doc()
    doc.eyebrow("Welcome to stocksbrew")
    doc.h1("Track a few stocks and we'll keep up with them for you")
    doc.p(
        f"{_hello(person)} stocksbrew researches the US stocks you care about and tells you when something "
        "important changes: a big move and the reason for it, a new call, an earnings date, a price level reached."
    )
    doc.steps([
        ("Look up a stock you own", "Financials, valuation, filings, analyst targets and news, all on one page.", kit.app_url("/explore")),
        ("Add it to your watchlist", "Holdings and stocks you're watching go in the same list. There's no limit on how many.", kit.app_url("/watchlist")),
        ("Get one email when it matters", "A short brief before the US open, only on days something changed. Nothing on quiet days.", kit.settings_url()),
    ])
    picks = [s for s in popular if s.price is not None][:4]
    if picks:
        doc.h2("Where other people start", aside="most tracked")
        doc.movers([(s.ticker, kit._short_name(s.name), s.change_pct) for s in picks])
    doc.button("Build your watchlist", kit.app_url("/watchlist"))
    doc.p(
        f"On Free, we cover {FREE_COVERED_STOCKS} of the stocks you track in full: price levels, the reasons behind each call "
        "and explained moves. Pro covers everything you track.",
        muted=True,
        size=14,
    )
    return kit.render(doc, kind="welcome", category="product", subject="Welcome to stocksbrew. Start with one stock",
                      preheader="Add the stocks you own and we'll tell you when something changes.",
                      unsubscribe_token=unsubscribe_token)


def build_setup_nudge(person: Person, popular: list[Stock], *, day: int, unsubscribe_token: str | None = None) -> kit.Email:
    """Day 2 and day 5 after signup, only while the watchlist is still empty."""
    doc = kit.Doc()
    movers = sorted([s for s in popular if s.change_pct is not None], key=lambda s: -abs(s.change_pct or 0))
    if day <= 2:
        doc.eyebrow("Your watchlist is empty")
        doc.h1("Add the stocks you own and the first brief writes itself")
        doc.p(
            f"{_hello(person)} you signed up but haven't added a stock yet. It takes a minute: search for one you own, "
            "press Track, and we start following it."
        )
        if movers:
            doc.h2("Popular stocks, last close")
            doc.movers([(s.ticker, kit._short_name(s.name), s.change_pct) for s in movers[:5]])
        doc.button("Add your first stock", kit.app_url("/watchlist"))
        subject = "Your watchlist is still empty"
        pre = "Add one stock you own and we'll start following it."
    else:
        doc.eyebrow("What you'd have heard")
        lead = movers[0] if movers else None
        if lead:
            from backend.mail.daily import big_move_threshold, why_line

            up = (lead.change_pct or 0) > 0
            has_levels = bool(lead.add_below or lead.trim_above)
            doc.h1(f"{lead.ticker} {'rose' if up else 'fell'} {kit.pct(lead.change_pct, signed=False)} in the last session")
            doc.p(
                f"{_hello(person)} if {lead.ticker} were on your watchlist, this morning's email would have looked for the reason "
                + ("and shown where it sits against the prices where we'd buy more or sell some. " if has_levels else "behind the move. ")
                + "Here's what that looks like."
            )
            why, source = why_line(lead)
            big = abs(lead.change_pct or 0) >= big_move_threshold(lead)
            doc.stock(source=source, ticker=lead.ticker, name=lead.name, price=lead.price, change_pct=lead.change_pct,
                      tag="Big move" if big else None, tag_tone="up" if up else "down", headline=why, detail=lead.call_reason,
                      levels=(lead.add_below, lead.trim_above) if has_levels else None)
        else:
            doc.h1("This is what a morning brief looks like")
        doc.button("Track your own stocks", kit.app_url("/watchlist"))
        doc.p("This is the last setup email we'll send.", muted=True, size=14)
        subject = f"What {lead.ticker}'s move would have looked like in your inbox" if lead else "What your morning brief would look like"
        pre = "One example from the last session, with the reason and our levels."
    return kit.render(doc, kind=f"setup_nudge_d{day}", category="product", subject=subject, preheader=pre,
                      unsubscribe_token=unsubscribe_token)


# ------------------------------------------------------------- pro welcome

def build_pro_welcome(person: Person, *, unsubscribe_token: str | None = None) -> kit.Email:
    n = len(person.tracked_ids)
    newly = max(0, n - FREE_COVERED_STOCKS)
    doc = kit.Doc()
    doc.eyebrow("You're on Pro")
    if n == 1:
        doc.h1("The stock you track is covered now")
    else:
        doc.h1(f"All {n} stocks you track are covered now" if n else "Pro is on")
    lead = (
        f"{_hello(person)} thanks for going Pro. {kit.plural(newly, 'stock')} that Free didn't cover "
        f"now {'gets' if newly == 1 else 'get'} the full read."
        if newly
        else f"{_hello(person)} thanks for going Pro. Every stock you add from now on gets the full read."
    )
    doc.p(lead)
    doc.bullets([
        "Price levels and the reasons behind every call, on every stock you track",
        "Every stock you track in the daily brief and the weekly recap, not just five",
        "Up to 20 agent jobs watching your stocks, with what they find sent to your inbox",
        "Screening by our call, unlimited saved screens, and data export",
    ])
    newly_covered = [s for s in person.stocks if s.id not in set(person.tracked_ids[:FREE_COVERED_STOCKS])]
    # show calls that ask for something (add or trim), closest to their level first
    def gap(s: Stock) -> float:
        lvl = s.add_below if direction(s.stance) == "bullish" else s.trim_above
        return abs(s.price - lvl) / lvl if lvl and s.price else 9.0

    with_levels = sorted([s for s in newly_covered if s.price and (s.add_below or s.trim_above)
                          and direction(s.stance) != "neutral"], key=gap)[:2]
    if with_levels:
        doc.h2("Two you couldn't see before" if len(with_levels) == 2 else "One you couldn't see before")
        for s in with_levels:
            doc.stock(ticker=s.ticker, name=s.name, price=s.price, change_pct=s.change_pct,
                      headline=s.call_text or "", detail=s.call_reason, levels=(s.add_below, s.trim_above))
    doc.button("Set up your first agent job", kit.app_url("/agents/jobs"))
    doc.link("Manage your plan", kit.plan_url())
    return kit.render(doc, kind="pro_welcome", category="product",
                      subject=(f"Pro is on: all {n} of your stocks are covered" if n > 1
                               else "Pro is on: your stock is covered" if n == 1 else "Pro is on"),
                      preheader="What changed, and the two-minute setup that's worth doing first.",
                      unsubscribe_token=unsubscribe_token)


# ----------------------------------------------------------- plan heads-ups

def build_swap_open(person: Person, *, unsubscribe_token: str | None = None) -> kit.Email | None:
    """Free only: the weekly swap is available and a stock outside the five moved."""
    if person.is_pro:
        return None
    covered = [s for s in person.stocks if s.id in set(person.covered_ids)]
    outside = [s for s in person.uncovered_stocks() if s.week_change_pct is not None]
    if not outside:
        return None
    pick = max(outside, key=lambda s: abs(s.week_change_pct or 0))
    doc = kit.Doc()
    doc.eyebrow("Your weekly swap is open")
    doc.h1(f"{pick.ticker} {kit.verb(pick.week_change_pct)} {kit.pct(pick.week_change_pct, signed=False)} this week and isn't covered")
    doc.p(
        f"{_hello(person)} on Free we cover {FREE_COVERED_STOCKS} of your stocks in full, and you can swap one each week. "
        f"Your swap is available now. {pick.ticker} had the biggest week of the stocks outside your five."
    )
    if covered:
        doc.h2("Covered now")
        doc.movers([(s.ticker, "Covered", s.week_change_pct) for s in covered])
    doc.h2("Biggest weeks outside your five")
    doc.movers([(s.ticker, "Not covered", s.week_change_pct) for s in sorted(outside, key=lambda s: -abs(s.week_change_pct or 0))[:3]])
    doc.button("Choose this week's swap", kit.app_url("/watchlist"))
    doc.link("Or cover everything with Pro", kit.app_url("/pricing"))
    return kit.render(doc, kind="swap_open", category="product",
                      subject=f"Your swap is open. {pick.ticker} moved {kit.pct(pick.week_change_pct)} outside your five",
                      preheader="Swap one covered stock this week, or cover them all with Pro.",
                      unsubscribe_token=unsubscribe_token)


def build_limit_reached(person: Person, *, title: str, body: str, used: int, cap: int, pro_cap: int | None = None,
                        unsubscribe_token: str | None = None) -> kit.Email:
    """Sent once per limit per month, the first time a Free account hits it.

    `pro_cap` is the Pro limit from lib/entitlements.ts (agents: 20); None means Pro has no limit.
    """
    doc = kit.Doc()
    doc.eyebrow("You reached a Free limit")
    doc.h1(title)
    # "Hi Tarun, you tried..." reads right; a body that starts with a name keeps its capital
    if body.split(" ", 1)[0] in {"You", "Your"}:
        body = body[:1].lower() + body[1:]
    doc.p(f"{_hello(person)} {body}")
    doc.stats([("Used", str(used), None), ("Free allows", str(cap), None),
               ("On Pro", "No limit" if pro_cap is None else f"Up to {pro_cap}", kit.t.COPPER)])
    doc.button("Compare Free and Pro", kit.app_url("/pricing"))
    doc.p("Nothing you've saved is deleted, and everything else keeps working.", muted=True, size=14)
    return kit.render(doc, kind="limit_reached", category="product", subject=title,
                      preheader="What the limit is, and what Pro changes.", unsubscribe_token=unsubscribe_token)


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
    since = (now.astimezone(ET).date() - timedelta(days=21))
    def stance_on(s: Stock, day: str) -> str:
        before = [c for c in s.calls if c.day <= day]
        return before[-1].stance if before else ""

    # count a change only when the direction moved (say from hold to add), not a rewording
    new_calls = [s for s in stocks if s.calls and stance_on(s, since.isoformat())
                 and direction(stance_on(s, since.isoformat())) != direction(s.calls[-1].stance)]
    doc = kit.Doc()
    doc.eyebrow("While you were away")
    lead = ranked[0]
    doc.h1(f"{lead.ticker} {kit.verb(change(lead))} {kit.pct(change(lead), signed=False)} in the three weeks since you last checked")
    doc.p(
        f"{_hello(person)} here's what happened in your stocks over the last three weeks. "
        + (f"Our call changed on {kit.plural(len(new_calls), 'stock')}." if new_calls else "None of our calls changed.")
    )
    doc.movers([(s.ticker, s.call_text or s.name, change(s)) for s in ranked[:6]])
    doc.button("Catch up on your watchlist", kit.app_url("/watchlist"))
    doc.p("This is the only reminder we'll send.", muted=True, size=14)
    return kit.render(doc, kind="winback", category="product",
                      subject=f"{lead.ticker} {kit.pct(change(lead))} and more since your last visit",
                      preheader=f"Three weeks in your {kit.plural(len(stocks), 'stock')}, in one minute.",
                      unsubscribe_token=unsubscribe_token)
