"""Read the numbers out of an earnings release (8-K exhibit 99.1), by rules.

Everything here is a pure function over the release text, so it is tested on
real filings saved under ``backend/tests/fixtures/earnings_day/``. Nothing is
model-written: a figure is kept only when a rule found it in the release, and
each one carries the line it came from so the page can quote its source.

* ``html_to_text``: the exhibit as plain lines; a table row becomes
  ``label | cell | cell`` with stray ``$``, ``%`` and ``)`` cells folded in.
* ``extract_revenue`` / ``extract_eps``: this quarter's figure and the same
  quarter a year earlier, from a statement table whose column headers prove
  which period each column is, or from a sentence in the release.
* ``extract_guidance``: outlook items (metric, period, range, the previous
  range when the release states it) and the direction of each change.
* ``extract_quotes``: what management said, verbatim, with the speaker.
* ``fiscal_period``: "Q3 2026" from the release's own words.

Standard library only.
"""

from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser
from statistics import median
from typing import Any

# -- text --------------------------------------------------------------------

_BLOCK_TAGS = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "ul", "ol"}
_JOIN_RIGHT = {"$", "(", "($", "$(", "US$"}
_JOIN_LEFT = {")", "%", ")%", "%)", "pts", "bps"}


def _clean_cell(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").replace("​", "").split())


def normalize_cells(cells: list[str]) -> list[str]:
    """Fold ``$ | 1,234`` into ``$1,234`` and ``(0.14 | )`` into ``(0.14)``; drop empties."""
    out: list[str] = []
    pending = ""
    for raw in cells:
        cell = _clean_cell(raw)
        if not cell:
            continue
        if cell in _JOIN_RIGHT:
            pending += cell
            continue
        if cell in _JOIN_LEFT and out:
            out[-1] = out[-1] + cell
            continue
        out.append(pending + cell if pending else cell)
        pending = ""
    if pending and out:
        out[-1] = out[-1] + pending
    return out


class _TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.cell: list[str] = []
        self.row: list[str] | None = None
        self.in_cell = False
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "head", "title"):
            self.skip += 1
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []
            self.in_cell = True
        elif tag in _BLOCK_TAGS and self.row is None:
            self.out.append("\n")
        elif tag == "br" and self.in_cell:
            self.cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "head", "title"):
            self.skip = max(0, self.skip - 1)
        elif tag in ("td", "th") and self.row is not None:
            self.row.append("".join(self.cell))
            self.cell = []
            self.in_cell = False
        elif tag == "tr" and self.row is not None:
            cells = normalize_cells(self.row)
            if cells:
                self.out.append("\n" + " | ".join(cells) + "\n")
            self.row = None
        elif tag in _BLOCK_TAGS and self.row is None:
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        if self.row is not None:
            self.cell.append(data)
        else:
            self.out.append(data)


def html_to_text(raw: str) -> str:
    """The exhibit as plain text lines. Tables become ``a | b | c`` rows."""
    parser = _TextParser()
    parser.feed(raw or "")
    parser.close()
    text = "".join(parser.out)
    text = html_lib.unescape(text).replace("\xa0", " ").replace("​", "")
    lines = [" ".join(line.split()) for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


# -- numbers -----------------------------------------------------------------

_SCALES = {"thousand": 1e3, "thousands": 1e3, "million": 1e6, "millions": 1e6, "billion": 1e9, "billions": 1e9, "m": 1e6, "mm": 1e6, "bn": 1e9, "b": 1e9, "k": 1e3}


def parse_number(cell: str) -> float | None:
    """``$1,234.5`` -> 1234.5, ``(0.14)`` -> -0.14, ``—`` -> None."""
    text = (cell or "").strip()
    if not text or text in {"—", "–", "-", "n/a", "N/A", "NM", "nm", "*"}:
        return None
    negative = text.startswith("(") or text.startswith("-") or text.startswith("$(") or text.startswith("($") or text.startswith("−")
    cleaned = re.sub(r"[^0-9.]", "", text)
    if not cleaned or cleaned.count(".") > 1 or cleaned == ".":
        return None
    if not re.fullmatch(r"[\s$(\-−]*[\d,]+(?:\.\d+)?[\s)%]*", text.replace("US$", "$")):
        return None
    value = float(cleaned)
    return -value if negative else value


def table_scale(context: list[str]) -> float | None:
    """The unit a statement table is in, from the lines above it."""
    for line in reversed(context):
        low = line.lower()
        if re.search(r"in thousands|\(thousands|\$\s*000s?\b|\(000s?\)|in \$?000s", low):
            return 1e3
        if re.search(r"in millions|\(millions|\$\s*in millions|\$m\b|amounts in millions|millions of (?:u\.s\. )?dollars", low):
            return 1e6
        if re.search(r"in billions|\(billions", low):
            return 1e9
    return None


def fmt_money(value: float | None) -> str:
    """1.88049e8 -> "$188.0 million", 1.497e9 -> "$1.50 billion"."""
    if value is None:
        return ""
    sign = "-" if value < 0 else ""
    amount = abs(value)
    if amount >= 1e9:
        return f"{sign}${amount / 1e9:.2f} billion"
    if amount >= 1e6:
        return f"{sign}${amount / 1e6:.1f} million"
    return f"{sign}${amount:,.0f}"


def fmt_eps(value: float | None) -> str:
    if value is None:
        return ""
    return f"-${abs(value):.2f}" if value < 0 else f"${value:.2f}"


# -- periods -----------------------------------------------------------------

_ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4}


