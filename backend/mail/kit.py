"""Building blocks for stocksbrew email.

Every template builds a `Doc`, which keeps an HTML body and a plain-text
body in step, then wraps it with `render()`. Layout is table-based with
inline styles so Gmail, Apple Mail and Outlook all agree; a small <style>
block only stacks side-by-side cards on phones and swaps colours in dark
mode, so an email still reads right where it is stripped.

Rules the kit enforces so templates do not have to remember them:
- nothing under 13px
- one filled copper button per email (a second `button()` call raises)
- every number that is a move gets its sign and colour from `change()`
- stock cards carry no per-card link text or icons: the card itself links
- calls are only ever Buy more, Keep or Sell some (`call_label()`)
- every stock is a card (`Card`): logo, ticker and company, price, a labelled move, one line
- a card says at most one line, of 15 words or fewer (`fits()`); a longer one is left out, never cut
- recent days are words ("yesterday", "Tuesday"), a date only beyond a week (`day_word()`)
"""
from __future__ import annotations

import html
import os
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Sequence
from urllib.parse import quote, urlencode

from backend.mail import theme as t

PROD_URL = "https://www.stocksbrew.online"


# Where readers can reach us; every email footer shows it.
CONTACT_EMAIL = os.environ.get("STOCKSBREW_CONTACT_EMAIL", "tomartarun2001@gmail.com")
# CAN-SPAM wants a postal address in commercial email. Set it once the owner has one (a PO box works).
POSTAL_ADDRESS = os.environ.get("STOCKSBREW_POSTAL_ADDRESS", "").strip()


def _app_base() -> str:
    """Links and images in a sent email must be public: never a localhost or http base."""
    explicit = os.environ.get("MAIL_APP_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    public = os.environ.get("NEXT_PUBLIC_APP_URL", "").strip()
    return public.rstrip("/") if public.startswith("https://") else PROD_URL


APP_URL = _app_base()


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def app_url(path: str = "/", **params: str) -> str:
    base = f"{APP_URL}{path if path.startswith('/') else '/' + path}"
    clean = {k: v for k, v in params.items() if v}
    return f"{base}?{urlencode(clean)}" if clean else base


def stock_url(ticker: str) -> str:
    return app_url(f"/stock/{quote(str(ticker).upper(), safe='')}")


def logo_src(ticker: str) -> str:
    return f"{APP_URL}/api/logo-proxy?ticker={quote(str(ticker).upper(), safe='')}&fallback=1"


# ----------------------------------------------------------------- formatting

def money(value: float | None, *, digits: int | None = None) -> str:
    if value is None:
        return "n/a"
    v = float(value)
    if digits is None:
        digits = 2 if abs(v) < 1000 else 0
    return f"${v:,.{digits}f}"


def money_pair(a: float, b: float) -> tuple[str, str]:
    """Two prices that must read as different: $1,410.60 vs $1,411.20, not $1,411 vs $1,411."""
    x, y = money(a), money(b)
    return (money(a, digits=2), money(b, digits=2)) if x == y and a != b else (x, y)


def verb(value: float | None) -> str:
    """"rose" or "fell", so a headline never reads "moved -36.2%"."""
    return "fell" if (value or 0) < 0 else "rose"


def pct(value: float | None, *, digits: int = 1, signed: bool = True) -> str:
    if value is None:
        return "n/a"
    # round first so a tiny move never prints as "−0.0%"
    v = round(float(value), digits) + 0.0
    if signed:
        return f"{'+' if v > 0 else '−' if v < 0 else ''}{abs(v):.{digits}f}%"
    return f"{abs(v):.{digits}f}%"


def tone_color(value: float | None) -> str:
    if value is None or round(value, 1) == 0:
        return t.MUTED
    return t.UP if value > 0 else t.DOWN


def _tone_class(value: float | None) -> str:
    if value is None or round(value, 1) == 0:
        return "sbm"
    return "sbu" if value > 0 else "sbd"


def change(value: float | None, *, digits: int = 1, size: int = t.TEXT_SM, weight: int = 600) -> str:
    return (
        f"<span class='{_tone_class(value)}' style='color:{tone_color(value)};font-weight:{weight};font-size:{size}px;"
        f"font-variant-numeric:tabular-nums;white-space:nowrap'>{esc(pct(value, digits=digits))}</span>"
    )


# ----------------------------------------------------------------- days

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _as_date(day: object) -> date | None:
    if isinstance(day, date):
        return day
    try:
        return date.fromisoformat(str(day or "")[:10])
    except ValueError:
        return None


def day_word(day: object, today: date) -> str:
    """A day the way a person says it: "today", "yesterday", "tomorrow", the weekday within a week either side,
    and "Nov 3" only further out (owner: "these dates like nov 11 is so weird ... say yesterday")."""
    d = _as_date(day)
    if d is None:
        return str(day or "")
    gap = (d - today).days
    if gap == 0:
        return "today"
    if gap == -1:
        return "yesterday"
    if gap == 1:
        return "tomorrow"
    if -7 < gap < 7:
        return _WEEKDAYS[d.weekday()]
    return d.strftime("%b %-d")


def close_word(day: object, today: date) -> str:
    """"Yesterday's close", "Monday's close", "Oct 30 close"."""
    word = day_word(day, today)
    if word in ("today", "yesterday", "tomorrow") or word in _WEEKDAYS:
        return f"{cap(word)}'s close"
    return f"{word} close"


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def fits(text: str, words: int = 15) -> bool:
    """A card line is one line of 15 words or fewer (owner rule 8); a longer sentence is dropped, never cut."""
    return bool(text) and word_count(text) <= words


def verdict(word: str, tone: str) -> str:
    """A short good-or-bad word on a soft tint, with an arrow so the colour is never the only signal
    (the app's <Verdict>). tone is "up", "down" or "flat"."""
    bg, fg, cls = {"up": (t.UP_WASH, t.UP, "sbpu"), "down": (t.DOWN_WASH, t.DOWN, "sbpd")}.get(tone, (t.WELL, t.BODY, "sbpk"))
    mark = {"up": "&#9650;", "down": "&#9660;"}.get(tone, "&#9675;")
    return (
        f"<span class='{cls}' style='display:inline-block;padding:3px 9px;border-radius:999px;background:{bg};color:{fg};"
        f"font-size:{t.TEXT_XS}px;font-weight:600;line-height:1.35;white-space:nowrap'>"
        f"{mark}&nbsp;{esc(word)}</span>"
    )


def plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def join_words(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])} and {items[-1]}"


