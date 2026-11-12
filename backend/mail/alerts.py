"""Alert emails: what your agent jobs found, bundled.

Runs that land within the bundling window go out as one email. Each
agent gets a section headed by its name and the close it read ("Yesterday's
close"), and each stock one card: logo, ticker and company, its price and the
move into it labelled with its day, and one short line (the level of our call
it reached, our call that changed, or when it reports). A stock whose price
stopped updating is left out.

Price alerts set by hand (tm_alerts) are here too, one email per alert that
fires (`build_price_alert`), under the same email_alerts_enabled switch.

The two agents that answer "tell me when to sell" read in plain words:
"Oracle reached our sell-some price, $255.76" and "Our call on AMD changed to Sell some".
"""
from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.mail.data import ET, Person, last_day_move, parse_ts
from backend.mail.nyse import last_closed_session, previous_session, session_close, trading_day
from backend.mail.source import Source

BUNDLE_WINDOW_MIN = 15
MAX_ALERT_EMAILS_PER_DAY = 4
MAX_LISTED = 12  # findings shown per agent before the email points at the app


@dataclass
class Finding:
    job_name: str
    ticker: str | None
    headline: str
    detail: str
    source: str
    at: str
    url: str
    # the numbers behind the sentence (lib/agent-jobs.ts AgentFinding); runs recorded before them have text only
    kind: str = ""
    change_pct: float | None = None
    close: float | None = None
    zone: str | None = None  # "add" (Buy more) or "trim" (Sell some)
    level: float | None = None
    time: str = ""  # earnings: "bmo" or "amc"
    run_day: str = ""  # the market day the run evaluated
    run_close: str = ""  # the newest close the run read
    call_from: str = ""  # call changes: the call before, in reader words ("Keep"); "" when the plan hid it
    call_to: str = ""  # call changes: the call now ("Sell some")


# Job names the app gave by default before it used the call's own words. A name a person typed stays as typed.
_OLD_DEFAULT_NAMES = {"Names entering their add zone": "Stocks reaching their buy-more level"}

PRICE_SOURCE = "Daily closing prices"


def load_findings(src: Source, uid: str, *, since: datetime) -> list[Finding]:
    rows = src.query("tm_agent_runs", [("uid", "==", uid), ("decision", "==", "notify")], limit=200)
    out: list[Finding] = []
    for _, run in sorted(rows, key=lambda r: str(r[1].get("ran_at") or "")):
        ran = parse_ts(run.get("ran_at"))
        if ran is None or ran < since:
            continue
        name = str(run.get("job_name") or "Agent job")
        for f in run.get("findings") or []:
            url = str(f.get("url") or "")
            zone = str(f.get("zone") or "")
            out.append(
                Finding(
                    job_name=name,
                    ticker=(str(f.get("ticker")).upper() if f.get("ticker") else None),
                    headline=str(f.get("headline") or "").strip(),
                    detail=str(f.get("detail") or "").strip(),
                    source=str(f.get("source") or "").strip(),
                    at=str(f.get("at") or "")[:10],
                    url=kit.app_url(url) if url.startswith("/") else url,
                    kind=str(f.get("kind") or ""),
                    change_pct=_number(f.get("change_pct")),
                    close=_number(f.get("close")),
                    zone=zone if zone in ("add", "trim") else None,
                    level=_number(f.get("level")),
                    time=str(f.get("time") or ""),
                    run_day=str(run.get("day") or "")[:10],
                    run_close=str(run.get("latest_close") or "")[:10],
                    call_from=kit.call_label(text=str(f.get("call_from") or "")) if f.get("call_from") else "",
                    call_to=kit.call_label(text=str(f.get("call_to") or "")) if f.get("call_to") else "",
                )
            )
    return out


def _number(value: object) -> float | None:
    try:
        v = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _tidy(text: str) -> str:
    """Agent text says "20.02%"; everywhere else a move has one decimal."""
    return re.sub(r"(\d+\.\d)\d+%", r"\1%", text)


def _short(f: Finding) -> str:
    """The finding without its ticker in front: "IREN rose 20%" -> "Rose 20%"."""
    text = f.headline
    if f.ticker and text.upper().startswith(f"{f.ticker} "):
        text = kit.cap(text[len(f.ticker) + 1:].strip())
    return text


_MOVE = re.compile(r"^(rose|fell|up|down|gained|dropped|jumped|slid)\s+([\d.]+)%\s*(.*)$", re.I)