def fiscal_period(text: str, fiscal_date_ending: str = "") -> dict[str, Any]:
    """The quarter the release reports, in its own words when it says so.

    Looks at the opening lines ("Reports Results for Fiscal Second Quarter
    2027", "Third Quarter 2026 Financial Results", "Q3 FY26"). Falls back to
    the calendar quarter of the fiscal period end from the earnings calendar.
    """
    head = "\n".join(text.splitlines()[:40])
    patterns = [
        r"\b(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]+quarter(?:\s+of)?(?:\s+fiscal(?:\s+year)?)?\s+(\d{4})",
        r"\bfiscal(?:\s+year)?\s+(\d{4})\s+(first|second|third|fourth)\s+quarter",
        r"\bfiscal\s+(first|second|third|fourth|1st|2nd|3rd|4th)[\s-]+quarter(?:\s+of)?\s+(?:fiscal\s+)?(\d{4})",
        r"\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+fiscal\s+quarter(?:\s+of)?\s+(?:fiscal\s+)?(\d{4})",
        r"\bQ([1-4])\s*(?:FY\s*)?'?(\d{4}|\d{2})\b",
        r"\b(\d{4})\s+(first|second|third|fourth)\s+quarter",
    ]
    for pattern in patterns:
        match = re.search(pattern, head, flags=re.IGNORECASE)
        if not match:
            continue
        groups = [g for g in match.groups() if g]
        quarter = year = None
        for group in groups:
            low = group.lower()
            if low in _ORDINALS:
                quarter = _ORDINALS[low]
            elif re.fullmatch(r"[1-4]", group) and quarter is None and pattern.startswith(r"\bQ"):
                quarter = int(group)
            elif re.fullmatch(r"\d{4}", group):
                year = int(group)
            elif re.fullmatch(r"\d{2}", group):
                year = 2000 + int(group)
        if quarter and year and 2000 <= year <= 2100:
            context = head[max(0, match.start() - 12) : match.end()].lower()
            fiscal = "fiscal" in context or re.search(r"\bfy", context) is not None
            label = f"fiscal Q{quarter} {year}" if fiscal else f"Q{quarter} {year}"
            return {"quarter": quarter, "year": year, "label": label, "fiscal": fiscal, "from": "release"}
    match = re.fullmatch(r"(\d{4})-(\d{2})-\d{2}", fiscal_date_ending or "")
    if match:
        year, month = int(match.group(1)), int(match.group(2))
        quarter = (month - 1) // 3 + 1
        return {"quarter": quarter, "year": year, "label": f"Q{quarter} {year}", "fiscal": False, "from": "calendar"}
    return {"quarter": None, "year": None, "label": "", "fiscal": False, "from": None}


# -- statement tables --------------------------------------------------------

_YEAR = re.compile(r"\b(20\d{2})\b")
_QUARTER_HEAD = re.compile(r"three months|quarter ended|quarters ended|13 weeks|thirteen weeks|twelve weeks|12 weeks|fourteen weeks|14 weeks|\bq[1-4]\b", re.IGNORECASE)
_LONG_HEAD = re.compile(r"nine months|six months|twelve months ended|year ended|years ended|year to date|year-to-date|ytd|fiscal year ended|39 weeks|26 weeks|52 weeks|53 weeks", re.IGNORECASE)


def _split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.split(" | ")] if " | " in line else [line.strip()]


def _numeric_cells(cells: list[str]) -> list[float | None]:
    return [parse_number(cell) for cell in cells]


_HEADER_CELL = re.compile(r"^(?:20\d{2}|%|% ?change|\$ ?change|change|variance|increase|\(decrease\)|increase ?\(decrease\)|% ?inc(?:rease)?\.?(?: ?\(dec(?:rease)?\.?\))?|y/y|yoy|% ?growth)$", re.IGNORECASE)


def _column_years(lines: list[str], index: int, period_year: int | None, numeric_count: int | None = None) -> tuple[int, int] | None:
    """Which year the first two number columns of row ``index`` belong to.

    A row only counts as (this quarter, same quarter last year) when the
    header above it says so: a quarter heading ("Three Months Ended") and a
    year row whose first two years are this year and the year before, with
    one header cell per number in the row. Tables that run quarter by
    quarter, put the quarter next to a nine-month column of the same year, or
    interleave adjustment columns are refused.
    """
    for back in range(1, 46):
        at = index - back
        if at < 0:
            break
        line = lines[at]
        cells = _split_row(line)
        if len(cells) == 1 and len(line) > 140:
            return None  # back in the prose: this row has no header of its own
        years = [int(y) for cell in cells for y in _YEAR.findall(cell) if len(cell) <= 60]
        year_row = len(cells) > 1 and all(_HEADER_CELL.match(cell.strip()) for cell in cells if cell.strip())
        if not year_row:
            if len(years) == 1 and len(cells) > 1 and _QUARTER_HEAD.search(cells[0]):
                # "Three Months Ended September 30, 2026 | Nine Months Ended September 30, 2026": one period per table.
                return None
            if len(years) >= 2 and len(cells) > 1 and all(_YEAR.search(cell) for cell in cells[1:] if cell.strip()) and _QUARTER_HEAD.search(cells[0]):
                pass  # "Three Months Ended | 2026 | 2025" style header with the label in the first cell
            else:
                continue
        if len(years) < 2:
            continue
        first, second = years[0], years[1]
        if abs(first - second) != 1:
            return None
        if numeric_count is not None:
            header_cells = [cell for cell in cells if _HEADER_CELL.match(cell.strip())]
            if len(header_cells) != numeric_count:
                return None
        window = " ".join(lines[max(0, at - 3) : at + 1])
        first_head = _QUARTER_HEAD.search(window)
        if not first_head:
            return None
        long_head = _LONG_HEAD.search(window)
        if long_head and long_head.start() < first_head.start():
            return None
        if period_year and first != period_year and second != period_year:
            return None
        return (first, second)
    return None


_REVENUE_LABEL = re.compile(
    r"^(?:total\s+)?(?:net\s+|operating\s+|gaap\s+)?(?:revenues?|net\s+sales|sales|revenues?,\s*net|net\s+revenues?|total\s+net\s+revenues?|total\s+revenues?\s+and\s+other\s+income)(?:\s*\(\w{1,3}\))*:?$",
    re.IGNORECASE,
)


def _strip_footnotes(label: str) -> str:
    return re.sub(r"(?:\s*\((?:\d|[a-z]|\*)\))+$", "", label.strip()).strip(" :")


def _table_figure(
    lines: list[str],
    label_re: re.Pattern[str],
    *,
    period_year: int | None,
    per_share: bool,
    context_re: re.Pattern[str] | None = None,
) -> dict[str, Any] | None:
    for index, line in enumerate(lines):
        cells = _split_row(line)
        if len(cells) < 3:
            continue
        label = _strip_footnotes(cells[0])
        if not label_re.match(label):
            continue
        if context_re is not None:
            above = " ".join(lines[max(0, index - 3) : index])
            if not context_re.search(above + " " + cells[0]):
                continue
        numeric = [cell for cell in cells[1:] if parse_number(cell) is not None or cell.strip() in {"—", "–", "-"}]
        values = _numeric_cells(numeric)
        if len(values) < 2 or values[0] is None or values[1] is None:
            continue
        years = _column_years(lines, index, period_year, len(numeric))
        if not years:
            continue
        current, prior = (values[0], values[1]) if years[0] > years[1] else (values[1], values[0])
        if per_share:
            if abs(current) >= 1000 or abs(prior) >= 1000:
                continue
            scale = 1.0
        else:
            scale = table_scale(lines[max(0, index - 30) : index])
            if scale is None:
                continue
        return {
            "value": round(current * scale, 4),
            "prior": round(prior * scale, 4),
            "quote": line[:300],
            "method": "table",
            "label": label,
        }
    return None