def cap(value: str) -> str:
    return value[:1].upper() + value[1:] if value else value


# ----------------------------------------------------------------- calls

BUY, KEEP, SELL = "Buy more", "Keep", "Sell some"
_BULL = {"accumulate", "buy", "add"}
_BEAR = {"trim", "avoid", "sell", "reduce"}


def call_label(stance: str = "", text: str = "") -> str:
    """Our call in the only three words a reader sees: Buy more, Keep or Sell some."""
    s = (stance or "").strip().lower()
    if s in _BULL:
        return BUY
    if s in _BEAR:
        return SELL
    if s:
        return KEEP
    words = set(re.findall(r"[a-z]+", (text or "").lower()))
    if words & _BULL:
        return BUY
    if words & _BEAR:
        return SELL
    return KEEP if text else ""


def call_level(label: str, add: float | None, trim: float | None) -> float | None:
    """A call shows only its own price level: Buy more its buy-more price, Sell some its sell-some price."""
    if not levels_valid(add, trim):
        return None
    return add if label == BUY else trim if label == SELL else None


def call_pill_text(label: str, level: float | None) -> str:
    if not label:
        return ""
    if level and label == BUY:
        return f"{label} under {money(level)}"
    if level and label == SELL:
        return f"{label} over {money(level)}"
    return label


def levels_valid(add: float | None, trim: float | None) -> bool:
    """An add level at or above the trim level is bad data; don't use it."""
    return not (add and trim and add >= trim)


def level_phrase(price: float, level: float, side: str) -> str:
    """Where a close sits against one of our levels, in words.

    side is "add" or "trim". A new call often sets its level at the close, so within
    0.2% reads as "at" the level, never "under" or "over" it.
    """
    word = "buy-more" if side == "add" else "sell-some"
    a, b = money_pair(price, level)
    gap = (price - level) / level * 100 if level else 0.0
    if abs(gap) <= 0.2:
        return f"Closed at {a}, right at our {word} price"
    where = "under" if gap < 0 else "over"
    return f"Closed at {a}, {pct(abs(gap), signed=False)} {where} our {word} price of {b}"


# ------------------------------------------------------------ headline text