def _move_figure(text: str) -> tuple[float | None, str]:
    """"Rose 20.02% in the last session" -> (20.02, "in the last session")."""
    m = _MOVE.match(text.strip())
    if not m:
        return None, text
    value = float(m.group(2)) * (-1 if m.group(1).lower() in ("fell", "down", "dropped", "slid") else 1)
    return value, m.group(3).strip()


# ------------------------------------------------------------------ stock rows

@dataclass
class Row:
    """One stock in a section: what the email shows for it, and the sentence that says it."""
    ticker: str
    kind: str  # "zone", "call", "move", "report" or "other"
    at: str
    close: float | None = None
    change: float | None = None
    zone: str | None = None
    level: float | None = None
    line: str = ""  # the one short line under the name
    sentence: str = ""  # the whole fact as a sentence, for the headline, preheader and plain text
    report: str = ""  # "Reports tomorrow after the close", merged into a price row of the same stock
    span: bool = False  # a move over five sessions, not one
    quote_at: str = ""  # a report row's close, from the stored daily closes
    price: str = ""  # the close as written in the sentence, when it must differ from kit.money's rounding
    call_to: str = ""  # call rows: our call now, shown as its pill
    call_from: str = ""  # call rows: the call before, shown once as "Buy more → Keep"
    base_line: str = ""  # the line before a report date was merged into it


def _quote_reports(rows: list[Row], quotes: dict) -> None:
    """A stock that reports soon, or whose call changed, gets its close and that day's move from the stored daily
    closes, on the same session as the moves beside it (or its latest close in a section without moves). When the
    stored closes stop short of that session, the latest quote counts if it is from the same session. Nothing
    when we have neither."""
    prices = [r.at for r in rows if r.kind in ("zone", "move") and r.at]
    newest = max(prices) if prices else ""
    for r in rows:
        s = quotes.get(r.ticker)
        if r.kind not in ("report", "call") or s is None:
            continue
        i = len(s.dates) - 1
        while i > 0 and newest and s.dates[i] > newest:
            i -= 1
        if len(s.closes) >= 2 and i >= 1 and (not newest or s.dates[i] == newest) and s.closes[i - 1]:
            r.close, r.change, r.quote_at = s.closes[i], (s.closes[i] / s.closes[i - 1] - 1) * 100, s.dates[i]
            continue
        quoted = s.price_at.astimezone(ET).date().isoformat() if s.price_at else ""
        if newest and quoted == newest and s.price is not None:
            r.close, r.change, r.quote_at = s.price, s.change_pct, quoted


def _is_price(f: Finding) -> bool:
    return f.kind in ("move", "level") or (not f.kind and f.source == PRICE_SOURCE)


def _is_call(f: Finding) -> bool:
    return f.kind == "call" and bool(f.call_to)


def _is_report(f: Finding) -> bool:
    return f.kind == "earnings" or (not f.kind and f.source == "Earnings calendar")


def _date(iso: str) -> date | None:
    try:
        return date.fromisoformat(iso[:10])
    except ValueError:
        return None


def _session_before(day: str, sessions: list[str]) -> str:
    """The trading day before `day`: from the stored closes when they reach it, else the weekday before."""
    earlier = [d for d in sessions if d < day]
    if earlier and max(sessions) >= day:
        return max(earlier)
    d = _date(day)
    if d is None:
        return ""
    d -= timedelta(days=1)
    while not trading_day(d):
        d -= timedelta(days=1)
    return d.isoformat()


def drop_behind(findings: list[Finding], sessions: list[str]) -> list[Finding]:
    """Leave out a price older than the session before the newest close its run read: a stock whose price stopped
    updating, whose "last session" was days ago. The inbox and the agents page leave it out the same way."""
    newest: dict[tuple[str, str], str] = {}
    for f in findings:
        if _is_price(f) and f.at:
            key = (f.job_name, f.run_day)
            newest[key] = max(newest.get(key, ""), f.run_close or "", f.at)
    floors = {key: _session_before(day, sessions) for key, day in newest.items() if day}
    return [f for f in findings if not (_is_price(f) and f.at and f.at < floors.get((f.job_name, f.run_day), ""))]


_CLOSED_AT = re.compile(r"Closed at \$([\d,]+(?:\.\d+)?)")
_TO_PRICE = re.compile(r" to \$([\d,]+(?:\.\d+)?) on")
_DAY_CHANGE = re.compile(r"([+−-])([\d.]+)% on the day")
_OLD_ZONE = re.compile(r"add zone, at or below \$([\d,]+(?:\.\d+)?)")


def _money_in(pattern: re.Pattern[str], text: str) -> float | None:
    m = pattern.search(text)
    return _number(m.group(1).replace(",", "")) if m else None


