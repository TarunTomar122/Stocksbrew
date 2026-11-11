"""Building blocks for stocksbrew email.

Every template builds a `Doc`, which keeps an HTML body and a plain-text
body in step, then wraps it with `render()`. Layout is table-based with
inline styles so Gmail, Apple Mail and Outlook all agree.

Rules the kit enforces so templates do not have to remember them:
- nothing under 13px
- one filled copper button per email (a second `button()` call raises)
- every number that is a move gets its sign and colour from `change()`
"""
from __future__ import annotations

import html
import os
from dataclasses import dataclass, field
from typing import Iterable
from urllib.parse import quote, urlencode

from backend.mail import theme as t

PROD_URL = "https://www.stocksbrew.online"


# Where readers can reach us; every email footer shows it.
CONTACT_EMAIL = os.environ.get("STOCKSBREW_CONTACT_EMAIL", "tomartarun2001@gmail.com")

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
    if value is None or abs(value) < 0.005:
        return t.MUTED
    return t.UP if value > 0 else t.DOWN


def change(value: float | None, *, digits: int = 1, size: int = t.TEXT_SM, weight: int = 600) -> str:
    return (
        f"<span style='color:{tone_color(value)};font-weight:{weight};font-size:{size}px;"
        f"font-variant-numeric:tabular-nums;white-space:nowrap'>{esc(pct(value, digits=digits))}</span>"
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
class Doc:
    parts: list[str] = field(default_factory=list)
    text: list[str] = field(default_factory=list)
    _buttons: int = 0

    # -- type
    def eyebrow(self, value: str) -> "Doc":
        self.parts.append(
            f"<p style='margin:0 0 10px;font-size:{t.TEXT_XS}px;line-height:1.4;font-weight:600;"
            f"letter-spacing:0.04em;text-transform:uppercase;color:{t.COPPER}'>{esc(value)}</p>"
        )
        self.text.append(value.upper())
        return self

    def h1(self, value: str) -> "Doc":
        self.parts.append(
            f"<h1 style='margin:0 0 12px;font-size:{t.TEXT_XL}px;line-height:1.25;font-weight:700;"
            f"letter-spacing:-0.02em;color:{t.INK}'>{esc(value)}</h1>"
        )
        self.text.append(value)
        self.text.append("=" * min(len(value), 60))
        return self

    def h2(self, value: str, *, aside: str | None = None) -> "Doc":
        aside_html = (
            f"<td align='right' style='font-size:{t.TEXT_XS}px;color:{t.MUTED};white-space:nowrap'>{esc(aside)}</td>"
            if aside
            else ""
        )
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:28px 0 10px'><tr>"
            f"<td style='font-size:{t.TEXT_MD}px;line-height:1.3;font-weight:700;color:{t.INK}'>{esc(value)}</td>"
            f"{aside_html}</tr></table>"
        )
        self.text.append("")
        self.text.append(f"{value}{'  (' + aside + ')' if aside else ''}")
        self.text.append("-" * min(len(value), 60))
        return self

    def p(self, value: str, *, muted: bool = False, size: int = t.TEXT_MD, gap: int = 14) -> "Doc":
        color = t.MUTED if muted else t.BODY
        self.parts.append(
            f"<p style='margin:0 0 {gap}px;font-size:{size}px;line-height:1.55;color:{color}'>{esc(value)}</p>"
        )
        self.text.append(value)
        return self

    def rich(self, html_value: str, text_value: str, *, size: int = t.TEXT_MD, muted: bool = False) -> "Doc":
        """A paragraph with trusted inline markup (already escaped by the caller)."""
        color = t.MUTED if muted else t.BODY
        self.parts.append(
            f"<p style='margin:0 0 14px;font-size:{size}px;line-height:1.55;color:{color}'>{html_value}</p>"
        )
        self.text.append(text_value)
        return self

    def bullets(self, items: Iterable[str]) -> "Doc":
        rows = []
        for item in items:
            rows.append(
                "<tr>"
                f"<td width='18' valign='top' style='padding:0 0 8px;font-size:{t.TEXT_MD}px;line-height:1.55;color:{t.COPPER}'>&#8226;</td>"
                f"<td style='padding:0 0 8px;font-size:{t.TEXT_MD}px;line-height:1.55;color:{t.BODY}'>{esc(item)}</td>"
                "</tr>"
            )
            self.text.append(f"- {item}")
        self.parts.append(
            f"<table role='presentation' cellpadding='0' cellspacing='0' style='margin:0 0 10px'>{''.join(rows)}</table>"
        )
        return self

    def steps(self, items: list[tuple[str, str, str]]) -> "Doc":
        """Numbered steps: (title, body, url)."""
        rows = []
        for i, (title, body, url) in enumerate(items, start=1):
            rows.append(
                "<tr>"
                f"<td width='40' valign='top' style='padding:0 0 18px'>"
                f"<div style='width:28px;height:28px;border-radius:14px;background:{t.COPPER_WASH};color:{t.COPPER};"
                f"font-size:{t.TEXT_SM}px;font-weight:700;line-height:28px;text-align:center'>{i}</div></td>"
                f"<td valign='top' style='padding:3px 0 18px'>"
                f"<a href='{esc(url)}' style='font-size:{t.TEXT_MD}px;font-weight:700;color:{t.INK};text-decoration:none'>{esc(title)}</a>"
                f"<div style='margin-top:3px;font-size:{t.TEXT_SM}px;line-height:1.5;color:{t.MUTED}'>{esc(body)}</div></td>"
                "</tr>"
            )
            self.text.append(f"{i}. {title}: {body} {url}")
        self.parts.append(
            f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:6px 0 4px'>{''.join(rows)}</table>"
        )
        return self

    # -- actions
    def button(self, label: str, url: str) -> "Doc":
        self._buttons += 1
        if self._buttons > 1:
            raise ValueError("one filled button per email; use link() for the rest")
        self.parts.append(
            "<table role='presentation' cellpadding='0' cellspacing='0' style='margin:22px 0 6px'><tr>"
            f"<td style='border-radius:{t.RADIUS_SM}px;background:{t.COPPER}'>"
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
            f"<a href='{esc(url)}' style='color:{t.COPPER};font-weight:600;text-decoration:none'>{esc(label)} &rarr;</a></p>"
        )
        self.text.append(f"{label}: {url}")
        return self

    # -- panels
    def note(self, value: str, *, tone: str = "well", title: str | None = None) -> "Doc":
        bg, fg = {
            "well": (t.WELL, t.BODY),
            "copper": (t.COPPER_WASH, t.INK),
            "caution": (t.CAUTION_WASH, t.INK),
        }.get(tone, (t.WELL, t.BODY))
        head = (
            f"<div style='margin:0 0 4px;font-size:{t.TEXT_SM}px;font-weight:700;color:{t.INK}'>{esc(title)}</div>"
            if title
            else ""
        )
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:16px 0'><tr>"
            f"<td style='padding:14px 16px;background:{bg};border-radius:{t.RADIUS_SM}px'>{head}"
            f"<div style='font-size:{t.TEXT_SM}px;line-height:1.55;color:{fg}'>{esc(value)}</div></td></tr></table>"
        )
        if title:
            self.text.append(f"[{title}]")
        self.text.append(value)
        return self

    def stats(self, items: list[tuple[str, str, str | None]]) -> "Doc":
        """Up to three figures in a row: (label, value, colour or None)."""
        cells = []
        width = int(100 / max(1, len(items)))
        for label, value, color in items[:3]:
            cells.append(
                f"<td width='{width}%' valign='top' style='padding:14px 14px;background:{t.WELL};border-radius:{t.RADIUS_SM}px'>"
                f"<div style='font-size:{t.TEXT_XS}px;color:{t.MUTED};line-height:1.3'>{esc(label)}</div>"
                f"<div style='margin-top:4px;font-size:{t.TEXT_LG}px;font-weight:700;color:{color or t.INK};"
                f"font-variant-numeric:tabular-nums;line-height:1.2'>{esc(value)}</div></td>"
            )
            self.text.append(f"{label}: {value}")
        spacer = "<td width='8' style='font-size:0'>&nbsp;</td>"
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:8px 0 6px'><tr>"
            f"{spacer.join(cells)}</tr></table>"
        )
        return self

    def divider(self) -> "Doc":
        self.parts.append(f"<div style='height:1px;background:{t.DIVIDER};margin:20px 0;font-size:0'>&nbsp;</div>")
        self.text.append("")
        return self

    def raw(self, html_value: str, text_value: str = "") -> "Doc":
        self.parts.append(html_value)
        if text_value:
            self.text.append(text_value)
        return self

    # -- stocks
    def stock(
        self,
        *,
        ticker: str,
        name: str = "",
        price: float | None = None,
        change_pct: float | None = None,
        tag: str | None = None,
        tag_tone: str = "well",
        headline: str = "",
        detail: str = "",
        source: str = "",
        levels: tuple[float | None, float | None] | None = None,
        link_label: str = "Open research",
    ) -> "Doc":
        url = stock_url(ticker)
        tag_bg, tag_fg = {
            "up": (t.UP_WASH, t.UP),
            "down": (t.DOWN_WASH, t.DOWN),
            "copper": (t.COPPER_WASH, t.COPPER),
            "caution": (t.CAUTION_WASH, t.CAUTION),
        }.get(tag_tone, (t.WELL, t.MUTED))
        tag_html = (
            f"<span style='display:inline-block;margin:0 0 8px;padding:3px 9px;border-radius:999px;background:{tag_bg};"
            f"color:{tag_fg};font-size:{t.TEXT_XS}px;font-weight:700;line-height:1.4'>{esc(tag)}</span><br/>"
            if tag
            else ""
        )
        price_html = ""
        if price is not None:
            price_html = (
                f"<div style='font-size:{t.TEXT_MD}px;font-weight:700;color:{t.INK};font-variant-numeric:tabular-nums'>{esc(money(price))}</div>"
                f"<div style='margin-top:2px'>{change(change_pct, size=t.TEXT_SM) if change_pct is not None else ''}</div>"
            )
        level_html = level_bar(price, levels[0], levels[1]) if levels and price is not None else ""
        body_html = ""
        if headline:
            body_html += f"<div style='margin-top:12px;font-size:{t.TEXT_MD}px;line-height:1.45;font-weight:700;color:{t.INK}'>{esc(headline)}</div>"
        if detail:
            body_html += f"<div style='margin-top:4px;font-size:{t.TEXT_SM}px;line-height:1.55;color:{t.BODY}'>{esc(detail)}</div>"
        foot_bits = []
        if source:
            foot_bits.append(f"<span style='color:{t.FAINT}'>{esc(source)}</span>")
        foot_bits.append(
            f"<a href='{esc(url)}' style='color:{t.COPPER};font-weight:600;text-decoration:none'>{esc(link_label)} &rarr;</a>"
        )
        foot = (
            f"<div style='margin-top:10px;font-size:{t.TEXT_XS}px;line-height:1.5'>"
            + " &nbsp;&middot;&nbsp; ".join(foot_bits)
            + "</div>"
        )
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
            f"style='margin:0 0 12px;border:1px solid {t.BORDER};border-radius:{t.RADIUS}px;background:{t.CARD}'><tr>"
            f"<td style='padding:16px 18px'>{tag_html}"
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>"
            f"<td width='40' valign='middle'><img src='{esc(logo_src(ticker))}' width='32' height='32' alt='' "
            f"style='display:block;width:32px;height:32px;border-radius:16px;border:1px solid {t.BORDER};background:#fff' /></td>"
            f"<td valign='middle' style='padding-left:4px'>"
            f"<a href='{esc(url)}' style='font-size:{t.TEXT_MD}px;font-weight:700;color:{t.INK};text-decoration:none'>{esc(ticker)}</a>"
            f"<div style='font-size:{t.TEXT_XS}px;color:{t.MUTED};line-height:1.35'>{esc(_short_name(name))}</div></td>"
            f"<td valign='middle' align='right'>{price_html}</td>"
            "</tr></table>"
            f"{body_html}{level_html}{foot}"
            "</td></tr></table>"
        )
        line = f"{ticker}"
        if price is not None:
            line += f"  {money(price)}"
        if change_pct is not None:
            line += f" ({pct(change_pct)})"
        if tag:
            line = f"[{tag}] {line}"
        self.text.append("")
        self.text.append(line)
        if headline:
            self.text.append(headline)
        if detail:
            self.text.append(detail)
        if levels and price is not None and (levels[0] or levels[1]) and levels_valid(levels[0], levels[1]):
            self.text.append(level_text(price, levels[0], levels[1]))
        if source:
            self.text.append(source)
        self.text.append(url)
        return self

    def movers(self, rows: list[tuple[str, str, float | None]], *, note: str | None = None) -> "Doc":
        """A compact ticker list: (ticker, short label, change %)."""
        trs = []
        for i, (ticker, label, chg) in enumerate(rows):
            border = f"border-top:1px solid {t.DIVIDER};" if i else ""
            trs.append(
                "<tr>"
                f"<td width='34' style='{border}padding:9px 0'><img src='{esc(logo_src(ticker))}' width='24' height='24' alt='' "
                f"style='display:block;width:24px;height:24px;border-radius:12px;border:1px solid {t.BORDER};background:#fff' /></td>"
                f"<td style='{border}padding:9px 12px 9px 0'><a href='{esc(stock_url(ticker))}' style='font-size:{t.TEXT_SM}px;font-weight:700;"
                f"color:{t.INK};text-decoration:none'>{esc(ticker)}</a>"
                f"<span style='font-size:{t.TEXT_XS}px;color:{t.MUTED}'>&nbsp;&nbsp;{esc(label)}</span></td>"
                f"<td align='right' style='{border}padding:9px 0;white-space:nowrap'>{change(chg)}</td>"
                "</tr>"
            )
            self.text.append(f"  {ticker:<6} {pct(chg):>8}  {label}")
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
            f"style='margin:0 0 8px;border:1px solid {t.BORDER};border-radius:{t.RADIUS}px;background:{t.CARD}'>"
            f"<tr><td style='padding:6px 16px'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'>{''.join(trs)}</table></td></tr></table>"
        )
        if note:
            self.p(note, muted=True, size=t.TEXT_XS)
        return self

    def calendar(self, rows: list[tuple[str, str, str]]) -> "Doc":
        """Upcoming dated items: (day label, ticker, what)."""
        trs = []
        for i, (day, ticker, what) in enumerate(rows):
            border = f"border-top:1px solid {t.DIVIDER};" if i else ""
            trs.append(
                "<tr>"
                f"<td width='92' style='{border}padding:10px 0;font-size:{t.TEXT_XS}px;font-weight:700;color:{t.COPPER};white-space:nowrap'>{esc(day)}</td>"
                f"<td style='{border}padding:10px 0;font-size:{t.TEXT_SM}px;color:{t.BODY}'>"
                + (f"<a href='{esc(stock_url(ticker))}' style='font-weight:700;color:{t.INK};text-decoration:none'>{esc(ticker)}</a>&nbsp; " if ticker else "")
                + f"{esc(what)}</td>"
                "</tr>"
            )
            self.text.append(f"  {day:<12} {ticker:<6} {what}" if ticker else f"  {day:<12} {what}")
        self.parts.append(
            "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
            f"style='margin:0 0 8px;border:1px solid {t.BORDER};border-radius:{t.RADIUS}px;background:{t.CARD}'>"
            f"<tr><td style='padding:4px 16px'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'>{''.join(trs)}</table></td></tr></table>"
        )
        return self

    def html_body(self) -> str:
        return "".join(self.parts)

    def text_body(self) -> str:
        return "\n".join(self.text).strip()