# Words that are only capitalised because a headline is in Title Case. Anything not
# here (company names, people, places, acronyms) keeps its capital.
_COMMON = set("""
a an the and or but nor for so yet of in on at to by from with without into onto over under up down off out as
after before since until while despite amid against about above below between through during per via than
is are was were be been being has have had do does did will would can could may might must should shall
its it this that these those their his her our your new more most less least all any some each every other
rises rise rose falls fall fell gains gain gained jumps jump jumped surges surge surged soars soar soared slides slide
slid drops drop dropped climbs climb climbed sinks sink sank tumbles tumble tumbled rallies rally rallied slips slip
slipped plunges plunge plunged extends extend extended edges edge edged hits hit hits reaches reach reached
stock stocks shares share price prices targets rating ratings upgrade upgrades upgraded downgrade
downgrades downgraded raises raise raised cuts cut lowers lower lowered boosts boost boosted beats beat misses miss
earnings revenue revenues sales profit profits loss losses quarter quarterly results guidance outlook forecast
deal deals agreement agreements contract contracts order orders partnership partners partner launches launch launched
announces announce announced reports report reported says say said sees see expects expect plans plan files filing
buys buy bought sells sell sold acquires acquire acquisition acquisitions merger stake investors investor analyst
analysts market markets record high low highs lows week weeks day days month months year years today record-high
billion million trillion percent amid strong weak higher lower big bigger first second third fourth top
growth demand supply data center centers chip chips maker makers deal approval approves approved wins win won
overshadows overshadow overshadowed hot cool cools cooled collaborate collaborates collaborated
reignite reignites reignited futures upcoming fold rival rivals compete competes competition push pushes warns warn faces face nears near tops top signs sign hires
names picks sets set adds add eyes eye bets bet backs back seeks seek gets get takes take makes make keeps keep
looks look why how what here there now just still again could amid fears fear concerns concern hopes hope
talks talk probe lawsuit fine fined news update updates move moves moved move higher lower shares
eases ease eased advances advance advanced spikes spike spiked revive revives revived trade trades trading
uncertainty financing beat-and-raise surprise surprises slump slumps slumped rebound rebounds rebounded
recovers recover recovered retreats retreat retreated stalls stall stalled tanks tank tanked pops pop popped
leaps leap leapt dips dip dipped skids skid skidded sheds shed rockets rocket rocketed sours sour soured
expands expand expanded slashes slash slashed hikes hike hiked trims trim trimmed boosts reiterates reiterated
initiates initiated coverage overweight underweight neutral outperform underperform bullish bearish buyback
dividend dividends offering stock-split split splits debt bond bonds notes loan loans layoffs jobs job cost costs
margin margins profit-taking selloff sell-off rout pressure pressured weighs weigh weighed lifts lift lifted
drives drive drove fuels fuel fueled sparks spark sparked hits signals signal warning warnings risk risks
strong stronger weaker soft softer upbeat downbeat solid mixed record-breaking surging sliding falling rising
climbing jumping soaring plunging tumbling sinking gaining losing allegedly fail fails failed provide
provides provided during amid ahead behind toward towards against within unveils unveil
unveiled opens open opened closes close closed rolls roll rolled delays delay delayed
premarket pre-market outpaces outpace outpaced investment investments board
""".split())


def recent_move(closes: Sequence[float], sessions: int = 20) -> str:
    """"Up 8.2% over the last 20 sessions": plain context for a card that has nothing more specific."""
    vals = [c for c in closes if c]
    if len(vals) <= sessions or not vals[-1 - sessions]:
        return ""
    chg = (vals[-1] - vals[-1 - sessions]) / vals[-1 - sessions] * 100
    if round(chg, 1) == 0:
        return f"Flat over the last {sessions} sessions."
    return f"{'Up' if chg > 0 else 'Down'} {pct(chg, signed=False)} over the last {sessions} sessions."


def is_title_case(title: str) -> bool:
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", title) if len(w) >= 4]
    if len(words) < 3:
        return False
    capped = sum(1 for w in words if w[0].isupper())
    return capped / len(words) >= 0.7


def sentence_case(title: str, hint: str = "") -> str:
    """'Microsoft Stock Falls After Anthropic Launches Claude Sheets' -> 'Microsoft stock falls after Anthropic launches Claude Sheets'.

    A word is lowered when it is an everyday headline word or when ``hint`` (the
    article summary, written in sentence case) uses it in lower case. A word the
    summary capitalises mid-sentence, or one we don't know, keeps its capital,
    so names stay right.
    """
    if not is_title_case(title):
        return title
    lower_in_hint = set(re.findall(r"\b[a-z][a-z'’-]*\b", hint))
    capital_in_hint = {w for w in re.findall(r"(?<=[a-z,;] )[A-Z][A-Za-z'’-]*", hint)}

    def fix(core: str) -> str:
        if "-" in core:
            return "-".join(fix(part) for part in core.split("-"))
        if not core or not core[0].isupper() or core.isupper() or any(ch.isupper() for ch in core[1:]):
            return core
        if core in capital_in_hint:
            return core
        low = core.lower()
        return low if low in _COMMON or low in lower_in_hint else core

    out = []
    for i, word in enumerate(title.split(" ")):
        core = re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", word)
        if i and core:
            word = word.replace(core, fix(core), 1)
        out.append(word)
    return " ".join(out)


# ----------------------------------------------------------------------- doc

@dataclass
class Email:
    kind: str
    category: str  # daily | weekly | alerts | product
    subject: str
    preheader: str
    html: str
    text: str
    meta: dict = field(default_factory=dict)