def _level_where(close: float, level: float, zone: str) -> tuple[str, str]:
    """("$139.75", "below its $142.07 buy-more level"); "at" when the close is the level to the cent. The close is
    written so it never reads the same as a different level ($1,410.60 vs $1,411.20, not $1,411 twice)."""
    a, b = kit.money_pair(close, level)
    where = "at" if round(close, 2) == round(level, 2) else ("below" if zone == "add" else "above")
    return a, f"{where} its {b} {'buy-more' if zone == 'add' else 'sell-some'} level"


def _report_words(f: Finding, today: date) -> str:
    """"Reports tomorrow before the open", "Reports Thursday", "Reports on Nov 20", counted from the day the email
    is read (US Eastern), which is the run's day: the bundle goes out within minutes of it."""
    on, run = _date(f.at), today
    time = f.time or ("bmo" if "before the open" in f.detail else "amc" if "after the close" in f.detail else "")
    tail = " before the open" if time == "bmo" else " after the close" if time == "amc" else ""
    if on is None or run is None:
        return kit.cap(_short(f)) if f.headline else ""
    gap = (on - run).days
    if gap < 0:
        return ""  # already reported: no longer a heads-up
    when = kit.day_word(on, run)
    when = when if gap < 7 else f"on {when}"
    return f"Reports {when}{tail}"


def _row(f: Finding, today: date) -> Row:
    t = f.ticker or ""
    if _is_report(f):
        words = _report_words(f, today)
        if not words:
            return Row(ticker=t, kind="gone", at=f.at)
        return Row(ticker=t, kind="report", at=f.at, line=words, report=words,
                   sentence=f"{t} {words[:1].lower()}{words[1:]}" if t else words)
    if _is_price(f) or f.kind == "mover":
        text = _short(f)
        value, rest = _move_figure(text)
        change = f.change_pct if f.change_pct is not None else value
        if change is None and (m := _DAY_CHANGE.search(f.detail)):
            change = _number(m.group(2))
            change = -change if change is not None and m.group(1) in "−-" else change
        close = f.close if f.close is not None else (_money_in(_CLOSED_AT, f.detail) or _money_in(_TO_PRICE, f.detail))
        zone, level = f.zone, f.level
        if zone is None and (old := _money_in(_OLD_ZONE, f.headline)) is not None:
            zone, level = "add", old
        span = "over five sessions" in f.headline
        if zone and level is not None and close is not None:
            shown, where = _level_where(close, level, zone)
            over = " over five sessions" if span else ""
            move = f"{kit.verb(change)} {kit.pct(change, signed=False)}{over} to {shown}" if change is not None else f"closed at {shown}"
            # the card says the whole fact (owner rule 5b): "Fell 2.3% to $139.75, below its $142.07 buy-more level."
            return Row(ticker=t, kind="zone", at=f.at, close=close, change=change, zone=zone, level=level,
                       line=f"{kit.cap(move)}, {where}.", sentence=f"{t} {move}, {where}", span=span, price=shown)
        # "…in a day, about four times a normal day": the measured scale is the row's line
        scale = re.match(r"in a day, (.+)$", rest.rstrip("."))
        move = f"{kit.verb(change)} {kit.pct(change, signed=False)}" if change is not None else ""
        sentence = f"{t} {move}{' to ' + kit.money(close) if close is not None and move else ''}{' over five sessions' if span else ''}" if move else _tidy(f.headline)
        return Row(ticker=t, kind="move", at=f.at, close=close, change=change,
                   line=kit.cap(scale.group(1)) if scale else "", sentence=sentence, span=span)
    if _is_call(f):
        # "Our call on AMD changed to Sell some": the row shows the new call as its pill, "was Keep" beside it,
        # and the reason under it when it is short and in plain words
        was = f" from {f.call_from}" if f.call_from and f.call_from != f.call_to else ""
        reason = _tidy(f.detail) if kit.fits(f.detail) and not _DESK_WORDS.search(f.detail) else ""
        return Row(ticker=t, kind="call", at=f.at, call_to=f.call_to, line=kit.cap(reason),
                   call_from=f.call_from if was else "",
                   sentence=f"Our call on {t} changed{was} to {f.call_to}" if t else f"Our call changed to {f.call_to}")
    return Row(ticker=t, kind="other", at=f.at, line=_tidy(_short(f)), sentence=_tidy(f.headline))


