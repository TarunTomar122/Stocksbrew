"""Per-ticker fundamentals scraped from Finviz quote pages.

Finviz's `quote.ashx?t={TICKER}` page embeds a ~70-cell label/value table in
static HTML. This module parses it into a flat dict of floats keyed by
canonical Tikrr field names. Downstream scoring reads today's snapshot plus
yesterday's (for delta-based catalysts) against sector benchmarks.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.request import Request, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    with urlopen(request, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


# Finviz label → (canonical_field, parser)
_NUMERIC = "num"      # plain float
_PCT = "pct"          # strip trailing %
_DOLLAR_AMT = "money" # strip $, allow suffix B/M/K
_SPLIT_PCT_FIRST = "split_pct_first"  # "6.89% 17.91%" → first
_SPLIT_PCT_SECOND = "split_pct_second"

_FIELD_MAP: dict[str, tuple[str, str]] = {
    # Valuation
    "P/E": ("pe", _NUMERIC),
    "Forward P/E": ("fwd_pe", _NUMERIC),
    "PEG": ("peg", _NUMERIC),
    "P/S": ("ps", _NUMERIC),
    "P/B": ("pb", _NUMERIC),
    "P/FCF": ("p_fcf", _NUMERIC),
    "EV/EBITDA": ("ev_ebitda", _NUMERIC),
    # Growth
    "EPS (ttm)": ("eps_ttm", _NUMERIC),
    "EPS next Y": ("eps_next_y_growth", _PCT),       # overwritten below when numeric variant parses first
    "EPS this Y": ("eps_growth_this_y", _PCT),
    "EPS next 5Y": ("eps_growth_next_5y", _PCT),
    "EPS Y/Y TTM": ("eps_yy_ttm", _PCT),
    "Sales Y/Y TTM": ("sales_yy_ttm", _PCT),
    "Sales Q/Q": ("sales_qq", _PCT),
    "EPS Q/Q": ("eps_qq", _PCT),
    "EPS past 3/5Y": ("eps_growth_past_5y", _SPLIT_PCT_SECOND),
    "Sales past 3/5Y": ("sales_growth_past_5y", _SPLIT_PCT_SECOND),
    # Quality
    "ROE": ("roe", _PCT),
    "ROA": ("roa", _PCT),
    "ROIC": ("roic", _PCT),
    "Gross Margin": ("gross_margin", _PCT),
    "Oper. Margin": ("oper_margin", _PCT),
    "Profit Margin": ("profit_margin", _PCT),
    "Debt/Eq": ("debt_eq", _NUMERIC),
    "LT Debt/Eq": ("lt_debt_eq", _NUMERIC),
    "Payout": ("payout_ratio", _PCT),
    # Ownership / momentum / sentiment
    "Inst Own": ("inst_own_pct", _PCT),
    "Inst Trans": ("inst_trans_pct", _PCT),
    "Insider Own": ("insider_own_pct", _PCT),
    "Insider Trans": ("insider_trans_pct", _PCT),
    "Short Float": ("short_float_pct", _PCT),
    "Short Ratio": ("short_ratio", _NUMERIC),
    "Recom": ("recom", _NUMERIC),
    "Target Price": ("target_price", _NUMERIC),
    # Performance
    "Perf Week": ("perf_1w", _PCT),
    "Perf Month": ("perf_1m", _PCT),
    "Perf Quarter": ("perf_3m", _PCT),
    "Perf Half Y": ("perf_6m", _PCT),
    "Perf Year": ("perf_1y", _PCT),
    "Perf YTD": ("perf_ytd", _PCT),
    # Meta / price
    "Price": ("price", _NUMERIC),
    "Prev Close": ("prev_close", _NUMERIC),
    "Change": ("change_pct", _PCT),
    "Beta": ("beta", _NUMERIC),
    "Volatility": ("volatility", _SPLIT_PCT_FIRST),
    "RSI (14)": ("rsi_14", _NUMERIC),
    "Market Cap": ("market_cap", _DOLLAR_AMT),
}


def _parse_cell(raw: str, kind: str) -> Any:
    text = re.sub(r"<[^>]+>", "", raw).strip()
    if not text or text == "-":
        return None
    if kind == _NUMERIC:
        try:
            return float(text.replace(",", ""))
        except ValueError:
            return None
    if kind == _PCT:
        cleaned = text.split()[0].rstrip("%").replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    if kind == _SPLIT_PCT_FIRST or kind == _SPLIT_PCT_SECOND:
        parts = text.replace("%", "").split()
        idx = 0 if kind == _SPLIT_PCT_FIRST else -1
        if not parts:
            return None
        try:
            return float(parts[idx].replace(",", ""))
        except ValueError:
            return None
    if kind == _DOLLAR_AMT:
        cleaned = text.replace(",", "").replace("$", "")
        suffix_mult = {"B": 1e9, "M": 1e6, "K": 1e3}
        if cleaned[-1:] in suffix_mult:
            try:
                return float(cleaned[:-1]) * suffix_mult[cleaned[-1]]
            except ValueError:
                return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


_SECTOR_LINK_RE = re.compile(
    r'href="[^"]*f=sec_([a-z0-9]+)[^"]*"[^>]*class="quote-header_category"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
_SECTOR_LINK_LEGACY_RE = re.compile(
    r'f=sec_([a-z0-9]+)[^"\']*["\'][^>]*class="tab-link[^"]*"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
_INDUSTRY_LINK_RE = re.compile(
    r'href="[^"]*f=ind_([a-z0-9]+)[^"]*"[^>]*class="quote-header_category"[^>]*(?:title="([^"]*)")?[^>]*>(?:<[^>]+>)?([^<]+)',
    re.IGNORECASE,
)
_INDUSTRY_LINK_LEGACY_RE = re.compile(
    r'f=ind_([a-z0-9]+)[^"\']*["\'][^>]*class="tab-link[^"]*"[^>]*>([^<]+)</a>',
    re.IGNORECASE,
)
_EARNINGS_RE = re.compile(
    r">Earnings</a></div></td>.*?<b>\s*(?:<[^>]+>)?([^<]+?)(?:</[^>]+>)?\s*</b>",
    re.DOTALL,
)


@dataclass
class FinvizQuote:
    ticker: str
    metrics: dict[str, float] = field(default_factory=dict)
    sector_slug: str = ""
    sector_label: str = ""
    industry_slug: str = ""
    industry_label: str = ""
    earnings_date: str = ""


def parse_finviz_quote(html: str, ticker: str) -> FinvizQuote:
    quote = FinvizQuote(ticker=ticker)

    table_m = re.search(
        r'<table[^>]*snapshot-table2[^>]*>(.*?)</table>', html, re.DOTALL
    )
    if table_m:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", table_m.group(1), re.DOTALL)
        stripped = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        for i in range(0, len(stripped) - 1, 2):
            label = stripped[i]
            raw_value = cells[i + 1]
            mapping = _FIELD_MAP.get(label)
            if not mapping:
                continue
            field_name, kind = mapping
            parsed = _parse_cell(raw_value, kind)
            if parsed is not None:
                quote.metrics[field_name] = parsed

    sector_m = _SECTOR_LINK_RE.search(html) or _SECTOR_LINK_LEGACY_RE.search(html)
    if sector_m:
        quote.sector_slug = sector_m.group(1).lower()
        quote.sector_label = sector_m.group(2).strip()
    industry_m = _INDUSTRY_LINK_RE.search(html) or _INDUSTRY_LINK_LEGACY_RE.search(html)
    if industry_m:
        quote.industry_slug = industry_m.group(1).lower()
        quote.industry_label = (industry_m.group(2) or industry_m.group(3) or "").strip()

    earnings_m = _EARNINGS_RE.search(html)
    if earnings_m:
        quote.earnings_date = earnings_m.group(1).strip()

    return quote


def fetch_finviz_quote(ticker: str) -> FinvizQuote:
    url = f"https://finviz.com/quote.ashx?t={ticker.upper()}"
    html = _fetch(url)
    return parse_finviz_quote(html, ticker)


# ────────────────────────────── Zacks scraper ──────────────────────────────

_ZACKS_RANK_RE = re.compile(r'class="rank_view"\s*>\s*(\d)-([A-Za-z]+)', re.DOTALL)
_ZACKS_ESP_RE = re.compile(
    r'(?:ESP|Expected Surprise)[^<]*(?:<[^>]+>[^<]*){1,25}?([-+]?\d[\d.]*)%',
    re.DOTALL,
)
# The composite block: <span class="composite_val">A</span>&nbsp;Value ... Growth ... Momentum ... VGM
_ZACKS_STYLE_RE = re.compile(
    r'composite_val"\s*>\s*([A-F])\s*</span>\s*(?:&nbsp;|\s)*\s*(Value|Growth|Momentum|VGM)',
    re.DOTALL,
)

_STYLE_LETTER_TO_SCORE = {"A": 100, "B": 75, "C": 50, "D": 25, "F": 0}


@dataclass
class ZacksQuote:
    ticker: str
    rank: int | None = None
    rank_label: str = ""
    earnings_esp: float | None = None
    style_value: str = ""
    style_growth: str = ""
    style_momentum: str = ""
    style_vgm: str = ""


def parse_zacks_quote(html: str, ticker: str) -> ZacksQuote:
    quote = ZacksQuote(ticker=ticker)
    m = _ZACKS_RANK_RE.search(html)
    if m:
        try:
            quote.rank = int(m.group(1))
        except ValueError:
            pass
        quote.rank_label = m.group(2).strip()
    m = _ZACKS_ESP_RE.search(html)
    if m:
        try:
            quote.earnings_esp = float(m.group(1))
        except ValueError:
            pass
    for letter, label in _ZACKS_STYLE_RE.findall(html):
        key = {
            "Value": "style_value",
            "Growth": "style_growth",
            "Momentum": "style_momentum",
            "VGM": "style_vgm",
        }[label]
        if not getattr(quote, key, ""):
            setattr(quote, key, letter)
    return quote


def fetch_zacks_quote(ticker: str) -> ZacksQuote:
    url = f"https://www.zacks.com/stock/quote/{ticker.upper()}"
    html = _fetch(url)
    return parse_zacks_quote(html, ticker)


def zacks_style_to_score(letter: str) -> float | None:
    return _STYLE_LETTER_TO_SCORE.get(letter.upper())


def fetch_finviz_quotes(
    tickers: list[str], pause_seconds: float = 1.0
) -> dict[str, FinvizQuote]:
    """Fetch many tickers sequentially with a polite pause between requests."""
    results: dict[str, FinvizQuote] = {}
    total = len(tickers)
    started = time.time()
    for idx, ticker in enumerate(tickers):
        try:
            results[ticker] = fetch_finviz_quote(ticker)
        except Exception as exc:
            print(f"[finviz] {ticker} failed: {exc}")
        done = idx + 1
        if done == 1 or done % 25 == 0 or done == total:
            elapsed = time.time() - started
            print(
                f"[finviz] progress {done}/{total} "
                f"(ok={len(results)}) elapsed={elapsed:.1f}s"
            )
        if idx < len(tickers) - 1 and pause_seconds > 0:
            time.sleep(pause_seconds)
    return results


def _smoke() -> None:
    q = fetch_finviz_quote("AAPL")
    print(f"{q.ticker} sector={q.sector_slug} earnings={q.earnings_date}")
    for k, v in sorted(q.metrics.items()):
        print(f"  {k:25s} {v}")


if __name__ == "__main__":
    _smoke()