@dataclass
class Card:
    """One stock: logo, ticker and company name, its price, its move with the period it covers, our call, one line.

    The council's shared card (Nov 12): the move is always labelled ("−1.7% yesterday", "+31.9% this week"), and a
    second labelled move can sit under it. The card says ONE line (owner rule 8): the first of `line`, `why`,
    `fallback` and `meta` that is set, not shared with another card in the grid, and 15 words or fewer.
    """
    ticker: str
    name: str = ""  # the company, said once under the ticker
    price: float | None = None
    move: float | None = None  # percent
    period: str = ""  # what the move covers: "today", "yesterday", "Tuesday", "this week", "since your last visit"
    second: tuple[float, str] | None = None  # another labelled move, e.g. (−0.2, "yesterday") under a week's move
    call: str = ""  # Buy more / Keep / Sell some with its own level, or "Buy more → Keep" for a change
    tag: str = ""  # a short verdict beside the call, e.g. "3.4x a normal day", toned by the move's direction
    line: str = ""  # what happened, or why
    why: str = ""  # the next choice for the one line
    meta: str = ""  # the last choice for the one line
    fallback: str = ""  # used when the lines above are shared with another card or too long
    own: bool = False  # the line is this stock's own fact (a report date) and stays even when another card says the same
    link: bool = True