# A call's stored reason written in trading-desk words ("the setup", "reduce exposure", "avoid adding") is left
# out of the email; the row still says what the call was and is.
_DESK_WORDS = re.compile(r"\bset-?up\b|exposure|risk/reward|\bavoid\b|\btrim|accumulat|\bhold\b|\badd(ing)?\b|\bbounce\b", re.I)


_RANK = {"zone": 0, "call": 1, "move": 2, "report": 3, "other": 4}


def _section_rows(items: list[Finding], today: date) -> list[Row]:
    """One row per stock, what matters most first: a level of our call, then the biggest moves, then reports by date.
    A stock that moved and also reports soon is one row that says both."""
    rows: list[Row] = []
    by_ticker: dict[str, Row] = {}
    reports: list[Row] = []
    for f in items:
        r = _row(f, today)
        if r.kind == "gone":
            continue
        if r.kind == "report":
            reports.append(r)
            continue
        if r.ticker and r.kind in ("zone", "move", "call"):
            if r.ticker in by_ticker:
                continue
            by_ticker[r.ticker] = r
        rows.append(r)
    for r in sorted(reports, key=lambda x: (x.at, x.ticker)):
        price = by_ticker.get(r.ticker)
        if price and price.kind != "call" and not price.report:
            price.report = r.report
            # "…below its $142.07 buy-more level, reports tomorrow": one line; the level alone waits behind it
            # in case the two together run past 15 words
            price.base_line = price.line
            merged = price.line.rstrip(".")
            price.line = f"{merged}, {r.report[:1].lower()}{r.report[1:]}." if merged else r.report
            continue
        rows.append(r)
    order = {id(r): i for i, r in enumerate(rows)}
    return sorted(rows, key=lambda r: (_RANK[r.kind], -abs(r.change or 0) if r.kind in ("zone", "move") else 0,
                                       r.at if r.kind == "report" else "", order[id(r)]))


def _cards(rows: list[Row], names: dict[str, str], today: date) -> list[kit.Card]:
    """One card per row: logo, ticker and company, the close, the move labelled with its day, and one line. The
    section header says the close once; a card from an earlier session names its own day in its label."""
    out = []
    for r in rows:
        at = r.at if r.kind in ("zone", "move") else r.quote_at
        period = "over five sessions" if r.span else (_day(at, today) if at else "")
        call = ""
        if r.kind == "call":
            call = f"{r.call_from} → {r.call_to}" if r.call_from else r.call_to
        out.append(kit.Card(ticker=r.ticker, name=names.get(r.ticker, ""), price=r.close, move=r.change, period=period,
                            call=call, line=r.line, why=r.base_line, link=bool(r.ticker),
                            # a report date or a level is this stock's own fact, even when another card says the same words
                            own=r.kind in ("report", "zone") or bool(r.report)))
    return out


def _names_list(tickers: list[str], max_: int = 4) -> str:
    if len(tickers) <= max_:
        return kit.join_words(tickers)
    return f"{', '.join(tickers[:max_ - 1])} and {len(tickers) - max_ + 1} more"


def _headline(rows: list[Row], first: list[Row], names: dict[str, str], today: date) -> str:
    """The email's one headline, ten words at most (owner rule 8): a level of our call first, then a call that
    changed, then a batch of moves, then the top row. A sentence that runs long falls back to a shorter one."""
    zones = [r for r in rows if r.kind == "zone"]
    if len(zones) == 1 and zones[0].level is not None:
        z = zones[0]
        # the level printed as the row prints it, so $1,411.20 never reads as $1,411 beside a $1,410.60 close
        level = kit.money_pair(z.close, z.level)[1] if z.close is not None else kit.money(z.level)
        reached = f"{kit.short_name(names.get(z.ticker, ''), z.ticker) or z.ticker} reached our {'sell-some' if z.zone == 'trim' else 'buy-more'} price, {level}."
        # a sell-some hit reads in the owner's words; a buy-more hit says the move that got it there when that fits
        if z.zone == "trim":
            return reached if kit.word_count(reached) <= 10 else f"{z.ticker} reached our sell-some price, {level}."
        said = z.sentence + "."
        return said if kit.word_count(said) <= 10 else reached if kit.word_count(reached) <= 10 else \
            f"{z.ticker} reached our buy-more price, {level}."
    if zones:
        parts = []
        for zone, verb_, word in (("add", "fell", "buy-more"), ("trim", "rose", "sell-some")):
            tickers = [r.ticker for r in zones if r.zone == zone]
            if tickers:
                parts.append(f"{_names_list(tickers, 3)} {verb_} to {'its' if len(tickers) == 1 else 'their'} {word} "
                             f"level{'s' if len(tickers) > 1 else ''}")
        said = kit.cap(" and ".join(parts)) + "."
        return said if kit.word_count(said) <= 10 else f"{len(zones)} of your stocks reached a price in our call."
    calls = [r for r in rows if r.kind == "call" and r.ticker]
    if len(calls) == 1:
        return f"Our call on {calls[0].ticker} changed to {calls[0].call_to}."
    if calls:
        return f"Our calls on {_names_list([r.ticker for r in calls], 3)} changed."
    moves = [r for r in first if r.kind == "move" and r.change is not None]
    if len(moves) >= 3 and not any(r.span for r in moves):
        top = max(moves, key=lambda r: abs(r.change or 0))
        ups, downs = all((r.change or 0) > 0 for r in moves), all((r.change or 0) < 0 for r in moves)
        floor = math.floor(min(abs(r.change or 0) for r in moves))  # "9% or more" must hold for every stock listed
        verb_ = "rose" if ups else "fell" if downs else "moved"
        day = _day(top.at, today) if top.at else ""
        day = f" on {day}" if day and day not in ("today", "yesterday") else f" {day}" if day else ""
        return f"{len(moves)} of your stocks {verb_} {floor}% or more{day}."
    lead = first[0] if first else rows[0]
    return _fit_title(kit.cap(lead.sentence.rstrip(".")) + ".", [r.ticker for r in rows if r.ticker])