# -- sentences ---------------------------------------------------------------

_GUIDANCE_WORDS = re.compile(
    r"\b(?:expect\w*|guidance|outlook|forecast\w*|anticipat\w*|project\w*|target\w*|range of|will be|to be in)\b", re.IGNORECASE
)
_OTHER_PERIOD = re.compile(
    r"\b(?:nine months|six months|first half|year[- ]to[- ]date|ytd|full[- ]year|fiscal year|twelve months|trailing|annual)\b", re.IGNORECASE
)
_COMPARE = re.compile(
    r"\b(?:compared\s+(?:to|with)|as compared to|versus|vs\.?|against\s+\$|(?:up |down )?from(?=\s+(?:\(?\$|the\s+(?:same|prior|year)|a\s+year|last\s+year|\w+\s+in\s+the\s+(?:same|prior)|[\w\s-]{0,30}\b(?:prior|previous|last|year-ago)\b)))",
    re.IGNORECASE,
)


def sentences(text: str) -> list[str]:
    """Plain sentences, table rows left out."""
    out: list[str] = []
    for line in text.splitlines():
        if " | " in line:
            continue
        line = line.strip().lstrip("•◦▪-– ").strip()
        if not line:
            continue
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"(])", line)
        out.extend(part.strip() for part in parts if part.strip())
    return out


_MONEY = r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|m|b|k)?\b"


def _money(match: re.Match[str]) -> float:
    """The amount and scale are the last two groups of any pattern built on ``_MONEY``."""
    count = match.re.groups
    value = float(match.group(count - 1).replace(",", ""))
    scale = _SCALES.get((match.group(count) or "").lower(), 1.0)
    return value * scale


def _money_scale_word(match: re.Match[str]) -> str:
    return (match.group(match.re.groups) or "").lower()


_REVENUE_SENTENCE = re.compile(
    r"(?:^|[\s:(•])(?:(?:total|net|gaap|consolidated|quarterly|q[1-4])\s+)*(?:revenues?|net\s+sales|sales)\b(?P<mid>[^.;$]{0,90}?)" + _MONEY,
    re.IGNORECASE,
)


def extract_revenue(text: str, *, period_year: int | None = None) -> dict[str, Any] | None:
    """This quarter's total revenue and the year-earlier figure, in dollars."""
    lines = text.splitlines()
    table = _table_figure(lines, _REVENUE_LABEL, period_year=period_year, per_share=False)
    from_text = None
    for sentence in sentences(text):
        if _GUIDANCE_WORDS.search(sentence) or len(sentence) > 600:
            continue
        match = _REVENUE_SENTENCE.search(sentence)
        if not match:
            continue
        mid = match.group("mid") or ""
        lead = sentence[: match.start()].lower()
        # What comes before the revenue words. The match opens on the separator before them, or on the sentence's
        # start (then nothing is before them: "Revenue was $188.0 million" must not read "R" as a word before it).
        before = sentence[: match.start() + 1] if match.start() > 0 or sentence[:1] in " :(•" else ""
        # "operating income of $61.0 million, or 12.0% of sales and ... $90.0 million": a ratio, not the sales figure.
        if re.search(r"(?:%|\bpercent)\s+of\s*$", before, re.IGNORECASE):
            continue
        # "Subscription revenue", "United States Revenue", segment lines: only total revenue counts.
        word_before = re.findall(r"([A-Za-z]+)\s*$", before)
        if word_before and word_before[-1].lower() not in {"total", "net", "gaap", "consolidated", "quarterly", "the", "of", "and", "reported", "with", "q1", "q2", "q3", "q4", "highlights"}:
            if not re.search(r"(?:^|[\s:(•])(?:total|net|gaap|consolidated)\s", sentence[max(0, match.start() - 12) : match.start() + 12], re.I):
                continue
        if re.search(r"\b(?:approximately|about|roughly|nearly|almost|over|more than)\b", mid, re.IGNORECASE):
            continue
        if _OTHER_PERIOD.search(mid) or _OTHER_PERIOD.search(lead[-60:]):
            continue
        if re.search(r"\b(?:segment|recurring|subscription|product|service|organic|backlog|bookings|per\b)", mid, re.IGNORECASE):
            continue
        value = _money(match)
        if value < 1e5:
            continue
        rest = sentence[match.end() :]
        prior = None
        compare = _COMPARE.search(rest)
        if compare:
            prior_match = re.search(_MONEY, rest[compare.end() : compare.end() + 80], re.IGNORECASE)
            if prior_match:
                prior = _money(prior_match)
                # "increased 11% to $188.0 million compared to $169.9 million": a prior in the same unit as the value.
                if not _money_scale_word(prior_match) and _money_scale_word(match):
                    prior *= _SCALES.get(_money_scale_word(match), 1.0)
        from_text = {"value": value, "prior": prior, "quote": sentence[:300], "method": "text", "label": "Revenue"}
        break
    return _reconcile(table, from_text, tolerance=0.01)


def _reconcile(table: dict[str, Any] | None, from_text: dict[str, Any] | None, *, tolerance: float) -> dict[str, Any] | None:
    """Table and sentence agree: keep the table's precision, note both. Disagree: the table wins."""
    if table and from_text:
        value, other = table["value"], from_text["value"]
        agree = abs(value - other) <= max(abs(value) * tolerance, 0.006)
        merged = dict(table)
        merged["method"] = "table+text" if agree else "table"
        if not agree:
            merged["conflict"] = {"text_value": other, "text_quote": from_text["quote"]}
        if merged.get("prior") is None and agree:
            merged["prior"] = from_text.get("prior")
        merged["text_quote"] = from_text["quote"]
        return merged
    return table or from_text


# -- EPS ---------------------------------------------------------------------

