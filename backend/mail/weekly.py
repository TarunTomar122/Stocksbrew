"""The Saturday recap: how your stocks did and what's next."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.subscription_entitlement import FREE_COVERED_WORD
from backend.mail.data import ET, Person, Stock

STALE_HISTORY_DAYS = 4  # a stock whose history stops earlier than this is left out of the week


def avg(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def build_weekly(person: Person, *, market: dict[str, Stock] | None = None, now: datetime | None = None,
                 unsubscribe_token: str | None = None) -> kit.Email | None:
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(ET).date()
    stocks = [s for s in person.emailed_stocks() if s.week_change_pct is not None]
    if not stocks:
        return None
    # a halted or delisted stock keeps an old "week"; only compare stocks that share this one
    last = max((s.dates[-1] for s in stocks if s.dates), default=today.isoformat())
    cutoff = (date.fromisoformat(last) - timedelta(days=STALE_HISTORY_DAYS)).isoformat()
    stocks = [s for s in stocks if not s.dates or s.dates[-1] >= cutoff]
    market = market or {}
    spy = market.get("SPY")

    week_avg = avg([s.week_change_pct for s in stocks])
    holdings = [s for s in stocks if s.position == "holding"]
    ranked = sorted(stocks, key=lambda s: s.week_change_pct or 0, reverse=True)
    best, worst = ranked[0], ranked[-1]

    doc = kit.Doc()
    doc.eyebrow(f"Weekly recap · five sessions to {date.fromisoformat(last).strftime('%b %-d')}")
    shown_avg = round(week_avg or 0, 1)
    if shown_avg == 0:
        doc.h1("Your stocks were flat this week")
    else:
        doc.h1(f"Your stocks {'rose' if shown_avg > 0 else 'fell'} {kit.pct(week_avg, signed=False)} this week")
    vs = ""
    if spy and spy.week_change_pct is not None and week_avg is not None:
        gap = round(week_avg - spy.week_change_pct, 1)
        vs = (" That's in line with the S&P 500." if gap == 0
              else f" That's {kit.pct(abs(gap), signed=False)} {'ahead of' if gap > 0 else 'behind'} the S&P 500.")
    spread = f" {best.ticker} did best and {worst.ticker} did worst." if len(stocks) > 1 else ""
    if (vs + spread).strip():
        doc.p((vs + spread).strip())
    watch = [s for s in stocks if s.position != "holding"]
    doc.stats([
        ("Holdings", kit.pct(avg([s.week_change_pct for s in holdings])) if holdings else "None yet",
         kit.tone_color(avg([s.week_change_pct for s in holdings])) if holdings else None),
        ("Watchlist", kit.pct(avg([s.week_change_pct for s in watch])) if watch else "None yet",
         kit.tone_color(avg([s.week_change_pct for s in watch])) if watch else None),
        ("S&P 500", kit.pct(spy.week_change_pct) if spy and spy.week_change_pct is not None else "n/a",
         kit.tone_color(spy.week_change_pct) if spy else None),
    ])

    doc.h2("Biggest moves")
    top = ranked[:3]
    bottom = [s for s in ranked[::-1][:3] if s not in top]
    doc.movers([(s.ticker, s.call_text or s.name, s.week_change_pct) for s in top + bottom])

    # No record of our past calls in emails (owner, Nov 11): it is a scoreboard by another name.

    # Monday to Friday of the coming week (from a Saturday: two to six days out)
    week_start = today + timedelta(days=7 - today.weekday())
    week_end = week_start + timedelta(days=4)
    coming = sorted([s for s in person.emailed_stocks() if s.earnings_date and today <= s.earnings_date <= week_end],
                    key=lambda s: (s.earnings_date, s.ticker))
    if coming:
        doc.h2("Coming up next week")
        slots = {"bmo": "Earnings before the open", "amc": "Earnings after the close"}
        doc.calendar([(s.earnings_date.strftime("%a %b %-d"), s.ticker, slots.get(s.earnings_time, "Earnings"))
                      for s in coming[:6]])

    doc.button("Review your watchlist", kit.app_url("/watchlist"))

    if not person.is_pro:
        hidden = [s for s in person.uncovered_stocks() if s.week_change_pct is not None]
        if hidden:
            big = max(hidden, key=lambda s: abs(s.week_change_pct or 0))
            doc.note(
                f"{kit.plural(len(hidden), 'stock')} you track aren't covered on Free. The biggest mover among them was "
                f"{big.ticker} at {kit.pct(big.week_change_pct)}. Pro covers everything you track.",
                tone="copper",
                title=f"Outside your covered {FREE_COVERED_WORD}",
            )
            doc.link("Compare Free and Pro", kit.app_url("/pricing"))

    subject = (f"Your week: {kit.pct(week_avg)}, {best.ticker} led, {worst.ticker} lagged" if len(stocks) > 1
               else f"Your week: {best.ticker} {kit.pct(week_avg)}")
    bits = []
    if coming:
        bits.append(f"{kit.plural(len(coming), 'earnings report')} coming up")
    preheader = (kit.join_words(bits)[:1].upper() + kit.join_words(bits)[1:] + ".") if bits else \
        f"Five trading days in your {kit.plural(len(stocks), 'stock')}."
    return kit.render(doc, kind="weekly_recap", category="weekly", subject=subject, preheader=preheader,
                      unsubscribe_token=unsubscribe_token, meta={"week_avg": week_avg})