def _short_name(name: str) -> str:
    n = html.unescape(str(name or "")).strip()
    for suffix in (", Inc.", " Inc.", " Inc", " Corporation", " Corp.", " Corp", " Holdings", " Ltd.", " plc", " N.V."):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    return n[:40]


# ------------------------------------------------------------------ level bar

def _zone_range(price: float, add: float | None, trim: float | None) -> tuple[float, float]:
    points = [p for p in (price, add, trim) if p]
    lo, hi = min(points), max(points)
    pad = max((hi - lo) * 0.18, price * 0.04)
    return lo - pad, hi + pad


def level_bar(price: float | None, add: float | None, trim: float | None) -> str:
    """Add zone / hold / trim zone as a bar, with where the price sits now."""
    if price is None or (add is None and trim is None) or not levels_valid(add, trim):
        return ""
    lo, hi = _zone_range(price, add, trim)
    span = hi - lo or 1.0

    def at(v: float) -> int:
        return max(0, min(100, round((v - lo) / span * 100)))

    a = at(add) if add else 0
    b = at(trim) if trim else 100
    segs = []
    if a > 0:
        segs.append((a, t.ZONE_ADD))
    segs.append((max(1, b - a), t.ZONE_HOLD))
    if b < 100:
        segs.append((100 - b, t.ZONE_TRIM))
    bar = "".join(
        f"<td width='{w}%' style='height:6px;background:{c};font-size:0;line-height:0'>&nbsp;</td>" for w, c in segs
    )
    marker = at(price)
    # a 3px ink tick that sits on the bar, placed by a percentage spacer
    left = max(0, min(99, marker))
    tick = (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr>"
        + (f"<td width='{left}%' style='font-size:0;line-height:0'>&nbsp;</td>" if left else "")
        + f"<td width='3' style='width:3px;height:16px;background:{t.INK};font-size:0;line-height:0;border-radius:2px'>&nbsp;</td>"
        + "<td style='font-size:0;line-height:0'>&nbsp;</td></tr></table>"
    )
    add_label = f"Buy more below {money(add)}" if add else ""
    trim_label = f"Sell some above {money(trim)}" if trim else ""
    # a new call often sets its level at the close, so "at" the level is not "in" the zone
    if add and price < add * 0.998:
        add_label = "Below our buy-more price"
    elif add and price <= add * 1.002:
        add_label = "At our buy-more price"
    if trim and price > trim * 1.002:
        trim_label = "Above our sell-some price"
    elif trim and price >= trim * 0.998:
        trim_label = "At our sell-some price"
    return (
        f"<div style='margin-top:16px'>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-radius:3px;overflow:hidden'>"
        f"<tr>{bar}</tr></table>"
        f"<div style='margin-top:-11px'>{tick}</div>"
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin-top:6px'><tr>"
        f"<td style='font-size:{t.TEXT_XS}px;color:{t.UP};font-weight:600'>{esc(add_label)}</td>"
        f"<td align='center' style='font-size:{t.TEXT_XS}px;color:{t.INK};font-weight:700;white-space:nowrap'>Now {esc(money(price))}</td>"
        f"<td align='right' style='font-size:{t.TEXT_XS}px;color:{t.CAUTION};font-weight:600'>{esc(trim_label)}</td>"
        "</tr></table></div>"
    )