def _fit_title(title: str, tickers: list[str]) -> str:
    """A headline over ten words (owner rule 8) becomes the stocks it is about."""
    if kit.word_count(title) <= 10:
        return title
    names = list(dict.fromkeys(tickers))
    return f"News on {_names_list(names, 3)} from your agents." if names else "Your agents found something new."


def build_alerts(person: Person, findings: list[Finding], *, unsubscribe_token: str | None = None,
                 now: datetime | None = None) -> kit.Email | None:
    today = (now or datetime.now(timezone.utc)).astimezone(ET).date()
    findings = [f for f in findings if f.headline]
    sessions = sorted({d for s in person.stocks for d in s.dates[-15:]})
    findings = drop_behind(findings, sessions)
    if not findings:
        return None
    # calls and levels only for stocks this account's plan covers; others show the finding alone
    by_ticker = {s.ticker: s for s in person.emailed_stocks()}
    names = {s.ticker: s.name for s in person.stocks}
    quotes = {s.ticker: s for s in person.stocks}
    jobs: dict[str, list[Finding]] = {}
    for f in findings:
        jobs.setdefault(_OLD_DEFAULT_NAMES.get(f.job_name, f.job_name), []).append(f)

    # each agent's stocks as rows; a stock's move already shown under one agent is not shown again under another
    sections: list[tuple[str, list[Finding], list[Row]]] = []
    for job, items in jobs.items():
        tabled = any(_is_price(f) or _is_report(f) or _is_call(f) or f.kind == "mover" for f in items)
        sections.append((job, items, _section_rows(items, today) if tabled else []))
    # the agent with a stock at a level of our call first, then the one with the biggest move
    sections.sort(key=lambda s: (0 if any(r.kind in ("zone", "call") for r in s[2]) else 1 if s[2] else 2,
                                 -max((abs(r.change or 0) for r in s[2]), default=0)))
    shown: set[tuple[str, str]] = set()
    kept: list[tuple[str, list[Finding], list[Row]]] = []
    for job, items, rows in sections:
        if rows:
            kept_rows = []
            for r in rows:
                if r.kind in ("zone", "move") and (r.ticker, r.at) in shown:
                    if r.report:  # the move was said above; its report date still belongs here
                        kept_rows.append(Row(ticker=r.ticker, kind="report", at=r.at, line=r.report, report=r.report,
                                             sentence=f"{r.ticker} {r.report[:1].lower()}{r.report[1:]}"))
                    continue
                kept_rows.append(r)
            rows = kept_rows
            shown |= {(r.ticker, r.at) for r in rows if r.kind in ("zone", "move")}
            if not rows:
                continue
        kept.append((job, items, rows))
    all_rows = [r for _, _, rows in kept for r in rows]
    n = sum(len(rows) or len(items) for _, items, rows in kept)

    for _, _, rows in kept:
        _quote_reports(rows, quotes)

    doc = kit.Doc()
    _, first_items, first_rows = kept[0]
    h1 = (_headline(all_rows, first_rows, names, today) if all_rows
          else _fit_title(kit.cap(first_items[0].headline.rstrip(".")) + ".", [f.ticker for f in findings if f.ticker]))
    # the headline, then straight into the sections: no "also in here" summary (owner, Nov 12)
    doc.h1(_tidy(h1))

    for job, items, rows in kept:
        # a reason shared by two calls says nothing about either (owner rule 1)
        reasons = [r.line for r in rows if r.kind == "call" and r.line]
        for r in rows:
            if r.kind == "call" and reasons.count(r.line) > 1:
                r.line = ""
        if rows:
            prices = [r.at for r in rows if r.kind in ("zone", "move") and r.at] or [r.quote_at for r in rows if r.quote_at]
            newest = max(prices) if prices else ""
            span = any(r.span for r in rows)
            # the run's close, said once for the section, so no row needs a date
            aside = (f"Five sessions to {_day(newest, today)}" if span else kit.close_word(newest, today)) if newest else None
            doc.h2(job, aside=aside)
            doc.cards(_cards(rows[:MAX_LISTED], names, today))
            if len(rows) > MAX_LISTED:
                doc.p(f"Plus {len(rows) - MAX_LISTED} more in the app.", muted=True, size=kit.t.TEXT_SM)
            continue
        _other_section(doc, job, items, by_ticker, quotes, names, today)

    doc.button("See what your agents found", kit.app_url("/agents/jobs"))

    subject = _tidy(h1).rstrip(".")
    if len(subject) > 90:
        tickers = list(dict.fromkeys([r.ticker for r in all_rows if r.ticker] + [f.ticker for f in findings if f.ticker]))
        subject = f"{n} alerts: {', '.join(tickers[:4])}"
    rest = [r.sentence for r in all_rows[1:4] if r.sentence] if all_rows else [f.headline for f in findings[1:4]]
    preheader = _tidy("; ".join(rest) or findings[0].detail or h1)
    return kit.render(doc, kind="alerts", category="alerts", subject=subject, preheader=preheader,
                      unsubscribe_token=unsubscribe_token, meta={"count": n},
                      reason="You get this because your agents on stocksbrew watch these stocks for you.",
                      dateline="Agent alert")


