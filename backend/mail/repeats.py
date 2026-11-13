"""Find a figure said twice inside one email card (owner rule 1, Nov 13: no number twice in a card, row or
email block), and a stock carded twice in one email at the same price. Used by the mail tests and by
scripts/email-number-repeats.py, which audits a folder of rendered emails."""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser

from backend.mail.kit import _FIGURE


class _Cards(HTMLParser):
    """Collects the text of each stock card (the kit's grid cell, td.sbcol). Panels are left out: the day-by-day
    chart lists one figure per day, and two days can move the same."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool]] = []  # (tag, opens a block)
        self.blocks: list[list[str]] = []
        self.open: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class") or ""
        block = tag == "td" and "sbcol" in cls.split()
        if tag in ("br", "img", "meta", "hr", "input"):
            return
        self.stack.append((tag, block))
        if block:
            self.open.append([])

    def handle_startendtag(self, tag, attrs):
        return  # <img ... />, <br />: nothing to open or close

    def handle_endtag(self, tag):
        if tag in ("br", "img", "meta", "hr", "input"):
            return
        while self.stack:
            t, block = self.stack.pop()
            if block and self.open:
                self.blocks.append(self.open.pop())
            if t == tag:
                break

    def handle_data(self, data):
        if self.open:
            self.open[-1].append(data)


def figure_tokens(text: str) -> list[str]:
    """Each figure as "$50.77", "%1.8", or "%-1.8" / "%+1.8" for a move written with its sign."""
    out = []
    for m in _FIGURE.finditer(text):
        kind = "$" if m.group("money") else "%" if m.group("pct") else "x"
        raw = (m.group("money") or m.group("pct") or m.group("times")).replace(",", "")
        sign = m.group("sign")
        signed = ("-" if sign in "−-" else "+") if kind == "%" and sign else ""
        out.append(f"{kind}{signed}{float(raw):g}")
    return out


def _twice(tokens: list[str]) -> list[str]:
    """Figures said twice: the same token, or a move without a sign beside the same move with one. "+0.5%" for one
    day and "−0.5%" for another are two different moves."""
    bare = [t.replace("%+", "%").replace("%-", "%") for t in tokens]
    out = []
    for value in dict.fromkeys(bare):
        said = [t for t, b in zip(tokens, bare) if b == value]
        signs = {t for t in said if t != value}
        if len(said) > 1 and (len(signs) <= 1 or value in said):
            out.append(value)
    return out


def repeats_in(page: str) -> list[tuple[list[str], str]]:
    """Each card with a figure said twice in it, and each stock carded twice in one email at the same price
    (the second card repeats every figure of the first)."""
    p = _Cards()
    p.feed(page)
    found = []
    seen: set[tuple[str, str]] = set()
    for parts in p.blocks:
        text = re.sub(r"\s+", " ", html.unescape(" ".join(parts)).replace("\u00a0", " ")).strip()
        tokens = figure_tokens(text)
        twice = _twice(tokens)
        if twice:
            found.append((twice, text))
        price = next((tok for tok in tokens if tok.startswith("$")), "")
        key = (text.split(" ", 1)[0], price)
        if price and key in seen:
            found.append(([f"{key[0]} carded twice"], text))
        seen.add(key)
    return found
