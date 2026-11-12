"""Alert emails: what your agent jobs found, bundled.

Price alerts you set by hand still go out one by one from backend/price_alerts.py
and obey the same email_alerts_enabled switch.

Runs that land within the bundling window go out as one email. Each
agent gets a section headed by its name and the close it read ("Nov 11
close"), and each stock one row: logo, ticker and name, its close and the
move into it, and one short line (the level of our call it reached, or when
it reports). No row carries a date of its own unless it is from an earlier
session, and a stock whose price stopped updating is left out.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.mail import theme as t_
from backend.mail.data import ET, Person, parse_ts
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

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@dataclass
class Row:
    """One stock in a section: what the email shows for it, and the sentence that says it."""
    ticker: str
    kind: str  # "zone", "move", "report" or "other"
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


def _quote_reports(rows: list[Row], quotes: dict) -> None:
    """A stock that reports soon gets its close and that day's move from the stored daily closes, on the same
    session as the moves beside it (or its latest close in a section of reports only). Nothing when we have none."""
    prices = [r.at for r in rows if r.kind in ("zone", "move") and r.at]
    newest = max(prices) if prices else ""
    for r in rows:
        s = quotes.get(r.ticker)
        if r.kind != "report" or s is None or len(s.closes) < 2:
            continue
        i = len(s.dates) - 1
        while i > 0 and newest and s.dates[i] > newest:
            i -= 1
        if i < 1 or (newest and s.dates[i] != newest) or not s.closes[i - 1]:
            continue
        r.close, r.change, r.quote_at = s.closes[i], (s.closes[i] / s.closes[i - 1] - 1) * 100, s.dates[i]


def _is_price(f: Finding) -> bool:
    return f.kind in ("move", "level") or (not f.kind and f.source == PRICE_SOURCE)


def _is_report(f: Finding) -> bool:
    return f.kind == "earnings" or (not f.kind and f.source == "Earnings calendar")


def _date(iso: str) -> date | None:
    try:
        return date.fromisoformat(iso[:10])
    except ValueError:
        return None


# NYSE full-day closures, for when the stored closes do not reach a run's day (lib/market-session.ts has the rule)
_NYSE_CLOSED = {
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
    "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
    "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24", "2027-12-31",
}


def _session_before(day: str, sessions: list[str]) -> str:
    """The trading day before `day`: from the stored closes when they reach it, else the weekday before."""
    earlier = [d for d in sessions if d < day]
    if earlier and max(sessions) >= day:
        return max(earlier)
    d = _date(day)
    if d is None:
        return ""
    d -= timedelta(days=1)
    while d.weekday() >= 5 or d.isoformat() in _NYSE_CLOSED:
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
    when = "today" if gap == 0 else "tomorrow" if gap == 1 else _WEEKDAYS[on.weekday()] if 1 < gap < 7 else f"on {_day(f.at)}"
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
            return Row(ticker=t, kind="zone", at=f.at, close=close, change=change, zone=zone, level=level,
                       line=kit.cap(where), sentence=f"{t} {move}, {where}", span=span, price=shown)
        # "…in a day, about four times a normal day": the measured scale is the row's line
        scale = re.match(r"in a day, (.+)$", rest.rstrip("."))
        move = f"{kit.verb(change)} {kit.pct(change, signed=False)}" if change is not None else ""
        sentence = f"{t} {move}{' to ' + kit.money(close) if close is not None and move else ''}{' over five sessions' if span else ''}" if move else _tidy(f.headline)
        return Row(ticker=t, kind="move", at=f.at, close=close, change=change,
                   line=kit.cap(scale.group(1)) if scale else "", sentence=sentence, span=span)
    return Row(ticker=t, kind="other", at=f.at, line=_tidy(_short(f)), sentence=_tidy(f.headline))


_RANK = {"zone": 0, "move": 1, "report": 2, "other": 3}


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
        if r.ticker and r.kind in ("zone", "move"):
            if r.ticker in by_ticker:
                continue
            by_ticker[r.ticker] = r
        rows.append(r)
    for r in sorted(reports, key=lambda x: (x.at, x.ticker)):
        price = by_ticker.get(r.ticker)
        if price and not price.report:
            price.report = r.report
            price.line = f"{price.line}, {r.report[:1].lower()}{r.report[1:]}" if price.line else r.report
            continue
        rows.append(r)
    order = {id(r): i for i, r in enumerate(rows)}
    return sorted(rows, key=lambda r: (_RANK[r.kind], -abs(r.change or 0) if r.kind in ("zone", "move") else 0,
                                       r.at if r.kind == "report" else "", order[id(r)]))


def _short_name(name: str, ticker: str) -> str:
    n = kit._short_name(name)
    if not n or n.upper() == ticker:
        return ""
    # a name that fits beside the ticker on a phone: whole words, no "…"
    if len(n) > 26:
        cut = n[:26].rsplit(" ", 1)[0].rstrip(",&-")
        n = cut if len(cut) >= 4 else n[:26]
    return n


def _rows_html(rows: list[Row], names: dict[str, str], newest: str) -> tuple[str, list[str]]:
    """Stock rows as one table: logo, ticker and name over the short line, and on the right the close over the move.
    Each cell links to the stock, so the whole row is the link (an <a> cannot wrap a table row in email)."""
    trs, text = [], []
    for i, r in enumerate(rows):
        border = f"border-top:1px solid {t_.DIVIDER};" if i else ""
        url = kit.stock_url(r.ticker) if r.ticker else ""
        line = r.line
        # a close from an earlier session than the section's says its day; no other row carries a date
        closed = r.at if r.kind in ("zone", "move") else r.quote_at
        if newest and closed and closed < newest:
            line = f"Closed {_day(closed)}" + (f", {line[:1].lower()}{line[1:]}" if line else "")
        link = (lambda inner: f"<a href='{kit.esc(url)}' style='text-decoration:none;color:{t_.INK}'>{inner}</a>") if url else (lambda inner: inner)
        logo = (link(f"<img src='{kit.esc(kit.logo_src(r.ticker))}' width='28' height='28' alt='' "
                     f"style='display:block;width:28px;height:28px;border-radius:14px;background:#ffffff' />") if r.ticker else "")
        name = names.get(r.ticker, "")
        head = link(
            f"<span class='sbi' style='font-size:{t_.TEXT_MD}px;font-weight:700;color:{t_.INK}'>{kit.esc(r.ticker)}</span>"
            + (f"&nbsp;&nbsp;<span class='sbm' style='font-size:{t_.TEXT_XS}px;color:{t_.MUTED}'>{kit.esc(name)}</span>" if name else "")
        ) if r.ticker else ""
        tone = "sbk" if r.kind == "zone" else "sbt"
        color = t_.COPPER if r.kind == "zone" else t_.BODY
        weight = 600 if r.kind == "zone" else 400
        sub = (f"<div class='{tone}' style='margin-top:2px;font-size:{t_.TEXT_SM}px;line-height:1.45;font-weight:{weight};color:{color}'>"
               f"{kit.esc(line)}</div>") if line else ""
        figure = ""
        if r.close is not None or r.change is not None:
            figure = link(
                (f"<div class='sbi' style='font-size:{t_.TEXT_MD}px;font-weight:700;color:{t_.INK};font-variant-numeric:tabular-nums'>{kit.esc(r.price or kit.money(r.close))}</div>"
                 if r.close is not None else "")
                + (f"<div style='margin-top:2px'>{kit.change(r.change)}</div>" if r.change is not None else "")
            )
        trs.append(
            "<tr>"
            f"<td width='40' valign='top' style='{border}padding:12px 0'>{logo}</td>"
            # no close to show: the name and its line take the whole width
            + (f"<td valign='top' style='{border}padding:12px 10px 12px 0'>{head}{sub}</td>"
               f"<td valign='top' align='right' style='{border}padding:12px 0;white-space:nowrap'>{figure}</td>"
               if figure else f"<td valign='top' colspan='2' style='{border}padding:12px 0'>{head}{sub}</td>")
            + "</tr>"
        )
        fig = " ".join(x for x in ((r.price or kit.money(r.close)) if r.close is not None else "", kit.pct(r.change) if r.change is not None else "") if x)
        text.append(f"  {r.ticker:<6} {fig:>16}  {line}".rstrip() if r.ticker else f"  {line}")
    html_ = kit._panel(f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>{''.join(trs)}</table>", pad="2px 16px")
    return html_, text


def _names_list(tickers: list[str], max_: int = 4) -> str:
    if len(tickers) <= max_:
        return kit.join_words(tickers)
    return f"{', '.join(tickers[:max_ - 1])} and {len(tickers) - max_ + 1} more"


def _headline(rows: list[Row], first: list[Row]) -> str:
    """The email's one headline: stocks that reached a level of our call first, then a batch of moves, then the top row."""
    zones = [r for r in rows if r.kind == "zone"]
    if len(zones) == 1:
        return zones[0].sentence + "."
    if zones:
        parts = []
        for zone, verb_, word in (("add", "fell", "buy-more"), ("trim", "rose", "sell-some")):
            names = [r.ticker for r in zones if r.zone == zone]
            if names:
                parts.append(f"{_names_list(names)} {verb_} to {'its' if len(names) == 1 else 'their'} {word} level{'s' if len(names) > 1 else ''}")
        return kit.cap(" and ".join(parts)) + "."
    moves = [r for r in first if r.kind == "move" and r.change is not None]
    if len(moves) >= 3 and not any(r.span for r in moves):
        top = max(moves, key=lambda r: abs(r.change or 0))
        ups, downs = all((r.change or 0) > 0 for r in moves), all((r.change or 0) < 0 for r in moves)
        floor = math.floor(min(abs(r.change or 0) for r in moves))  # "9% or more" must hold for every stock listed
        verb_ = "rose" if ups else "fell" if downs else "moved"
        day = _day(top.at) if top.at else ""
        return (f"{len(moves)} of your stocks {verb_} {floor}% or more{' on ' + day if day else ''}, led by "
                f"{top.ticker} at {kit.pct(top.change)}.")
    lead = first[0] if first else rows[0]
    return kit.cap(lead.sentence.rstrip(".")) + "."


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
    names = {s.ticker: _short_name(s.name, s.ticker) for s in person.stocks}
    quotes = {s.ticker: s for s in person.stocks}
    jobs: dict[str, list[Finding]] = {}
    for f in findings:
        jobs.setdefault(_OLD_DEFAULT_NAMES.get(f.job_name, f.job_name), []).append(f)

    # each agent's stocks as rows; a stock's move already shown under one agent is not shown again under another
    sections: list[tuple[str, list[Finding], list[Row]]] = []
    for job, items in jobs.items():
        tabled = any(_is_price(f) or _is_report(f) or f.kind == "mover" for f in items)
        sections.append((job, items, _section_rows(items, today) if tabled else []))
    # the agent with a stock at a level of our call first, then the one with the biggest move
    sections.sort(key=lambda s: (0 if any(r.kind == "zone" for r in s[2]) else 1 if s[2] else 2,
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
    first_job, first_items, first_rows = kept[0]
    h1 = _headline(all_rows, first_rows) if all_rows else kit.cap(first_items[0].headline.rstrip(".")) + "."
    doc.h1(_tidy(h1))
    others = kept[1:]
    if others:
        # say what else is in the email, by name, instead of a count
        also = "; ".join(f"{kit.join_words([r.ticker for r in rows][:4]) or kit.join_words([f.ticker for f in items if f.ticker][:4]) or kit.plural(len(items), 'finding')} "
                         f"from “{j}”" for j, items, rows in others)
        doc.p(f"Also in here: {also}.", muted=True, size=kit.t.TEXT_SM)
    elif n == 1:
        doc.p(f"Found by your agent “{first_job}”.", muted=True, size=kit.t.TEXT_SM)

    for job, items, rows in kept:
        if rows:
            prices = [r.at for r in rows if r.kind in ("zone", "move") and r.at] or [r.quote_at for r in rows if r.quote_at]
            newest = max(prices) if prices else ""
            span = any(r.span for r in rows)
            # the run's close, said once for the section, so no row needs a date
            aside = (f"Five sessions to {_day(newest)}" if span else f"{_day(newest)} close") if newest else None
            doc.h2(job, aside=aside)
            html_, text = _rows_html(rows[:MAX_LISTED], names, newest)
            doc.raw(html_, "\n".join(text))
            if len(rows) > MAX_LISTED:
                doc.p(f"Plus {len(rows) - MAX_LISTED} more in the app.", muted=True, size=kit.t.TEXT_SM)
            continue
        _other_section(doc, job, items, by_ticker)

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


def _other_section(doc: kit.Doc, job: str, items: list[Finding], by_ticker: dict) -> None:
    """Filings, trades and news: a few as cards with our call, more as one line each."""
    srcs = sorted({f.source for f in items if f.source})
    doc.h2(job, aside=", ".join(srcs[:2]) or None)
    shorts = [_short(f) for f in items]
    with_detail = [f for f in items if f.ticker and f.detail]
    if len(items) <= 4 and with_detail:
        cards = []
        for f in items:
            s = by_ticker.get(f.ticker or "")
            if not f.ticker:
                doc.note(f.detail, title=f.headline)
                continue
            label = kit.call_label(s.stance, s.call_text) if s else ""
            cards.append(kit.Card(
                ticker=f.ticker,
                call=kit.call_pill_text(label, kit.call_level(label, s.add_below, s.trim_above)) if s else "",
                line=_short(f),
                why=f.detail,
            ))
        doc.cards(cards)
    else:
        doc.rows([(f.ticker or "", short if f.ticker else f.headline, "") for f, short in zip(items[:MAX_LISTED], shorts)])
    if len(items) > MAX_LISTED:
        doc.p(f"Plus {len(items) - MAX_LISTED} more in the app.", muted=True, size=kit.t.TEXT_SM)


def _day(iso: str) -> str:
    """2026-11-12 -> Nov 12, the way dates read everywhere else in the emails."""
    try:
        return date.fromisoformat(iso[:10]).strftime("%b %-d")
    except ValueError:
        return iso


def bundle_since(last_sent_at: datetime | None, now: datetime | None = None) -> datetime:
    """Findings newer than the last alert email, and never older than a day."""
    now = now or datetime.now(timezone.utc)
    floor = now - timedelta(days=1)
    return max(last_sent_at, floor) if last_sent_at else floor