def _other_section(doc: kit.Doc, job: str, items: list[Finding], by_ticker: dict, quotes: dict, names: dict[str, str],
                   today: date) -> None:
    """Filings, trades and news: a card per stock with our call and the finding as its line. No source line under
    the heading (owner rule): the link to the stock carries it."""
    doc.h2(job)
    cards = []
    for f in items[:MAX_LISTED]:
        if not f.ticker:
            doc.note(f.detail or f.headline, title=f.headline if f.detail else None)
            continue
        s = by_ticker.get(f.ticker)
        label = kit.call_label(s.stance, s.call_text) if s else ""
        q = quotes.get(f.ticker)
        cards.append(kit.Card(
            ticker=f.ticker,
            name=names.get(f.ticker, ""),
            price=q.price if q else None,
            move=q.change_pct if q else None,
            period=_day(q.price_at.astimezone(ET).date().isoformat(), today) if q and q.price_at else "",
            call=kit.call_pill_text(label, kit.call_level(label, s.add_below, s.trim_above)) if s else "",
            line=_tidy(_short(f)),
            why=_tidy(f.detail),
        ))
    doc.cards(cards)
    if len(items) > MAX_LISTED:
        doc.p(f"Plus {len(items) - MAX_LISTED} more in the app.", muted=True, size=kit.t.TEXT_SM)


def _day(iso: str, today: date) -> str:
    """"yesterday", "Tuesday", or "Nov 3" beyond a week (kit.day_word)."""
    return kit.day_word(iso, today)


def bundle_since(last_sent_at: datetime | None, now: datetime | None = None) -> datetime:
    """Findings newer than the last alert email, and never older than a day."""
    now = now or datetime.now(timezone.utc)
    floor = now - timedelta(days=1)
    return max(last_sent_at, floor) if last_sent_at else floor


# ------------------------------------------------------------- hand-set price alerts

PRICE_ALERTS = "tm_alerts"


def _whole_money(value: float) -> str:
    """$142 for a round alert price, $142.50 otherwise: the price as the person typed it."""
    return f"${value:,.0f}" if abs(value - round(value)) < 0.005 else kit.money(value, digits=2)