@dataclass
class Doc:
    parts: list[str] = field(default_factory=list)
    text: list[str] = field(default_factory=list)
    _buttons: int = 0

    # -- type
    def h1(self, value: str) -> "Doc":
        self.parts.append(
            f"<h1 class='sbi' style='margin:0 0 10px;font-size:24px;line-height:1.28;font-weight:700;"
            f"letter-spacing:-0.015em;color:{t.INK}'>{esc(value)}</h1>"
        )
        self.text.append(value)
        self.text.append("=" * min(len(value), 60))
        return self

    def h2(self, value: str, *, aside: str | None = None) -> "Doc":
        aside_html = (
            f"<td class='sbm sbaside' align='right' valign='bottom' style='padding-left:12px;font-size:{t.TEXT_XS}px;color:{t.MUTED}'>{esc(aside)}</td>"
            if aside
            else ""
        )
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:26px 0 10px'><tr>"
            f"<td class='sbi sbh2' valign='bottom' style='font-size:{t.TEXT_MD}px;line-height:1.3;font-weight:700;color:{t.INK}'>{esc(value)}</td>"
            f"{aside_html}</tr></table>"
        )
        self.text.append("")
        self.text.append(f"{value}{'  (' + aside + ')' if aside else ''}")
        self.text.append("-" * min(len(value), 60))
        return self

    def p(self, value: str, *, muted: bool = False, size: int = t.TEXT_MD, gap: int = 14) -> "Doc":
        color, cls = (t.MUTED, "sbm") if muted else (t.BODY, "sbt")
        self.parts.append(
            f"<p class='{cls}' style='margin:0 0 {gap}px;font-size:{size}px;line-height:1.55;color:{color}'>{esc(value)}</p>"
        )
        self.text.append(value)
        return self

    def rich(self, html_value: str, text_value: str, *, size: int = t.TEXT_MD, muted: bool = False) -> "Doc":
        """A paragraph with trusted inline markup (already escaped by the caller)."""
        color, cls = (t.MUTED, "sbm") if muted else (t.BODY, "sbt")
        self.parts.append(
            f"<p class='{cls}' style='margin:0 0 14px;font-size:{size}px;line-height:1.55;color:{color}'>{html_value}</p>"
        )
        self.text.append(text_value)
        return self

    def button(self, label: str, url: str) -> "Doc":
        self._buttons += 1
        if self._buttons > 1:
            raise ValueError("one filled button per email; use link() for the rest")
        self.parts.append(
            "<table role='presentation' cellpadding='0' cellspacing='0' style='margin:24px 0 4px'><tr>"
            f"<td bgcolor='{t.COPPER}' style='border-radius:{t.RADIUS_SM}px;background:{t.COPPER}'>"
            f"<a href='{esc(url)}' style='display:inline-block;padding:13px 22px;font-size:{t.TEXT_MD}px;font-weight:700;"
            f"color:{t.COPPER_FG};text-decoration:none;border-radius:{t.RADIUS_SM}px'>{esc(label)}</a>"
            "</td></tr></table>"
        )
        self.text.append("")
        self.text.append(f"{label}: {url}")
        return self

    def link(self, label: str, url: str) -> "Doc":
        self.parts.append(
            f"<p style='margin:10px 0 0;font-size:{t.TEXT_SM}px'>"
            f"<a class='sbk' href='{esc(url)}' style='color:{t.COPPER};font-weight:600;text-decoration:underline'>{esc(label)}</a></p>"
        )
        self.text.append(f"{label}: {url}")
        return self

    # -- panels
    def note(self, value: str, *, tone: str = "well", title: str | None = None, link: tuple[str, str] | None = None) -> "Doc":
        """A quiet panel. ``link`` (label, url) sits inside it as a plain underlined link."""
        bg, cls = {"copper": (t.COPPER_WASH, "sbw"), "caution": (t.CAUTION_WASH, "sbw")}.get(tone, (t.WELL, "sbw"))
        head = (
            f"<div class='sbi' style='margin:0 0 4px;font-size:{t.TEXT_SM}px;font-weight:700;color:{t.INK}'>{esc(title)}</div>"
            if title
            else ""
        )
        link_html = (
            f" <a class='sbk' href='{esc(link[1])}' style='color:{t.COPPER};font-weight:600;text-decoration:underline'>{esc(link[0])}</a>"
            if link
            else ""
        )
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:16px 0'><tr>"
            f"<td class='{cls}' bgcolor='{bg}' style='padding:14px 16px;background:{bg};border-radius:{t.RADIUS_SM}px'>{head}"
            f"<div class='sbt' style='font-size:{t.TEXT_SM}px;line-height:1.55;color:{t.BODY}'>{esc(value)}{link_html}</div></td></tr></table>"
        )
        if title:
            self.text.append("")
            self.text.append(f"[{title}]")
        self.text.append(value)
        if link:
            self.text.append(f"{link[0]}: {link[1]}")
        return self

    def divider(self) -> "Doc":
        self.parts.append(f"<div class='sbl' style='height:1px;background:{t.DIVIDER};margin:20px 0;font-size:0'>&nbsp;</div>")
        self.text.append("")
        return self

    def raw(self, html_value: str, text_value: str = "") -> "Doc":
        self.parts.append(html_value)
        if text_value:
            self.text.append(text_value)
        return self

    # -- stocks
    def cards(self, cards: list[Card]) -> "Doc":
        """Stock cards, equal height, every row full: two side by side for an even count, one per row for an odd
        count (no card stretched over a row, no empty slot beside it), and one per row on a phone."""
        # a sentence shared by several cards says nothing about any one of them (owner rule 1): drop it from all,
        # whether it sits in the bold line or under it, and let the card's own fallback fill in
        said = [x for c in cards for x in dict.fromkeys((c.line, c.why, c.fallback, c.meta)) if x]
        shared = {x for x in said if said.count(x) > 1}
        # one line per card: the first choice that is its own and fits in 15 words
        cards = [Card(**{**c.__dict__, "why": "", "meta": "", "fallback": "",
                         "line": next((x for x in (c.line, c.why, c.fallback, c.meta)
                                       if x and (c.own and x == c.line or x not in shared) and fits(x)), "")})
                 for c in cards]
        cells = []
        for c in cards:
            cells.append(_card_html(c))
            self.text.append("")
            moves = "; ".join(f"{pct(v)} {p}".strip() for v, p in ((c.move, c.period), c.second or (None, "")) if v is not None)
            head = " ".join(x for x in (c.ticker, short_name(c.name, c.ticker), money(c.price) if c.price is not None else "",
                                         moves) if x)
            self.text.append(head + (f"  [{c.call}]" if c.call else "") + (f"  ({c.tag})" if c.tag else ""))
            if c.line:
                self.text.append(c.line)
            if c.link:
                self.text.append(stock_url(c.ticker))
        if cells:
            self.parts.append(_grid(cells, cols=2 if len(cells) % 2 == 0 else 1, margin="0 0 4px"))
        return self

    def days(self, labels: list[str], yours: list[float], market: list[float] | None = None) -> "Doc":
        """Day-by-day columns either side of zero, with the numbers written under each."""
        if not labels or len(labels) != len(yours):
            return self
        vals = yours + [v for v in (market or []) if v is not None]
        top = max((abs(v) for v in vals), default=1.0) or 1.0
        h = 34
        cols = []
        for label, v in zip(labels, yours):
            px = max(2, round(abs(v) / top * h))
            color = t.UP if v > 0 else t.DOWN if v < 0 else t.BAR_FLAT
            bar = f"<div style='width:26px;height:{px}px;background:{color};border-radius:2px;margin:0 auto;font-size:0;line-height:0'>&nbsp;</div>"
            cols.append(
                "<td align='center' valign='bottom' style='padding:0 2px'>"
                "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>"
                f"<tr><td height='{h}' valign='bottom' align='center' style='height:{h}px;font-size:0'>{bar if v > 0 else '&nbsp;'}</td></tr>"
                f"<tr><td height='1' bgcolor='{t.BORDER}' style='height:1px;background:{t.BORDER};font-size:0;line-height:0'>&nbsp;</td></tr>"
                f"<tr><td height='{h}' valign='top' align='center' style='height:{h}px;font-size:0'>{bar if v <= 0 else '&nbsp;'}</td></tr>"
                "</table></td>"
            )
        head = "".join(
            f"<td align='center' class='sbm' style='padding:0 2px 4px;font-size:{t.TEXT_XS}px;color:{t.MUTED};font-weight:600'>{esc(l)}</td>"
            for l in labels
        )
        you_row = "".join(f"<td align='center' style='padding:6px 2px 0'>{change(v, size=t.TEXT_XS)}</td>" for v in yours)
        mkt_row = ""
        if market and len(market) == len(labels):
            mkt_row = (
                f"<tr><td class='sbm' style='padding:4px 6px 0 0;font-size:{t.TEXT_XS}px;color:{t.MUTED};white-space:nowrap'>S&amp;P 500</td>"
                + "".join(
                    f"<td align='center' class='sbm' style='padding:4px 2px 0;font-size:{t.TEXT_XS}px;color:{t.MUTED};font-variant-numeric:tabular-nums'>{esc(pct(v))}</td>"
                    for v in market
                )
                + "</tr>"
            )
        body = (
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'>"
            f"<tr><td width='64'>&nbsp;</td>{head}</tr>"
            f"<tr><td>&nbsp;</td>{''.join(cols)}</tr>"
            f"<tr><td class='sbi' style='padding:6px 6px 0 0;font-size:{t.TEXT_XS}px;font-weight:700;color:{t.INK};white-space:nowrap'>Yours</td>{you_row}</tr>"
            f"{mkt_row}</table>"
        )
        self.parts.append(_panel(body, pad="14px 16px"))
        self.text.append("  " + "  ".join(f"{l} {pct(v)}" for l, v in zip(labels, yours)))
        if market and len(market) == len(labels):
            self.text.append("  S&P 500: " + "  ".join(f"{l} {pct(v)}" for l, v in zip(labels, market)))
        return self

    def html_body(self) -> str:
        return "".join(self.parts)

    def text_body(self) -> str:
        return "\n".join(self.text).strip()


