"""Per-ticker fundamentals scraped from Screener.in.

The consolidated company page (`/company/{TICKER}/consolidated/`) exposes a
top ratio card, a peer comparison table with sector medians, and compound
growth blocks. This module parses it into a flat dict keyed by Tikrr canonical
field names so downstream scoring can treat IN and US snapshots uniformly.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from urllib.request import Request, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    with urlopen(request, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


# Screener top-card label → (canonical_field, parser)
_NUMERIC = "num"
_PCT = "pct"
_CRORE = "crore"  # Indian crore (1e7) → absolute

_TOP_CARD_MAP: dict[str, tuple[str, str]] = {
    "Market Cap": ("market_cap", _CRORE),
    "Current Price": ("price", _NUMERIC),
    "Stock P/E": ("pe", _NUMERIC),
    "Book Value": ("book_value", _NUMERIC),
    "Dividend Yield": ("dividend_yield", _NUMERIC),  # already a percentage
    "ROCE": ("roce", _NUMERIC),
    "ROE": ("roe", _NUMERIC),
    "Face Value": ("face_value", _NUMERIC),
}


def _parse_number(text: str) -> float | None:
    text = text.strip().rstrip("%")
    if not text or text == "-":
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


_TOP_CARD_RE = re.compile(
    r'<span class="name">\s*([^<]+?)\s*</span>\s*'
    r'<span class="nowrap value">\s*(?:₹\s*)?'
    r'<span class="number">([^<]+)</span>',
    re.DOTALL,
)

# High / Low split from Screener's top-card range.
_HIGH_LOW_RE = re.compile(
    r'<span class="name">\s*High / Low\s*</span>\s*'
    r'<span class="nowrap value">\s*(?:₹\s*)?'
    r'<span class="number">([^<]+)</span>\s*/\s*(?:₹\s*)?'
    r'<span class="number">([^<]+)</span>',
    re.DOTALL,
)

_SECTOR_LABEL_RE = re.compile(r'Sector">([^<]+)</a>')
_INDUSTRY_LABEL_RE = re.compile(r'Industry">([^<]+)</a>')

# Growth tables embed inside <th colspan="2">Compounded ... Growth</th> then
# rows like <td>5 Years:</td><td>10%</td>.
_COMPOUNDED_BLOCK_RE = re.compile(
    r'<th colspan="2">\s*'
    r'(Compounded Sales Growth|Compounded Profit Growth|Stock Price CAGR|Return on Equity)'
    r'\s*</th>(.*?)</table>',
    re.DOTALL,
)
_COMPOUNDED_ROW_RE = re.compile(
    r'<td[^>]*>\s*([0-9]+) Years?:?\s*</td>\s*<td[^>]*>\s*(-?[0-9.,]+)\s*%',
    re.DOTALL,
)

# Screener's P&L / Ratios / Balance Sheet blocks use:
#   <tr>
#     <td class="text">Label</td>
#     <td>val_year1</td> ... <td>val_latest</td>
#   </tr>
# Each row's last cell is the most recent period (TTM or latest fiscal).
# We pick the last numeric cell because occasional rows embed button/icon
# cells at the end that aren't numeric.
_CELL_NUMBER_RE = re.compile(r'<td[^>]*>\s*(-?[0-9][0-9.,]*)\s*%?\s*</td>')


def _latest_row_value(html: str, label: str) -> float | None:
    """Return the rightmost numeric cell from the row labeled `label`.

    The label is matched case-insensitively and allows trailing whitespace
    plus an optional trailing "%" in the label text itself (Screener writes
    "OPM %", "Dividend Payout %", etc.). Some Screener rows wrap the label
    inside a <button> (for schedule drilldowns like "Borrowings"), so we
    match the label anywhere inside the td.text cell rather than requiring
    it to be the only child.
    """
    pattern = (
        r'<td[^>]*class="text"[^>]*>[^<]*(?:<[^>]*>[^<]*)*?'
        + re.escape(label)
        + r'[^<]*(?:<[^>]*>[^<]*)*?</td>(.*?)</tr>'
    )
    m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
    if not m:
        return None
    cells = _CELL_NUMBER_RE.findall(m.group(1))
    if not cells:
        return None
    return _parse_number(cells[-1])


def _latest_percent_row_value(html: str, label: str) -> float | None:
    pattern = (
        r'<td[^>]*class="text"[^>]*>[^<]*(?:<[^>]*>[^<]*)*?'
        + re.escape(label)
        + r'[^<]*(?:<[^>]*>[^<]*)*?</td>(.*?)</tr>'
    )
    m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
    if not m:
        return None
    cells = re.findall(
        r'<td[^>]*>\s*(-?[0-9][0-9.,]*)\s*%\s*</td>',
        m.group(1),
    )
    if not cells:
        return None
    return _parse_number(cells[-1])


@dataclass
class ScreenerQuote:
    ticker: str
    metrics: dict[str, float] = field(default_factory=dict)
    sector_slug: str = ""
    sector_label: str = ""
    industry_slug: str = ""
    industry_label: str = ""
    shareholding: dict[str, float] = field(default_factory=dict)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def parse_screener_quote(html: str, ticker: str) -> ScreenerQuote:
    quote = ScreenerQuote(ticker=ticker)

    for label, raw_value in _TOP_CARD_RE.findall(html):
        mapping = _TOP_CARD_MAP.get(label.strip())
        if not mapping:
            continue
        field_name, kind = mapping
        value = _parse_number(raw_value)
        if value is None:
            continue
        if kind == _CRORE:
            value = value * 1e7
        quote.metrics[field_name] = value

    hl_m = _HIGH_LOW_RE.search(html)
    if hl_m:
        high = _parse_number(hl_m.group(1))
        low = _parse_number(hl_m.group(2))
        if high is not None:
            quote.metrics["week_52_high"] = high
        if low is not None:
            quote.metrics["week_52_low"] = low

    sector_m = _SECTOR_LABEL_RE.search(html)
    if sector_m:
        quote.sector_label = sector_m.group(1).strip()
        quote.sector_slug = _slugify(quote.sector_label)
    industry_m = _INDUSTRY_LABEL_RE.search(html)
    if industry_m:
        quote.industry_label = industry_m.group(1).strip()
        quote.industry_slug = _slugify(quote.industry_label)

    section_prefix = {
        "Compounded Sales Growth": "sales_growth_past_",
        "Compounded Profit Growth": "profit_growth_past_",
        "Stock Price CAGR": "stock_cagr_",
        "Return on Equity": "roe_trend_",
    }
    for section_name, block in _COMPOUNDED_BLOCK_RE.findall(html):
        rows = dict(_COMPOUNDED_ROW_RE.findall(block))
        prefix = section_prefix.get(section_name)
        if not prefix:
            continue
        for years in ("1", "3", "5", "10"):
            if years not in rows:
                continue
            try:
                value = float(rows[years].replace(",", ""))
            except ValueError:
                continue
            quote.metrics[f"{prefix}{years}y"] = value

    # Promote the 5-year stock CAGR into the canonical perf_5y slot so
    # downstream momentum scoring sees a comparable performance number.
    if "stock_cagr_5y" in quote.metrics:
        quote.metrics.setdefault("perf_5y_cagr", quote.metrics["stock_cagr_5y"])

    # Ratios / P&L / Balance Sheet rows — Screener doesn't expose these in the
    # top card, but they're in the year-over-year tables further down. Grab the
    # latest fiscal cell for each canonical quality field so IN scorecards
    # stop showing missing values.
    #
    # Label quirks:
    #   - OPM shows as "OPM %" (value already a percent)
    #   - Debt to equity is a unitless ratio
    #   - Dividend Payout shows as "Dividend Payout %" (already a percent)
    row_fields = [
        ("revenue", "Sales"),
        ("operating_income", "Operating Profit"),
        ("net_income", "Net Profit"),
        ("eps_diluted", "EPS in Rs"),
        ("oper_margin", "OPM"),
        ("payout_ratio", "Dividend Payout"),
    ]
    for canonical, label in row_fields:
        if canonical in quote.metrics:
            continue
        value = _latest_row_value(html, label)
        if value is not None:
            if canonical in {"revenue", "operating_income", "net_income"}:
                # Screener reports rupee crore in statement tables.
                value = value * 1e7
            quote.metrics[canonical] = value

    # Screener doesn't publish "Debt to Equity" directly on the consolidated
    # ratio strip for most IN companies, but the balance-sheet rows Borrowings,
    # Equity Capital, and Reserves are all there. D/E = Borrowings / Net Worth,
    # which is the standard definition and what Finviz reports for US stocks.
    if "debt_eq" not in quote.metrics:
        borrowings = _latest_row_value(html, "Borrowings")
        equity_cap = _latest_row_value(html, "Equity Capital")
        reserves = _latest_row_value(html, "Reserves")
        if (
            borrowings is not None
            and equity_cap is not None
            and reserves is not None
        ):
            net_worth = equity_cap + reserves
            if net_worth > 0:
                quote.metrics["debt_eq"] = round(borrowings / net_worth, 2)

    for label, canonical in (
        ("Promoters", "promoter_pct"),
        ("FIIs", "fii_pct"),
        ("DIIs", "dii_pct"),
        ("Government", "government_pct"),
        ("Public", "public_pct"),
    ):
        value = _latest_percent_row_value(html, label)
        if value is not None:
            quote.shareholding[canonical] = value

    return quote


def fetch_screener_quote(ticker: str) -> ScreenerQuote:
    url = f"https://www.screener.in/company/{ticker.upper()}/consolidated/"
    html = _fetch(url)
    return parse_screener_quote(html, ticker.upper())


def fetch_screener_quotes(
    tickers: list[str], pause_seconds: float = 1.5
) -> dict[str, ScreenerQuote]:
    out: dict[str, ScreenerQuote] = {}
    for i, ticker in enumerate(tickers):
        try:
            out[ticker.upper()] = fetch_screener_quote(ticker)
        except Exception as exc:
            print(f"  [screener fail] {ticker}: {exc}")
        if i < len(tickers) - 1:
            time.sleep(pause_seconds)
    return out