def load_price_alerts(src: Source) -> dict[str, list[dict]]:
    """Every live hand-set price alert, by account: active, not yet fired, not paused, a below/above rule and a price.
    The web app writes them (lib/create-alert.ts, kind "price_threshold"; older ones have no kind)."""
    out: dict[str, list[dict]] = {}
    for path, a in src.query(PRICE_ALERTS, [("active", "==", True), ("triggered", "==", False)], limit=5000):
        if a.get("kind") not in (None, "", "price_threshold") or a.get("condition") not in ("below", "above"):
            continue
        if a.get("paused_reason"):  # its stock was removed from the person's list (lib/stock-alerts.ts syncAlertPauses)
            continue
        target, uid = _number(a.get("target_price")), str(a.get("uid") or "")
        if not target or target <= 0 or not uid or not a.get("ticker"):
            continue
        out.setdefault(uid, []).append({**a, "id": path.rsplit("/", 1)[-1], "target_price": target})
    return out


QUOTE_FRESH_MIN = 30  # a price alert fires only on a quote this fresh during market hours


def alert_price(stock, now: datetime) -> tuple[float, float | None, date] | None:
    """The price a hand-set alert is judged on, with its move and the day it is from, or None when we have none
    fresh enough. During the regular session: the live quote, at most 30 minutes old. Outside it: the actual close of
    the latest session that has ended (4pm ET, 1pm on a half day), from the stored daily closes, never a quote taken
    before the bell, since the price can turn in the last half hour. The shared loader keeps quotes up to 80 hours
    old, which suits a brief but not "your price was crossed"."""
    et = now.astimezone(ET)
    today = et.date()
    open_ = et.replace(hour=9, minute=30, second=0, microsecond=0)
    if trading_day(today) and open_ <= et < session_close(today):
        at = stock.price_at
        # taken in today's session (never a premarket quote at 9:30) and at most 30 minutes old
        if (stock.price is None or at is None or at < open_ or at > now + timedelta(minutes=5)
                or now - at > timedelta(minutes=QUOTE_FRESH_MIN)):
            return None
        # the day move against the stored close of the previous NYSE session, never the quote's own figure, whose
        # baseline we can't check; no stored close for that session, no move
        prev_day = previous_session(today).isoformat()
        base = stock.closes[stock.dates.index(prev_day)] if prev_day in stock.dates else None
        return stock.price, ((stock.price / base - 1) * 100 if base else None), today
    session = last_closed_session(now)
    if not stock.dates or stock.dates[-1] != session.isoformat() or not stock.closes:
        return None  # the close for that session isn't stored yet: wait for it rather than guess
    # the day move only when the close before it is the previous session's; a gap would be several days' move
    move = last_day_move(stock)
    return stock.closes[-1], (move[0] if move else None), session


def price_alert_hit(alert: dict, price: float | None) -> bool:
    if price is None:
        return False
    target = float(alert["target_price"])
    return price <= target if alert.get("condition") == "below" else price >= target


def build_price_alert(stock, alert: dict, *, now: datetime | None = None,
                      unsubscribe_token: str | None = None) -> kit.Email | None:
    """One hand-set alert that fired: "SPCX is below your $142 alert." and one card that says the move,
    with one button to the stock. None when the price has not reached the alert, or the quote is not fresh
    (`quote_fresh`), so a stale price never fires an alert or marks it done."""
    now = now or datetime.now(timezone.utc)
    judged = alert_price(stock, now)
    if judged is None or not price_alert_hit(alert, judged[0]):
        return None
    price, change, day = judged
    today = now.astimezone(ET).date()
    target = float(alert["target_price"])
    # a price right on the alert reads "at", never "below" or "above"
    where = "at" if round(price, 2) == round(target, 2) else "below" if alert.get("condition") == "below" else "above"
    move = (f"{kit.cap(kit.verb(change))} {kit.pct(change, signed=False)} to {kit.money(price)}"
            if change is not None and round(change, 1) != 0 else f"At {kit.money(price)}")
    line = f"{move}, {where} your {_whole_money(target)} alert."
    period = _day(day.isoformat(), today)
    doc = kit.Doc()
    title = f"{stock.ticker} is {where} your {_whole_money(target)} alert"
    doc.h1(title + ".")
    doc.cards([kit.Card(ticker=stock.ticker, name=stock.name, price=price, move=change, period=period, line=line)])
    doc.button(f"Open {stock.ticker}", kit.stock_url(stock.ticker))
    return kit.render(doc, kind="price_alert", category="alerts", subject=title, preheader=line,
                      unsubscribe_token=unsubscribe_token, meta={"ticker": stock.ticker, "alert": str(alert.get("id") or "")},
                      reason="You get this because you set a price alert on stocksbrew.", dateline="Price alert")


# ------------------------------------------------------------- earnings reminders

EARNINGS_REMINDER_KIND = "earnings_24h"
EARNINGS_REMINDER_HOUR = 9  # ET: the 15-minute run sends it once on the day before, never just after midnight