def _panel(inner: str, *, pad: str) -> str:
    return (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' class='sbc' "
        f"style='margin:0 0 8px;border:1px solid {t.BORDER};border-radius:{t.RADIUS}px;background:{t.CARD}'>"
        f"<tr><td style='padding:{pad}'>{inner}</td></tr></table>"
    )


def _grid(cells: list[str], *, cols: int, margin: str = "0", pad: str = "12px 14px") -> str:
    """Cells side by side in rows of ``cols``. Each cell is itself the card (border and background on the
    td), so cards in a row always share one height. A short last row keeps its cell widths: no card is
    stretched over a row. On phones cards stack one per row (`.sbcol`) and the gutters (`.sbgap`) go away.
    """
    cols = max(1, cols)
    bg, cls = t.CARD, "sbc"
    border = f"border:1px solid {t.BORDER};"
    gap = t.COL_GAP
    span_total = cols * 2 - 1  # cards plus the gutters between them
    gap_td = f"<td class='sbgap' width='{gap}' style='width:{gap}px;font-size:0;line-height:0'>&nbsp;</td>"
    rows = []
    for start in range(0, len(cells), cols):
        chunk = cells[start:start + cols]
        tds = []
        for j, cell in enumerate(chunk):
            tds.append(
                f"<td class='sbcol {cls}' width='{round(100 / cols)}%' valign='top' bgcolor='{bg}' "
                f"style='{border}border-radius:{t.RADIUS}px;background:{bg};padding:{pad}'>{cell}</td>"
            )
            if j < cols - 1:
                tds.append(gap_td)
        for k in range(len(chunk), cols):
            tds.append(f"<td class='sbgap' width='{round(100 / cols)}%' style='font-size:0'>&nbsp;</td>")
            if k < cols - 1:
                tds.append(gap_td)
        if rows:
            rows.append(f"<tr class='sbgap'><td colspan='{span_total}' height='{gap}' style='height:{gap}px;font-size:0;line-height:0'>&nbsp;</td></tr>")
        rows.append(f"<tr>{''.join(tds)}</tr>")
    return (
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:{margin};table-layout:fixed;"
        f"border-collapse:separate'>{''.join(rows)}</table>"
    )


def _pill(label: str) -> str:
    base = label.split("→")[-1].strip().split(" under ")[0].split(" over ")[0]
    bg, fg, cls = {
        BUY: (t.UP_WASH, t.UP, "sbpu"),
        SELL: (t.CAUTION_WASH, t.CAUTION, "sbpc"),
    }.get(base, (t.WELL, t.BODY, "sbpk"))
    return (
        f"<span class='{cls}' style='display:inline-block;padding:3px 9px;border-radius:999px;background:{bg};color:{fg};"
        f"font-size:{t.TEXT_XS}px;font-weight:700;line-height:1.35;white-space:nowrap'>{esc(label)}</span>"
    )


def _move_html(value: float | None, period: str) -> str:
    """"−2.3% yesterday": the move and the period it covers, kept together on one line."""
    if value is None:
        return ""
    label = f"<span class='sbm' style='font-weight:400;color:{t.MUTED}'>&nbsp;{esc(period)}</span>" if period else ""
    return (f"<span class='{_tone_class(value)}' style='display:inline-block;margin-right:10px;font-size:{t.TEXT_XS}px;font-weight:600;"
            f"color:{tone_color(value)};font-variant-numeric:tabular-nums;white-space:nowrap'>{esc(pct(value))}{label}</span>")


