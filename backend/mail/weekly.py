"""The Saturday memo: how your stocks did this week, what it means, and what's next.

Leads with one line (your week against the S&P 500), then up to three insight
cards, a day-by-day chart, the biggest moves as bars, the calls we changed and
next week's earnings. No record of our past calls (owner, Nov 11).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from backend.mail import kit
from backend.subscription_entitlement import FREE_COVERED_WORD
from backend.mail.data import ET, Person, Stock, direction

# a week of news plus the weekend before it, so the biggest day of the week has its headlines
WEEK_NEWS_HOURS = 216
STALE_HISTORY_DAYS = 4  # a stock whose history stops earlier than this is left out of the week


def avg(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def _daily_changes(s: Stock, days: list[str]) -> dict[str, float]:
    """Close-to-close % change for each of `days` this stock has a close for (and the close before it)."""
    out: dict[str, float] = {}
    idx = {d: i for i, d in enumerate(s.dates)}
    for d in days:
        i = idx.get(d)
        if i and s.closes[i - 1]:
            out[d] = (s.closes[i] - s.closes[i - 1]) / s.closes[i - 1] * 100
    return out


def week_days(stocks: list[Stock], last: str) -> list[str]:
    """The last five session dates up to `last`, from the stock with the fullest history."""
    ref = max(stocks, key=lambda s: len(s.dates))
    days = [d for d in ref.dates if d <= last]
    return days[-5:]


def calls_changed(stocks: list[Stock], since: str, *, settled: int = 3) -> list[tuple[Stock, str, str]]:
    """Stocks whose call changed direction this week: (stock, before, after), in plain words.

    Like the daily brief, a change only counts when the call before it had held for
    `settled` calls, so a call that flips back and forth is not news.
    """
    out = []
    for s in stocks:
        if not s.calls or s.calls[-1].day < since:
            continue
        before = [c for c in s.calls if c.day < since]
        if len(before) < settled:
            continue
        prior = {direction(c.stance) for c in before[-settled:]}
        week = {direction(c.stance) for c in s.calls if c.day >= since}
        old, new = before[-1].stance, s.calls[-1].stance
        # settled before the week, one clean move during it (no round trip)
        if len(prior) == 1 and direction(old) != direction(new) and direction(old) not in week:
            out.append((s, kit.call_label(old), kit.call_label(new)))
    return out


def _reason_for_week(s: Stock, days: list[str]) -> tuple[str, str]:
    """A reason for this stock's biggest day of the week: news from the day before that session up to its
    close, that agrees with that day's move. ("", "") when none does."""
    from backend.mail.daily import first_reason

    moves = _daily_changes(s, days)
    if not s.news or not moves:
        return "", ""
    big_day = max(moves, key=lambda d: abs(moves[d]))
    close = datetime.combine(date.fromisoformat(big_day), time(16, 0), tzinfo=ET)
    return first_reason(s, close - timedelta(hours=30), close + timedelta(minutes=30), moves[big_day])


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
    spy_week = spy.week_change_pct if spy else None
    end_day = date.fromisoformat(last)

    doc = kit.Doc()
    shown_avg = round(week_avg or 0, 1)
    # from the rounded figures the reader sees, so "−3.5% vs −0.6%" reads as 2.9 points
    gap = round(round(week_avg, 1) - round(spy_week, 1), 1) if spy_week is not None and week_avg is not None else None
    if shown_avg == 0:
        doc.h1("Your stocks were flat this week.")
    else:
        doc.h1(f"Your stocks {'rose' if shown_avg > 0 else 'fell'} {kit.pct(week_avg, signed=False)} this week.")
    bits = []
    if gap is not None:
        bits.append("That's in line with the S&P 500." if gap == 0 else
                    f"That's {kit.pct(abs(gap), signed=False).rstrip('%')} points {'ahead of' if gap > 0 else 'behind'} the S&P 500 "
                    f"({kit.pct(spy_week)}).")
    if len(stocks) > 1:
        bits.append(f"{best.ticker} did best and {worst.ticker} did worst.")
    bits.append(f"Prices to the {end_day.strftime('%b %-d')} close.")
    doc.p(" ".join(bits), muted=True, size=kit.t.TEXT_SM)

    # the read: up to three figures, each against a baseline
    insights: list[kit.Insight] = []
    if len(stocks) >= 2:
        rose = sum(1 for s in stocks if round(s.week_change_pct or 0, 1) > 0)
        beat = sum(1 for s in stocks if spy_week is not None and (s.week_change_pct or 0) > spy_week)
        tail = f" {beat} did better than the S&P 500." if spy_week is not None else ""
        insights.append(kit.Insight(f"{rose} of {len(stocks)}", f"rose this week.{tail}"))
    if holdings and len(holdings) < len(stocks):
        h_avg = avg([s.week_change_pct for s in holdings])
        w_avg = avg([s.week_change_pct for s in stocks if s.position != "holding"])
        insights.append(kit.Insight(kit.pct(h_avg), f"The {kit.plural(len(holdings), 'stock')} you hold, against "
                                    f"{kit.pct(w_avg)} for the ones you only watch.", h_avg))
    if len(stocks) >= 4 and week_avg is not None:
        # how much of the week came from the two biggest moves
        big_two = sorted(stocks, key=lambda s: -abs(s.week_change_pct or 0))[:2]
        share = sum(abs(s.week_change_pct or 0) for s in big_two) / max(1e-9, sum(abs(s.week_change_pct or 0) for s in stocks)) * 100
        if share >= 25:
            insights.append(kit.Insight(f"{share:.0f}%", f"of the week's movement came from just {kit.join_words([s.ticker for s in big_two])}."))
    week_ago = (end_day - timedelta(days=6)).isoformat()
    changed = calls_changed(stocks, week_ago)
    if changed and len(insights) < 3:
        to_buy = sum(1 for _, _, after in changed if after == kit.BUY)
        to_sell = sum(1 for _, _, after in changed if after == kit.SELL)
        parts = [f"{to_buy} to Buy more" if to_buy else "", f"{to_sell} to Sell some" if to_sell else ""]
        detail = f": {kit.join_words([b for b in parts if b])}" if any(parts) else ""
        insights.append(kit.Insight(str(len(changed)), f"{'call' if len(changed) == 1 else 'calls'} changed this week{detail}."))
    doc.insights(insights)

    # what moved the week: the two best and two worst, each with the news behind its biggest day
    days = week_days(stocks, last)
    ups = [s for s in ranked if (s.week_change_pct or 0) > 0][:2]
    downs = [s for s in ranked[::-1] if (s.week_change_pct or 0) < 0 and s not in ups][:2]
    picks = ups + downs if len(stocks) > 1 else ranked[:1]
    if picks:
        cards, sources = [], set()
        for s in picks:
            why, src = _reason_for_week(s, days)
            if src:
                sources.add(src.split(" · ")[0])
            moves = _daily_changes(s, days)
            big_day = max(moves, key=lambda d: abs(moves[d])) if moves else None
            # the reason leads when we have one; then where it now sits against our call's own price
            label = kit.call_label(s.stance, s.call_text)
            lvl = kit.call_level(label, s.add_below, s.trim_above)
            where = ""
            if lvl and s.closes:
                g = (s.closes[-1] - lvl) / lvl * 100
                word = "buy-more" if label == kit.BUY else "sell-some"
                # within 0.2% is usually a level set at that close, which says nothing yet
                where = "" if abs(g) <= 0.2 else f"Now {kit.pct(abs(g), signed=False)} {'over' if g > 0 else 'under'} our {word} price."
            day_line = (f"Its biggest day was {date.fromisoformat(big_day).strftime('%A')}, {kit.pct(moves[big_day])}."
                        if big_day else "")
            line, why = (why, where) if why else (where or day_line, day_line if where else "")
            cards.append(kit.Card(ticker=s.ticker, figure=kit.pct(s.week_change_pct), figure_value=s.week_change_pct,
                                  call=kit.call_pill_text(label, kit.call_level(label, s.add_below, s.trim_above)),
                                  line=line, why=why, fallback=kit.recent_move(s.closes)))
        # two cards saying the same thing ("Now right at our buy-more price") say the day that made their week instead
        lines = [c.line for c in cards]
        cards = [kit.Card(**{**c.__dict__, "line": c.why or c.line, "why": ""}) if lines.count(c.line) > 1 and c.why else c
                 for c in cards]
        doc.h2("Best and worst weeks", aside=f"via {kit.join_words(sorted(sources))}" if sources else None)
        doc.cards(cards)

    # day by day: the equal-weight average of your stocks, with the S&P 500 under it
    if len(days) == 5:
        per_day = [avg([_daily_changes(s, days).get(d) for s in stocks]) for d in days]
        spy_days = [_daily_changes(spy, days).get(d) for d in days] if spy and spy.dates else []
        if all(v is not None for v in per_day):
            doc.h2("Day by day")
            labels = [date.fromisoformat(d).strftime("%a") for d in days]
            doc.days(labels, per_day, spy_days if spy_days and all(v is not None for v in spy_days) else None)

    # No list of every other stock: it crowds the email and says nothing (owner, Nov 11).

    if changed:
        doc.h2("Calls we changed")
        rows = []
        reasons = [(s.calls[-1].reason or s.call_reason) for s, _, _ in changed[:5]]
        for (s, before, after), reason in zip(changed[:5], reasons):
            # a canned reason shared by several calls says nothing about this one
            reason = reason if reasons.count(reason) == 1 else ""
            rows.append((s.ticker, f"{before} → {after}. {reason}".strip(), kit.change(s.week_change_pct)))
        doc.rows(rows)
        if len(changed) > 5:
            doc.p(f"And {len(changed) - 5} more in the app.", muted=True, size=kit.t.TEXT_SM)

    # Monday to Friday of the coming week (from a Saturday: two to six days out)
    week_start = today + timedelta(days=7 - today.weekday())
    week_end = week_start + timedelta(days=4)
    coming = sorted([s for s in person.emailed_stocks() if s.earnings_date and today <= s.earnings_date <= week_end],
                    key=lambda s: (s.earnings_date, s.ticker))
    if coming:
        doc.h2("Coming up next week")
        slots = {"bmo": "Earnings before the open", "amc": "Earnings after the close"}
        doc.calendar([(s.earnings_date.strftime("%a %b %-d"), s.ticker,
                       f"{slots.get(s.earnings_time, 'Earnings')} · {kit.call_label(s.stance, s.call_text)}"
                       if kit.call_label(s.stance, s.call_text) else slots.get(s.earnings_time, "Earnings"))
                      for s in coming[:6]])

    doc.button("Read the full memo", kit.app_url("/portfolio/memo"))

    if not person.is_pro:
        hidden = [s for s in person.uncovered_stocks() if s.week_change_pct is not None]
        if hidden:
            big = max(hidden, key=lambda s: abs(s.week_change_pct or 0))
            doc.note(
                f"{kit.plural(len(hidden), 'stock')} you track {'isn’t' if len(hidden) == 1 else 'aren’t'} covered on Free. "
                f"The biggest mover among them was {big.ticker} at {kit.pct(big.week_change_pct)}.",
                tone="copper",
                title=f"Outside your covered {FREE_COVERED_WORD}",
                link=("Pro covers everything you track", kit.app_url("/pricing")),
            )

    if len(stocks) > 1:
        subject = f"Your week {kit.pct(week_avg)}: {best.ticker} {kit.pct(best.week_change_pct)}, {worst.ticker} {kit.pct(worst.week_change_pct)}"
    else:
        subject = f"Your week: {best.ticker} {kit.pct(week_avg)}"
    bits = []
    if spy_week is not None:
        bits.append(f"S&P 500 {kit.pct(spy_week)}")
    if coming:
        bits.append(f"{kit.plural(len(coming), 'earnings report')} coming up")
    preheader = (". ".join(bits) + ".") if bits else f"Five trading days in your {kit.plural(len(stocks), 'stock')}."
    return kit.render(doc, kind="weekly_recap", category="weekly", subject=subject, preheader=preheader,
                      unsubscribe_token=unsubscribe_token, meta={"week_avg": week_avg},
                      dateline=f"Week to {end_day.strftime('%b %-d')}")