_ADJ = re.compile(r"non[- ]?gaap|adjusted|\boperating earnings\b|\bcore\b|pro forma|excluding|management reporting|\bcash eps\b", re.IGNORECASE)
_GAAP = re.compile(r"\bgaap\b|\breported\b|\bnet (?:income|loss|earnings)\b|\bearnings per (?:diluted )?share\b|\bdiluted eps\b", re.IGNORECASE)
_PER_SHARE_AFTER = re.compile(
    r"\(?\$\s?(\d+\.\d{2,3})\)?\s+(?:per\s+(?:basic\s+and\s+)?(?:fully\s+)?diluted\s+(?:common\s+)?share|per\s+(?:common\s+)?share(?:,?\s+diluted)?|per\s+diluted\s+class\s+\w+\s+share|of\s+diluted\s+(?:earnings|eps))",
    re.IGNORECASE,
)
_PER_SHARE_BEFORE = re.compile(
    r"\b(?:EPS|earnings per (?:diluted )?(?:common )?share|net (?:income|loss|earnings) per (?:diluted )?(?:common )?share|(?:income|loss|earnings) per (?:diluted )?(?:common )?share)(?:\s*\((?:EPS|diluted)\))?(?:\s*-?\s*diluted)?(?:\s+(?:from|attributable to)\s+[\w\s]{2,40}?)?\s+(?:of|was|were|totaled|came in at|increased to|decreased to|rose to|fell to|grew to|improved to)\s+(?:a\s+(?:loss|gain)\s+of\s+)?\(?(-|−)?\$\s?(\d+\.\d{2,3})\)?",
    re.IGNORECASE,
)


def _clause_before(sentence: str, at: int) -> str:
    """The words just before a number, back to the last comma, semicolon or "and"."""
    head = sentence[:at]
    cut = max(head.rfind(","), head.rfind(";"), head.rfind(" and "), head.rfind(" or "), head.rfind("•"))
    return head[cut + 1 :] if cut >= 0 else head


def _eps_kind(sentence: str, at: int) -> str:
    clause = _clause_before(sentence, at)
    if _ADJ.search(clause):
        return "adjusted"
    if re.search(r"\bgaap\b|\breported\b", clause, re.IGNORECASE):
        return "gaap"
    head = sentence[:at]
    adj = [m.end() for m in _ADJ.finditer(head)]
    gaap = [m.end() for m in _GAAP.finditer(head) if not re.search(r"(?:non[- ]?|non[- ]gaap\s+|adjusted\s+)$", head[max(0, m.start() - 12) : m.start()], re.IGNORECASE)]
    if adj and (not gaap or adj[-1] > gaap[-1]):
        return "adjusted"
    return "gaap"


def _eps_mentions(sentence: str) -> list[tuple[int, float, bool]]:
    """(position, value, parenthesised or signed) for each per-share amount in a sentence."""
    found: list[tuple[int, float, bool]] = []
    for match in _PER_SHARE_AFTER.finditer(sentence):
        whole = match.group(0)
        found.append((match.start(1), float(match.group(1)), whole.lstrip().startswith("(")))
    for match in _PER_SHARE_BEFORE.finditer(sentence):
        negative = bool(match.group(1)) or sentence[match.start(2) - 2 : match.start(2)].endswith("($")
        found.append((match.start(2), float(match.group(2)), negative))
    found.sort()
    deduped: list[tuple[int, float, bool]] = []
    for item in found:
        if deduped and abs(deduped[-1][0] - item[0]) < 3:
            continue
        deduped.append(item)
    return deduped


def _is_loss(sentence: str, at: int) -> bool:
    clause = sentence[max(0, at - 90) : at].lower()
    last_loss = clause.rfind("loss")
    last_income = max(clause.rfind("income"), clause.rfind("earnings"), clause.rfind("profit"))
    return last_loss > last_income


def eps_from_text(text: str) -> dict[str, dict[str, Any]]:
    """The first current-quarter GAAP and adjusted per-share figures stated in sentences."""
    out: dict[str, dict[str, Any]] = {}
    for sentence in sentences(text):
        if len(sentence) > 700 or _GUIDANCE_WORDS.search(sentence):
            continue
        if re.search(r"\bdividend|repurchas|buyback|book value|tangible|cash flow per|distribution", sentence, re.IGNORECASE):
            continue
        mentions = _eps_mentions(sentence)
        if not mentions:
            continue
        compare = _COMPARE.search(sentence)
        for position, value, negative in mentions:
            if compare and position > compare.start():
                continue  # a year-earlier amount; picked up below as the prior
            clause = _clause_before(sentence, position)
            if _OTHER_PERIOD.search(clause) or _OTHER_PERIOD.search(sentence[max(0, position - 140) : position]):
                continue
            kind = _eps_kind(sentence, position)
            if kind in out:
                continue
            signed = -value if (negative or _is_loss(sentence, position)) else value
            prior = None
            if compare:
                later = [m for m in mentions if m[0] > compare.start()]
                if later:
                    p_pos, p_val, p_neg = later[0]
                    prior = -p_val if (p_neg or _is_loss(sentence, p_pos)) else p_val
            out[kind] = {"value": signed, "prior": prior, "quote": sentence[:300], "method": "text"}
        for position, value, negative in mentions:
            # The headline sentence often has no comparison; a later one repeats the figure with the year-earlier one.
            if not compare or position > compare.start():
                continue
            kind = _eps_kind(sentence, position)
            known = out.get(kind)
            signed = -value if (negative or _is_loss(sentence, position)) else value
            if known and known.get("prior") is None and abs(known["value"] - signed) < 0.0001:
                later = [m for m in mentions if m[0] > compare.start()]
                if later:
                    p_pos, p_val, p_neg = later[0]
                    known["prior"] = -p_val if (p_neg or _is_loss(sentence, p_pos)) else p_val
                    known["prior_quote"] = sentence[:300]
    return out


_DILUTED_LABEL = re.compile(
    r"^(?:diluted|diluted\s+(?:net\s+)?(?:income|earnings|loss|\(loss\)\s+income|income\s+\(loss\))[\w\s()]*?per\s+(?:common\s+)?share[\w\s()-]*|"
    r"(?:net\s+)?(?:income|earnings|loss|\(loss\)\s+income|income\s+\(loss\))[\w\s()]*?per\s+(?:common\s+)?share[\w\s(),-]*?diluted|"
    r"diluted\s+eps|earnings\s+per\s+(?:common\s+)?share\s*[-–:,]?\s*diluted|diluted\s+earnings\s+(?:\(loss\)\s+)?per\s+(?:common\s+)?share|"
    r"(?:reported\s+)?diluted\s+(?:income|earnings)\s+per\s+share|(?:net\s+)?(?:income|earnings)\s+per\s+diluted\s+share|eps\s*-\s*diluted)"
    r"(?:\s*\((?:gaap|\$/share)\))*$",
    re.IGNORECASE,
)
_ADJ_EPS_LABEL = re.compile(
    r"^(?:non[- ]?gaap|adjusted)[\w\s()-]*?(?:per\s+(?:diluted\s+)?(?:common\s+)?share|eps)[\w\s()$/,-]*$",
    re.IGNORECASE,
)
_PER_SHARE_CONTEXT = re.compile(r"per\s+(?:common\s+)?share|per\s+diluted|\beps\b", re.IGNORECASE)