def _card_html(c: Card) -> str:
    """Ticker and company on top, then the price with its labelled moves on the line under it, so a card two to a
    row (about 240px inside) wraps instead of running into its neighbour."""
    url = stock_url(c.ticker)
    tick = (
        f"<a href='{esc(url)}' class='sbi' style='font-size:{t.TEXT_MD}px;font-weight:700;color:{t.INK};text-decoration:none'>{esc(c.ticker)}</a>"
        if c.link else f"<span class='sbi' style='font-size:{t.TEXT_MD}px;font-weight:700;color:{t.INK}'>{esc(c.ticker)}</span>"
    )
    name = short_name(c.name, c.ticker)
    name_html = (f"<div class='sbm' style='margin-top:1px;font-size:{t.TEXT_XS}px;line-height:1.3;color:{t.MUTED}'>{esc(name)}</div>"
                 if name else "")
    price = (f"<span class='sbi' style='display:inline-block;margin-right:10px;font-size:18px;line-height:1.3;font-weight:700;color:{t.INK};"
             f"font-variant-numeric:tabular-nums;white-space:nowrap'>{esc(money(c.price))}</span>") if c.price is not None else ""
    moves = _move_html(c.move, c.period) + (_move_html(c.second[0], c.second[1]) if c.second else "")
    head = (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>"
        f"<td width='36' valign='top' style='width:36px;min-width:36px;padding-top:2px'><img src='{esc(logo_src(c.ticker))}' width='28' "
        f"height='28' alt='{esc(c.ticker)}' style='display:block;width:28px;height:28px;border-radius:14px;background:#ffffff;"
        f"font-size:{t.TEXT_XS}px' /></td>"
        f"<td valign='top'>{tick}{name_html}</td></tr></table>"
    )
    body = f"<div style='margin-top:6px;line-height:1.5'>{price}{moves}</div>" if price or moves else ""
    tone = "up" if (c.move or 0) > 0 else "down" if (c.move or 0) < 0 else "flat"
    chips = " ".join(x for x in (_pill(c.call) if c.call else "", verdict(c.tag, tone) if c.tag else "") if x)
    if chips:
        body += f"<div style='margin-top:6px;line-height:1.9'>{chips}</div>"
    if c.line:
        body += f"<div class='sbi' style='margin-top:6px;font-size:{t.TEXT_SM}px;line-height:1.45;font-weight:600;color:{t.INK}'>{esc(c.line)}</div>"
    return head + body


def short_name(name: str, ticker: str = "", limit: int = 24) -> str:
    """"Space Exploration Technologies Corp." -> "Space Exploration": whole words that fit beside a price on a
    phone, never cut mid-word, and nothing when it only repeats the ticker."""
    n = _short_name(name)
    if not n or n.upper() == ticker.upper():
        return ""
    if len(n) > limit:
        cut = n[:limit].rsplit(" ", 1)[0].rstrip(",&-")
        n = cut if len(cut) >= 4 else n[:limit]
    return n


def _short_name(name: str) -> str:
    n = html.unescape(str(name or "")).strip()
    for suffix in (", Inc.", " Inc.", " Inc", " Corporation", " Corp.", " Corp", " Holdings", " Ltd.", " plc", " N.V."):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    return n[:40]


# --------------------------------------------------------------------- shell

# zero-width filler after the preheader, so clients don't pull body text into the inbox preview
PREHEADER_PAD = "&#8199;&#65279;&#847;" * 60

CATEGORY_REASON = {
    "daily": "You get this on trading days when something happens in the stocks you track.",
    "weekly": "You get this memo every Saturday.",
    "alerts": "You get this because you set up alerts on stocksbrew.",
    "product": "You get this because you have a stocksbrew account.",
}


def settings_url() -> str:
    # the account page has no tabs; #notifications is the Emails section
    return app_url("/profile") + "#notifications"


def plan_url() -> str:
    return app_url("/profile") + "#plan"


def unsubscribe_url(category: str, token: str | None = None) -> str:
    return app_url("/email/unsubscribe", c=category, t=token or "")


_DARK_CSS = f"""
  @media (prefers-color-scheme: dark) {{
    .sbp, .sbp-bg {{ background:{t.D_PAGE} !important; }}
    .sbc {{ background:{t.D_CARD} !important; border-color:{t.D_BORDER} !important; }}
    .sbc td {{ border-color:{t.D_BORDER} !important; }}
    .sbmark {{ background:{t.PAGE} !important; }}
    .sbw {{ background:{t.D_WELL} !important; }}
    .sbi {{ color:{t.D_INK} !important; }}
    .sbt {{ color:{t.D_BODY} !important; }}
    .sbm {{ color:{t.D_MUTED} !important; }}
    .sbk {{ color:{t.D_COPPER} !important; }}
    .sbu {{ color:{t.D_UP} !important; }}
    .sbd {{ color:{t.D_DOWN} !important; }}
    .sbl {{ background:{t.D_BORDER} !important; }}
    .sbpu {{ background:{t.D_UP_WASH} !important; color:{t.D_UP} !important; }}
    .sbpc {{ background:{t.D_CAUTION_WASH} !important; color:{t.D_CAUTION} !important; }}
    .sbpd {{ background:{t.D_DOWN_WASH} !important; color:{t.D_DOWN} !important; }}
    .sbpk {{ background:{t.D_WELL} !important; color:{t.D_BODY} !important; }}
  }}"""