def earnings_reminders_enabled() -> bool:
    """Off until the owner turns it on with EARNINGS_REMINDER_ACTIVE=1 (a new email is an owner decision). Even then
    only with mail v2 live and the old alert senders off: with LEGACY_ALERTS=1 the old sender
    (backend/radar_alerts.py) mails its own day-before earnings note, and a person would get both."""
    return (os.environ.get("EARNINGS_REMINDER_ACTIVE") == "1"
            and os.environ.get("MAIL_V2_ACTIVE") == "1" and os.environ.get("LEGACY_ALERTS") != "1")


def earnings_reminder_window(now: datetime) -> bool:
    """From 9am ET: the run reads the toggles and the calendar only then."""
    return now.astimezone(ET).hour >= EARNINGS_REMINDER_HOUR


def load_earnings_calendar(src: Source, now: datetime) -> dict[tuple[str, str], tuple[date, str]]:
    """Every report on tomorrow's date (ET), by (market, ticker), read once per run."""
    tomorrow = (now.astimezone(ET).date() + timedelta(days=1)).isoformat()
    out: dict[tuple[str, str], tuple[date, str]] = {}
    for _, d in src.query("tm_earnings_events", [("event_date", "==", tomorrow)], limit=5000,
                          select=["ticker", "event_date", "time", "market"]):
        ticker = str(d.get("ticker") or "").upper()
        try:
            day = date.fromisoformat(str(d.get("event_date"))[:10])
        except ValueError:
            continue
        if ticker:
            out[(str(d.get("market") or "US").upper(), ticker)] = (day, str(d.get("time") or "").lower())
    return out


def load_earnings_reminders(src: Source) -> dict[str, list[dict]]:
    """Every live "remind me the day before earnings" toggle, by account: kind earnings_24h, active, not paused.
    The stock page writes them (components/stock-report/alert-controls.tsx). The date comes from the earnings
    calendar at send time, not from the alert's metadata.event_date, which goes stale when a company moves its date."""
    out: dict[str, list[dict]] = {}
    filters = [("active", "==", True), ("triggered", "==", False), ("kind", "==", EARNINGS_REMINDER_KIND)]
    for path, a in src.query(PRICE_ALERTS, filters, limit=5000):
        if a.get("kind") != EARNINGS_REMINDER_KIND or a.get("paused_reason"):
            continue
        uid = str(a.get("uid") or "")
        if not uid or not (a.get("ticker") or a.get("instrument_id")):
            continue
        out.setdefault(uid, []).append({**a, "id": path.rsplit("/", 1)[-1]})
    return out


def earnings_reminder_due(stock, now: datetime) -> bool:
    """True on the calendar day before the stock's next report, from 9am ET."""
    et = now.astimezone(ET)
    day = getattr(stock, "earnings_date", None)
    return day is not None and et.hour >= EARNINGS_REMINDER_HOUR and (day - et.date()).days == 1


def build_earnings_reminder(stock, alert: dict, *, now: datetime | None = None,
                            unsubscribe_token: str | None = None) -> kit.Email | None:
    """"AAPL reports tomorrow after the close." and one card with today's price, with one button to the stock.
    None when the report is not tomorrow."""
    now = now or datetime.now(timezone.utc)
    if not earnings_reminder_due(stock, now):
        return None
    time = str(getattr(stock, "earnings_time", "") or "").lower()
    slot = {"bmo": " before the open", "amc": " after the close", "during": " during market hours"}.get(time, "")
    title = f"{stock.ticker} reports tomorrow{slot}"
    today = now.astimezone(ET).date()
    period = _day(stock.price_at.astimezone(ET).date().isoformat(), today) if stock.price_at else ""
    day = stock.earnings_date
    line = f"Earnings {day.strftime('%A')}, {day.strftime('%b')} {day.day}{slot}."
    doc = kit.Doc()
    doc.h1(title + ".")
    doc.cards([kit.Card(ticker=stock.ticker, name=stock.name, price=stock.price, move=stock.change_pct, period=period, line=line)])
    doc.button(f"Open {stock.ticker}", kit.stock_url(stock.ticker))
    return kit.render(doc, kind="earnings_reminder", category="alerts", subject=title, preheader=line,
                      unsubscribe_token=unsubscribe_token,
                      meta={"ticker": stock.ticker, "alert": str(alert.get("id") or ""), "event_date": day.isoformat()},
                      reason="You get this because you asked for a reminder before this stock reports.",
                      dateline="Earnings reminder")