def extract_eps(text: str, *, period_year: int | None = None) -> dict[str, dict[str, Any] | None]:
    """GAAP diluted EPS and the company's adjusted EPS (when it reports one)."""
    lines = text.splitlines()
    gaap_table = _table_figure(lines, _DILUTED_LABEL, period_year=period_year, per_share=True, context_re=_PER_SHARE_CONTEXT)
    if gaap_table and _ADJ.search(gaap_table["label"]):
        gaap_table = None
    adjusted_table = _table_figure(lines, _ADJ_EPS_LABEL, period_year=period_year, per_share=True)
    if adjusted_table and not re.search(r"dilut|eps|per share", adjusted_table["label"], re.IGNORECASE):
        adjusted_table = None
    written = eps_from_text(text)
    gaap = _reconcile(gaap_table, written.get("gaap"), tolerance=0.0)
    adjusted = _reconcile(adjusted_table, written.get("adjusted"), tolerance=0.0)
    if gaap and adjusted and gaap.get("quote") == adjusted.get("quote") and gaap["value"] == adjusted["value"]:
        adjusted = None
    return {"gaap": gaap, "adjusted": adjusted}


# -- guidance ----------------------------------------------------------------

_RANGE = re.compile(
    r"(?:between\s+)?(\(?-?\$\s?\d[\d,]*(?:\.\d+)?\)?)\s*(billion|million|thousand|bn|mm|m|b)?\s*(?:to|-|–|—|and)\s*(\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?)\s*(billion|million|thousand|bn|mm|m|b)?(?!\s*%)",
    re.IGNORECASE,
)
_POINT = re.compile(r"(?:of|at|approximately|about|be)\s+(\$\s?\d[\d,]*(?:\.\d+)?)\s*(billion|million|bn|mm|m|b)?\b", re.IGNORECASE)
_PCT_RANGE = re.compile(r"(-?\d+(?:\.\d+)?)\s*%?\s*(?:to|-|–)\s*(-?\d+(?:\.\d+)?)\s*%", re.IGNORECASE)

_METRICS: list[tuple[str, re.Pattern[str]]] = [
    ("adjusted_eps", re.compile(r"(?:non[- ]?gaap|adjusted)[^.;]{0,60}?(?:per\s+(?:diluted\s+)?share|eps|operating earnings)|operating earnings[^.;]{0,30}per share", re.I)),
    ("eps", re.compile(r"(?:per\s+(?:diluted\s+)?(?:common\s+)?share|\beps\b)", re.I)),
    ("adjusted_ebitda", re.compile(r"adjusted\s+ebitda|\bebitda\b", re.I)),
    ("net_bookings", re.compile(r"net bookings", re.I)),
    ("free_cash_flow", re.compile(r"free cash flow", re.I)),
    ("operating_margin", re.compile(r"operating margin", re.I)),
    ("revenue", re.compile(r"\b(?:total\s+)?(?:net\s+)?(?:revenues?|net sales|sales)\b", re.I)),
]
METRIC_LABELS = {
    "revenue": "Revenue",
    "eps": "EPS",
    "adjusted_eps": "Adjusted EPS",
    "adjusted_ebitda": "Adjusted EBITDA",
    "net_bookings": "Net bookings",
    "free_cash_flow": "Free cash flow",
    "operating_margin": "Operating margin",
}
_DIRECTION_WORDS: list[tuple[str, re.Pattern[str]]] = [
    ("lowered", re.compile(r"\b(?:lower(?:s|ed|ing)?|reduc(?:es|ed|ing|e)|cut(?:s|ting)?|trim(?:s|med|ming)?|decreas(?:es|ed|ing))\b", re.I)),
    ("raised", re.compile(r"\b(?:rais(?:es|ed|ing|e)|increas(?:es|ed|ing|e)|lift(?:s|ed|ing)?|boost(?:s|ed|ing)?|up from)\b", re.I)),
    ("narrowed", re.compile(r"\b(?:narrow(?:s|ed|ing)?|tighten(?:s|ed|ing)?)\b", re.I)),
    ("reaffirmed", re.compile(r"\b(?:reaffirm(?:s|ed|ing)?|reiterat(?:es|ed|ing|e)|maintain(?:s|ed|ing)?|confirm(?:s|ed|ing)?|unchanged)\b", re.I)),
    ("new", re.compile(r"\b(?:initiat(?:es|ed|ing)|introduc(?:es|ed|ing)|initial outlook|providing (?:its )?initial|first look|issu(?:es|ed|ing))\b", re.I)),
]
_PREVIOUS = re.compile(
    r"(?:previous(?:ly)?|prior|earlier)\s+(?:guidance\s+)?(?:range\s+)?(?:of\s+)?(?:outlook\s+)?(?:range\s+)?(?:of\s+)?|from\s+(?:its\s+)?(?:the\s+)?(?:previous|prior)\s+(?:guidance\s+)?(?:range\s+)?(?:of\s+)?",
    re.I,
)
_SECTION_START = re.compile(r"\b(?:outlook|guidance)\b", re.I)
_SECTION_END = re.compile(
    r"^(?:conference call|earnings call|investor conference|webcast|non-gaap|use of non-gaap|forward[- ]looking|about\s|safe harbor|cautionary|product releases|contact|reconciliation)",
    re.I,
)
_PERIOD_TEXT = re.compile(
    r"\b(?:(?:fiscal\s+)?(?:first|second|third|fourth)\s+(?:fiscal\s+)?quarter(?:\s+of)?(?:\s+fiscal)?(?:\s+\d{4})?|q[1-4](?:\s*(?:fy)?\s*'?\d{2,4})?|full[- ]year(?:\s+(?:fiscal\s+)?\d{4})?|(?:fiscal|fy)\s*(?:year\s+)?'?\d{2,4}|(?:the\s+)?(?:fiscal\s+)?year\s+(?:ending|ended)\s+\w+\s+\d{1,2},\s+\d{4}|(?:three months|quarter)\s+ending\s+\w+\s+\d{1,2},\s+\d{4}|\d{4}\s+(?:full[- ]year|annual))",
    re.I,
)