def render(
    doc: Doc,
    *,
    kind: str,
    category: str,
    subject: str,
    preheader: str,
    unsubscribe_token: str | None = None,
    meta: dict | None = None,
    reason: str | None = None,
    dateline: str = "",
) -> Email:
    """Wrap a doc in the shell. ``reason`` replaces the category's "why you get this" line.

    ``dateline`` sits beside the logo (the date the email is about), so no small label
    has to sit above the headline.
    """
    reason = reason or CATEGORY_REASON.get(category, CATEGORY_REASON["product"])
    unsub = unsubscribe_url(category, unsubscribe_token)
    label = {"daily": "the daily brief", "weekly": "the weekly memo", "alerts": "alert emails"}.get(category, "these emails")
    small = f"margin:0 0 6px;font-size:{t.TEXT_XS}px;line-height:1.6;color:{t.MUTED}"
    footer_html = (
        f"<p class='sbm' style='{small}'>{esc(reason)} "
        f"<a class='sbm' href='{esc(settings_url())}' style='color:{t.MUTED};text-decoration:underline'>Email settings</a>"
        f" &middot; <a class='sbm' href='{esc(unsub)}' style='color:{t.MUTED};text-decoration:underline'>Stop {esc(label)}</a></p>"
        f"<p class='sbm' style='{small}'>Research to help you decide, not investment advice. stocksbrew &middot; "
        f"<a class='sbm' href='mailto:{esc(CONTACT_EMAIL)}' style='color:{t.MUTED};text-decoration:underline'>{esc(CONTACT_EMAIL)}</a>"
        + (f" &middot; {esc(POSTAL_ADDRESS)}" if POSTAL_ADDRESS else "")
        + "</p>"
    )
    mark = f"{APP_URL}/email/mark.png"
    date_html = (
        f"<td align='right' valign='middle' class='sbm' style='font-family:{t.FONT};font-size:{t.TEXT_XS}px;color:{t.MUTED};white-space:nowrap'>{esc(dateline)}</td>"
        if dateline else ""
    )
    page = f"""<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>{esc(subject)}</title>
<style>
  body {{ margin:0; padding:0; -webkit-text-size-adjust:100%; }}
  a {{ color:{t.COPPER}; }}
  @media only screen and (max-width:620px) {{
    .sb-outer {{ padding:0 !important; }}
    .sb-card {{ border-radius:0 !important; border-left:0 !important; border-right:0 !important; }}
    .sb-pad {{ padding:22px 16px !important; }}
    .sb-head, .sb-foot {{ padding-left:16px !important; padding-right:16px !important; }}
    .sbcol {{ display:block !important; width:100% !important; box-sizing:border-box; margin:0 0 10px !important; }}
    .sbgap {{ display:none !important; }}
    .sbh2, .sbaside {{ display:block !important; width:100% !important; text-align:left !important; }}
    .sbaside {{ padding:2px 0 0 !important; }}
  }}{_DARK_CSS}
</style>
</head>
<body class="sbp" style="margin:0;padding:0;background:{t.PAGE};font-family:{t.FONT};color:{t.BODY}">
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;color:{t.PAGE}">{esc(preheader)}{PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sbp-bg" bgcolor="{t.PAGE}" style="background:{t.PAGE}">
<tr><td class="sb-outer" align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:{t.WIDTH}px">
    <tr><td class="sb-head" style="padding:0 4px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle"><a href="{esc(app_url('/'))}" style="text-decoration:none">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="32" valign="middle"><img class="sbmark" src="{esc(mark)}" width="22" height="22" alt="" style="display:block;width:22px;height:22px;padding:2px;border-radius:7px" /></td>
          <td valign="middle" class="sbi" style="font-family:{t.FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:{t.INK}">stocksbrew</td>
        </tr></table></a></td>
        {date_html}
      </tr></table>
    </td></tr>
    <tr><td class="sb-card sbc" bgcolor="{t.CARD}" style="background:{t.CARD};border:1px solid {t.BORDER};border-radius:{t.RADIUS + 4}px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td class="sb-pad" style="padding:28px 28px 28px;font-family:{t.FONT}">{doc.html_body()}</td>
      </tr></table>
    </td></tr>
    <tr><td class="sb-foot" style="padding:18px 4px 8px;font-family:{t.FONT}">{footer_html}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    text = (
        (f"{dateline}\n\n" if dateline else "")
        + f"{doc.text_body()}\n\n--\n{reason}\nEmail settings: {settings_url()}\n"
        f"Stop {label}: {unsub}\nResearch to help you decide, not investment advice. stocksbrew · {CONTACT_EMAIL}"
        + (f"\n{POSTAL_ADDRESS}" if POSTAL_ADDRESS else "")
    )
    return Email(kind=kind, category=category, subject=subject, preheader=preheader, html=page, text=text, meta=meta or {})