def levels_valid(add: float | None, trim: float | None) -> bool:
    """An add level at or above the trim level is bad data; don't draw it."""
    return not (add and trim and add >= trim)


def level_text(price: float, add: float | None, trim: float | None) -> str:
    if not levels_valid(add, trim):
        return ""
    bits = []
    if add:
        bits.append(f"add below {money(add)}")
    bits.append(f"now {money(price)}")
    if trim:
        bits.append(f"trim above {money(trim)}")
    return "Levels: " + ", ".join(bits)


# --------------------------------------------------------------------- shell

# zero-width filler after the preheader, so clients don't pull body text into the inbox preview
PREHEADER_PAD = "&#8199;&#65279;&#847;" * 60

CATEGORY_REASON = {
    "daily": "You get this on trading days when something happens in the stocks you track.",
    "weekly": "You get this recap every Saturday.",
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


def render(
    doc: Doc,
    *,
    kind: str,
    category: str,
    subject: str,
    preheader: str,
    unsubscribe_token: str | None = None,
    meta: dict | None = None,
) -> Email:
    reason = CATEGORY_REASON.get(category, CATEGORY_REASON["product"])
    unsub = unsubscribe_url(category, unsubscribe_token)
    label = {"daily": "the daily brief", "weekly": "the weekly recap", "alerts": "alert emails"}.get(category, "these emails")
    footer_html = (
        f"<p style='margin:0 0 6px;font-size:{t.TEXT_XS}px;line-height:1.6;color:{t.MUTED}'>{esc(reason)}</p>"
        f"<p style='margin:0 0 6px;font-size:{t.TEXT_XS}px;line-height:1.6;color:{t.MUTED}'>"
        f"<a href='{esc(settings_url())}' style='color:{t.MUTED};text-decoration:underline'>Email settings</a>"
        f" &nbsp;&middot;&nbsp; <a href='{esc(unsub)}' style='color:{t.MUTED};text-decoration:underline'>Stop {esc(label)}</a></p>"
        f"<p style='margin:0 0 6px;font-size:{t.TEXT_XS}px;line-height:1.6;color:{t.MUTED}'>Research to help you decide, not investment advice.</p>"
        f"<p style='margin:0;font-size:{t.TEXT_XS}px;line-height:1.6;color:{t.MUTED}'>stocksbrew &middot; "
        f"<a href='mailto:{esc(CONTACT_EMAIL)}' style='color:{t.MUTED};text-decoration:underline'>{esc(CONTACT_EMAIL)}</a></p>"
    )
    mark = f"{APP_URL}/email/mark.png"
    page = f"""<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>{esc(subject)}</title>
<style>
  body {{ margin:0; padding:0; -webkit-text-size-adjust:100%; }}
  a {{ color:{t.COPPER}; }}
  @media only screen and (max-width:620px) {{
    .sb-outer {{ padding:0 !important; }}
    .sb-card {{ border-radius:0 !important; border-left:0 !important; border-right:0 !important; }}
    .sb-pad {{ padding:24px 18px !important; }}
    .sb-head, .sb-foot {{ padding-left:18px !important; padding-right:18px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{t.PAGE};font-family:{t.FONT};color:{t.BODY}">
<div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;color:{t.PAGE}">{esc(preheader)}{PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{t.PAGE}">
<tr><td class="sb-outer" align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:{t.WIDTH}px">
    <tr><td class="sb-head" style="padding:0 4px 16px">
      <a href="{esc(app_url('/'))}" style="text-decoration:none">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="30" valign="middle"><img src="{esc(mark)}" width="22" height="22" alt="" style="display:block;width:22px;height:22px" /></td>
        <td valign="middle" style="font-family:{t.FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:{t.INK}">stocksbrew</td>
      </tr></table></a>
    </td></tr>
    <tr><td class="sb-card" style="background:{t.CARD};border:1px solid {t.BORDER};border-radius:{t.RADIUS + 4}px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td class="sb-pad" style="padding:32px 32px 30px;font-family:{t.FONT}">{doc.html_body()}</td>
      </tr></table>
    </td></tr>
    <tr><td class="sb-foot" style="padding:20px 4px 8px;font-family:{t.FONT}">{footer_html}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    text = (
        f"{doc.text_body()}\n\n--\n{reason}\nEmail settings: {settings_url()}\n"
        f"Stop {label}: {unsub}\nResearch to help you decide, not investment advice."
    )
    return Email(kind=kind, category=category, subject=subject, preheader=preheader, html=page, text=text, meta=meta or {})