def _to_amount(raw: str, scale_word: str | None, fallback_scale: str | None) -> float | None:
    text = raw.strip()
    negative = text.startswith("(") or text.startswith("-")
    digits = re.sub(r"[^0-9.]", "", text)
    if not digits or digits == ".":
        return None
    value = float(digits)
    scale = _SCALES.get((scale_word or fallback_scale or "").lower(), 1.0)
    return (-value if negative else value) * scale


def _normalize_period(raw: str, default_year: int | None = None) -> str:
    """"fourth quarter of 2026" -> "Q4 2026", "full year 2026" -> "Full year 2026", "fiscal 2027" -> "Fiscal 2027"."""
    text = " ".join(raw.lower().split())
    for word, number in _ORDINALS.items():
        if re.search(rf"\b{word}\b", text) and "quarter" in text:
            year = re.search(r"(\d{4})", text)
            return f"Q{number}" + (f" {year.group(1)}" if year else "")
    match = re.search(r"\bq([1-4])\b\s*(?:fy)?\s*'?(\d{2,4})?", text)
    if match:
        year = match.group(2)
        if year and len(year) == 2:
            year = f"20{year}"
        return f"Q{match.group(1)}" + (f" {year}" if year else "")
    if "quarter ending" in text or "three months ending" in text:
        return ""  # the heading above it names the quarter
    year = re.search(r"(\d{4})", text) or re.search(r"(?:fy|fiscal)\s*'?(\d{2})\b", text)
    label = year.group(1) if year else ""
    if label and len(label) == 2:
        label = f"20{label}"
    if "fiscal" in text or re.search(r"\bfy", text):
        return f"Fiscal {label or default_year or ''}".strip()
    return f"Full year {label or default_year or ''}".strip()


def _direction_in(text: str) -> str | None:
    for name, pattern in _DIRECTION_WORDS:
        if pattern.search(text):
            return name
    return None


def _period_in(text: str, default_year: int | None) -> str | None:
    match = _PERIOD_TEXT.search(text)
    if match:
        label = _normalize_period(match.group(0), default_year)
        if label:
            return label
    bare = re.search(r"\b(20\d{2})\b", text)
    if bare:
        return f"Full year {bare.group(1)}"
    return None


def _guidance_from_sentence(sentence: str, period_hint: str | None, default_year: int | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    # One clause per metric: "Tightens revenue guidance to $X to $Y and reduces Adjusted EBITDA guidance to $A to $B".
    pieces = re.split(
        r";|\.\s|,?\s+and\s+(?=(?:reduc|rais|lower|tighten|narrow|reaffirm|reiterat|increas|maintain|now\s+expect|expect)\w*)",
        sentence,
        flags=re.I,
    )
    # A piece with no range ("Raising midpoint") belongs to the next one ("and narrowing ... to $12.50 - $12.80").
    clauses: list[str] = []
    carry = ""
    for piece in pieces:
        if not _RANGE.search(piece):
            carry = f"{carry} {piece}".strip()
            continue
        clauses.append(f"{carry} {piece}".strip())
        carry = ""
    sentence_period = _period_in(sentence, default_year)
    for clause in clauses:
        previous_at = _PREVIOUS.search(clause)
        head = clause[: previous_at.start()] if previous_at else clause
        ranges = list(_RANGE.finditer(head))
        if not ranges:
            continue
        first = ranges[0]
        before = head[: first.start()]
        metric = None
        for name, pattern in _METRICS:
            if pattern.search(before):
                metric = name
                break
        if metric is None:
            continue
        scale = first.group(2) or first.group(4)
        low = _to_amount(first.group(1), first.group(2) or first.group(4), None)
        high = _to_amount(first.group(3), first.group(4) or first.group(2), None)
        if low is None or high is None:
            continue
        if metric in {"eps", "adjusted_eps"} and (scale or abs(high) > 1000):
            continue
        if metric not in {"eps", "adjusted_eps", "operating_margin"} and not scale and abs(high) < 1e5:
            continue
        if low > high:
            low, high = high, low
        period = _period_in(before, default_year) or period_hint or sentence_period or ""
        prev_low = prev_high = None
        if previous_at:
            prev_range = _RANGE.search(clause[previous_at.end() : previous_at.end() + 90])
            if prev_range:
                prev_low = _to_amount(prev_range.group(1), prev_range.group(2) or prev_range.group(4) or scale, None)
                prev_high = _to_amount(prev_range.group(3), prev_range.group(4) or prev_range.group(2) or scale, None)
                if prev_low is not None and prev_high is not None and prev_low > prev_high:
                    prev_low, prev_high = prev_high, prev_low
        items.append(
            {
                "metric": metric,
                "label": METRIC_LABELS[metric],
                "period": period,
                "low": round(low, 4),
                "high": round(high, 4),
                "unit": "usd_per_share" if metric in {"eps", "adjusted_eps"} else "usd",
                "prev_low": prev_low,
                "prev_high": prev_high,
                "words": _direction_in(clause),
                "quote": sentence[:400],
            }
        )
    return items


def _guidance_from_table_row(cells: list[str], period: str, line: str) -> dict[str, Any] | None:
    label = _strip_footnotes(cells[0])
    metric = None
    for name, pattern in _METRICS:
        if pattern.search(label):
            metric = name
            break
    if metric is None or len(cells) < 2:
        return None
    if metric == "revenue" and not _REVENUE_LABEL.match(label):
        return None
    match = _RANGE.fullmatch(cells[1].strip()) or _RANGE.match(cells[1].strip())
    if not match:
        return None
    low = _to_amount(match.group(1), match.group(2) or match.group(4), None)
    high = _to_amount(match.group(3), match.group(4) or match.group(2), None)
    if low is None or high is None:
        return None
    return {"metric": metric, "label": METRIC_LABELS[metric], "period": period, "low": low, "high": high, "unit": "usd_per_share" if metric in {"eps", "adjusted_eps"} else "usd", "prev_low": None, "prev_high": None, "words": None, "quote": line[:300], "table_label": label}


def guidance_section(text: str) -> list[str]:
    """The lines of the outlook section, when the release has one."""
    lines = text.splitlines()
    out: list[str] = []
    inside = False
    for line in lines:
        short = len(line) <= 90 and " | " not in line
        if short and _SECTION_START.search(line) and not re.search(r"forward[- ]looking|non-gaap", line, re.I):
            inside = True
            out.append(line)
            continue
        if inside:
            if short and _SECTION_END.search(line):
                inside = False
                continue
            out.append(line)
    return out


def extract_guidance(text: str, *, default_year: int | None = None) -> dict[str, Any]:
    """Outlook items and the overall direction of the change.

    Direction per item, strongest evidence first: the previous range the
    release itself states (midpoint up = raised, down = lowered, same midpoint
    but tighter = narrowed, identical = reaffirmed), then the verb the release
    uses for that item ("raises", "reaffirms", "tightens").
    """
    lines = text.splitlines()
    head = lines[:25]
    section = guidance_section(text)
    items: list[dict[str, Any]] = []

    # Table outlooks: "Total net revenue | $7,980 to $8,180" under "Fiscal Year Ending March 31, 2027".
    period = ""
    scale = None
    for line in section:
        if " | " not in line:
            if len(line) < 120:
                found = _PERIOD_TEXT.search(line)
                label = _normalize_period(found.group(0), default_year) if found else ""
                if label:
                    period = label
            if table_scale([line]):
                scale = table_scale([line])
            continue
        cells = _split_row(line)
        if table_scale([cells[0]]):
            scale = table_scale([cells[0]])
        item = _guidance_from_table_row(cells, period, line)
        if item is None:
            continue
        if item["unit"] == "usd":
            if scale is None:
                continue
            item["low"] *= scale
            item["high"] *= scale
        items.append(item)

    # Sentences, each with the period its line opens with ("Full Year 2026 Guidance: Management now expects ...").
    hint = None
    for line in head + section:
        if " | " in line:
            continue
        opening = _period_in(line[:60], default_year)
        line_hint = opening or hint
        if len(line) < 120 and opening:
            hint = opening
        last_items: list[dict[str, Any]] = []
        for sentence in sentences(line):
            follow_up = re.match(r"^(?:this|that|which)\s+(?:compares|is|was|represents)\b", sentence, re.I)
            if follow_up and last_items and _PREVIOUS.search(sentence):
                # "This compares to the previous guidance range of $732.0 million to $738.0 million."
                prev_range = _RANGE.search(sentence[_PREVIOUS.search(sentence).end() :])
                target = last_items[-1]
                if prev_range and target.get("prev_low") is None:
                    scale = prev_range.group(2) or prev_range.group(4)
                    low = _to_amount(prev_range.group(1), scale, None)
                    high = _to_amount(prev_range.group(3), prev_range.group(4) or prev_range.group(2), None)
                    if low is not None and high is not None:
                        target["prev_low"], target["prev_high"] = min(low, high), max(low, high)
                        target["quote"] = f"{target['quote']} {sentence}"[:600]
                continue
            if not (_GUIDANCE_WORDS.search(sentence) or _direction_in(sentence)):
                continue
            if re.search(r"forward[- ]looking statements|safe harbor|not reconciled|reconciliation", sentence, re.I):
                continue
            found = _guidance_from_sentence(sentence, line_hint, default_year)
            items.extend(found)
            last_items = found or last_items

    # Same metric and period twice (headline and section): keep the one that states the previous range.
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for item in items:
        key = (item["metric"], item["period"].lower())
        known = merged.get(key)
        if known is None:
            merged[key] = item
            continue
        if known.get("prev_low") is None and item.get("prev_low") is not None:
            item["words"] = item.get("words") or known.get("words")
            merged[key] = item
        elif known.get("words") is None and item.get("words"):
            known["words"] = item["words"]

    out_items = []
    for item in merged.values():
        item["direction"] = guidance_direction(item)
        out_items.append(item)

    headline_words = None
    headline_quote = None
    for line in head:
        if re.search(r"guidance|outlook|forecast|expectation", line, re.I) and len(line) < 260:
            words = _direction_in(line)
            if words:
                headline_words, headline_quote = words, line.lstrip("•◦▪-– ").strip()
                break
    return {"items": out_items, "change": overall_change(out_items, headline_words), "headline_quote": headline_quote}


def guidance_direction(item: dict[str, Any]) -> str:
    low, high, prev_low, prev_high = item.get("low"), item.get("high"), item.get("prev_low"), item.get("prev_high")
    if None not in (low, high, prev_low, prev_high):
        mid, prev_mid = (low + high) / 2, (prev_low + prev_high) / 2
        tolerance = max(abs(prev_mid) * 0.001, 0.005 if item.get("unit") == "usd_per_share" else 1.0)
        if mid > prev_mid + tolerance:
            return "raised"
        if mid < prev_mid - tolerance:
            return "lowered"
        if (high - low) < (prev_high - prev_low) - tolerance:
            return "narrowed"
        return "reaffirmed"
    return item.get("words") or "issued"


def compare_with_previous(items: list[dict[str, Any]], previous: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fill each item's previous range from the last report's outlook for the same metric and period."""
    index = {(p.get("metric"), str(p.get("period") or "").lower()): p for p in previous or []}
    out = []
    for item in items:
        copy = dict(item)
        prior = index.get((item.get("metric"), str(item.get("period") or "").lower()))
        if prior and copy.get("prev_low") is None and prior.get("low") is not None and prior.get("high") is not None:
            copy["prev_low"], copy["prev_high"] = prior["low"], prior["high"]
            copy["prev_from"] = "last report"
            copy["direction"] = guidance_direction(copy)
        out.append(copy)
    return out


_CHANGE_RANK = {"lowered": 5, "raised": 4, "narrowed": 3, "reaffirmed": 2, "new": 1, "issued": 1}


def overall_change(items: list[dict[str, Any]], headline_words: str | None = None) -> str:
    """One word for the outlook: raised, lowered, mixed, narrowed, reaffirmed, issued or none."""
    directions = {item.get("direction") for item in items}
    if "raised" in directions and "lowered" in directions:
        return "mixed"
    for name in ("lowered", "raised"):
        if name in directions:
            return name
    if headline_words in {"raised", "lowered"}:
        return headline_words
    for name in ("narrowed", "reaffirmed"):
        if name in directions or headline_words == name:
            return name
    if items or headline_words in {"new"}:
        return "issued"
    return "none"


# -- management quotes -------------------------------------------------------

_QUOTE = re.compile(r"[“\"]([^”\"]{60,1500})[”\"]")
_SPEAKER = re.compile(
    r"^\s*,?\s*(?:said|stated|commented|added|noted|explained)\s+(?P<who>[^.“\"]{3,140}?)(?:\.|$|\s+[“\"])|^\s*,?\s*(?P<who2>[A-Z][\w.\- ]{2,60}?),\s+[\w ,&.-]{2,120}?,\s+(?:said|stated|commented|added)",
)
_SPEAKER_BEFORE = re.compile(r"(?P<who>[A-Z][\w.'\- ]{2,60}?),\s+(?P<title>[^,“\"]{2,120}?),\s+(?:said|stated|commented|added)[:,]?\s*$")
_SUBSTANCE = re.compile(
    r"\d|record|grew|growth|demand|guidance|outlook|expect|margin|raised|raising|accelerat|backlog|orders|customers|pipeline|headwind|tariff|declin|pressure|strong|weak|bookings|pricing|cost|cash|debt|capital|launch|share repurchase|return",
    re.I,
)
_FLUFF = re.compile(r"\b(?:pleased|proud|thank|grateful|excited|team(?:s)?\s+(?:for|delivered)|congratulat)\b", re.I)


_HEADING_WORDS = {"Comments", "Commentary", "Comment", "Quote", "Quotes", "Remarks", "Highlights", "Statement", "Perspective"}


def _short_speaker(raw: str) -> str:
    """"Strauss Zelnick, Chairman and CEO of Take-Two Interactive" -> "Strauss Zelnick, CEO"."""
    text = " ".join(raw.split()).strip(" ,.:")
    parts = [part.strip() for part in text.split(",") if part.strip()]
    if not parts:
        return ""
    # The name is the run of capitalised words at the end of the first part ("CEO Comments Strauss Zelnick").
    words = parts[0].split()
    run: list[str] = []
    for word in reversed(words):
        if word in _HEADING_WORDS:
            break
        if re.fullmatch(r"[A-Z][\w.'\-]*", word) and word.upper() != word or re.fullmatch(r"[A-Z]\.", word):
            run.insert(0, word)
            if len(run) == 4:
                break
        else:
            break
    name = " ".join(run) or parts[0]
    rest = " ".join(parts[1:]) if len(parts) > 1 else ""
    if re.search(r"chief executive|\bceo\b", rest, re.I):
        title = "CEO"
    elif re.search(r"chief financial|\bcfo\b", rest, re.I):
        title = "CFO"
    elif re.search(r"chief operating|\bcoo\b", rest, re.I):
        title = "COO"
    elif re.search(r"president", rest, re.I):
        title = "President"
    elif re.search(r"chair", rest, re.I):
        title = "Chair"
    else:
        title = ""
    return f"{name}, {title}" if title else name


def extract_quotes(text: str, *, limit: int = 8) -> list[dict[str, Any]]:
    """Sentences management said, verbatim, best first by substance. Each keeps its speaker."""
    candidates: list[dict[str, Any]] = []
    flat = " ".join(line for line in text.splitlines() if " | " not in line)
    order = 0
    last_speaker = ""
    last_end = -1000
    for match in _QUOTE.finditer(flat):
        body = match.group(1).strip()
        after = flat[match.end() : match.end() + 220]
        before = flat[max(0, match.start() - 200) : match.start()]
        speaker_match = _SPEAKER.search(after)
        who = ""
        if speaker_match:
            who = speaker_match.group("who") or speaker_match.group("who2") or ""
        else:
            prior = _SPEAKER_BEFORE.search(before)
            if prior:
                who = f"{prior.group('who')}, {prior.group('title')}"
        speaker = _short_speaker(who) if who else ""
        if not speaker and match.start() - last_end < 120:
            # A quote that carries on after "... said the CEO." belongs to the same person.
            speaker = last_speaker
        if not speaker:
            continue
        last_speaker = speaker
        last_end = match.end() + (speaker_match.end() if speaker_match else 0)
        for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z])", body):
            sentence = sentence.strip().rstrip(",;: ")
            if sentence and sentence[-1] not in ".!?":
                sentence += "."
            if len(sentence) < 50 or len(sentence) > 360:
                continue
            score = len(_SUBSTANCE.findall(sentence)) * 2 - (3 if _FLUFF.search(sentence) else 0)
            if re.search(r"\d", sentence):
                score += 2
            candidates.append({"text": sentence, "speaker": speaker, "score": score, "order": order})
            order += 1
    seen: set[str] = set()
    unique = []
    for item in candidates:
        key = item["text"][:80].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    best = sorted(unique, key=lambda item: (-item["score"], item["order"]))[:limit]
    return [{"text": item["text"], "speaker": item["speaker"], "score": item["score"]} for item in sorted(best, key=lambda item: item["order"])]


def pick_quotes(candidates: list[dict[str, Any]], count: int = 3, per_speaker: int = 2) -> list[dict[str, Any]]:
    """The rule pick: highest substance first, at most two from one person, kept in release order."""
    ranked = sorted(enumerate(candidates), key=lambda pair: (-pair[1].get("score", 0), pair[0]))
    chosen: list[tuple[int, dict[str, Any]]] = []
    by_speaker: dict[str, int] = {}
    for index, item in ranked:
        if item.get("score", 0) <= 0:
            continue
        speaker = item.get("speaker", "")
        if by_speaker.get(speaker, 0) >= per_speaker:
            continue
        chosen.append((index, item))
        by_speaker[speaker] = by_speaker.get(speaker, 0) + 1
        if len(chosen) >= count:
            break
    return [item for _, item in sorted(chosen)]


# -- the whole release -------------------------------------------------------


def extract_release(text: str, *, fiscal_date_ending: str = "") -> dict[str, Any]:
    """Every rule above over one release."""
    period = fiscal_period(text, fiscal_date_ending)
    period_year = None
    match = re.fullmatch(r"(\d{4})-\d{2}-\d{2}", fiscal_date_ending or "")
    if match:
        period_year = int(match.group(1))
    revenue = extract_revenue(text, period_year=period_year)
    eps = extract_eps(text, period_year=period_year)
    guidance = extract_guidance(text, default_year=period_year if period.get("from") == "calendar" else period.get("year"))
    quotes = extract_quotes(text)
    return {"period": period, "revenue": revenue, "eps": eps, "guidance": guidance, "quote_candidates": quotes}


# -- reaction ----------------------------------------------------------------


def typical_move(moves: list[float], *, minimum: int = 4) -> float | None:
    """Median absolute move over past reports, or None with fewer than ``minimum``."""
    values = [abs(value) for value in moves if isinstance(value, (int, float))]
    if len(values) < minimum:
        return None
    return round(median(values), 2)
