"""Per-ticker data scraped from Tickertape.

Tickertape SSRs the entire page state into a `<script id="__NEXT_DATA__">`
JSON blob. We hit the search API to resolve NSE tickers to their internal
sid/slug, fetch the stock page, then extract keyRatios (stock + industry
medians), analyst forecast %, 52-week range, and qualitative scorecard tags.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote as url_quote
from urllib.request import Request, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    with urlopen(request, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


@dataclass
class TickertapeQuote:
    ticker: str
    sid: str = ""
    slug: str = ""
    metrics: dict[str, float] = field(default_factory=dict)
    sector_label: str = ""
    industry_label: str = ""
    scorecard_tags: dict[str, str] = field(default_factory=dict)
    analyst_total_reco: int | None = None
    analyst_buy_pct: float | None = None
    peers: list[str] = field(default_factory=list)


def _resolve_slug(ticker: str) -> str | None:
    """Hit Tickertape's search API to find the slug for an NSE ticker."""
    try:
        url = f"https://api.tickertape.in/search?text={url_quote(ticker)}&types=stock"
        body = _fetch(url)
        data = json.loads(body)
    except Exception:
        return None
    stocks = (data.get("data") or {}).get("stocks") or []
    ticker_upper = ticker.upper()
    for stock in stocks:
        if str(stock.get("ticker", "")).upper() == ticker_upper:
            return stock.get("slug") or stock.get("slugId")
    if stocks:
        return stocks[0].get("slug") or stocks[0].get("slugId")
    return None


def parse_tickertape_page(html: str, ticker: str) -> TickertapeQuote:
    quote = TickertapeQuote(ticker=ticker.upper())
    m = _NEXT_DATA_RE.search(html)
    if not m:
        return quote
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return quote

    pp = data.get("props", {}).get("pageProps", {})
    quote.sid = pp.get("sid", "")
    quote.slug = pp.get("slugId", "")

    info = (pp.get("securityInfo") or {}).get("info") or {}
    quote.sector_label = info.get("sector", "") or ""
    quote.industry_label = info.get("industry", "") or quote.sector_label

    summary = pp.get("securitySummary") or {}
    for r in summary.get("keyRatios") or []:
        key = r.get("backL")
        val = r.get("value")
        if val is None or not isinstance(val, (int, float)):
            continue
        mapping = {
            "ttmPe": "pe",
            "pbr": "pb",
            "divYield": "dividend_yield",
            "indpe": "sector_pe",
            "indpb": "sector_pb",
            "inddy": "sector_dividend_yield",
        }
        if key in mapping:
            quote.metrics[mapping[key]] = float(val)

    quote_data = pp.get("securityQuote") or {}
    for src_key, dst_key in (
        ("price", "price"),
        ("high52w", "week_52_high"),
        ("low52w", "week_52_low"),
        ("mnChange", "perf_1m"),
        ("wkChange", "perf_1w"),
        ("dyChange", "perf_1d"),
        ("away52wH", "away_52w_high"),
        ("away52wL", "away_52w_low"),
    ):
        val = quote_data.get(src_key)
        if isinstance(val, (int, float)):
            quote.metrics[dst_key] = float(val)

    forecast = summary.get("forecast") or {}
    total = forecast.get("totalReco")
    buy_pct = forecast.get("percBuyReco")
    if isinstance(total, (int, float)):
        quote.analyst_total_reco = int(total)
        quote.metrics["analyst_total_reco"] = float(total)
    if isinstance(buy_pct, (int, float)):
        quote.analyst_buy_pct = float(buy_pct)
        quote.metrics["analyst_buy_pct"] = float(buy_pct)

    for card in pp.get("scorecard") or []:
        name = card.get("name")
        tag = card.get("tag")
        if isinstance(name, str) and isinstance(tag, str):
            quote.scorecard_tags[name] = tag

    for peer in summary.get("aboutAndPeers") or []:
        t = peer.get("ticker")
        if isinstance(t, str) and t.upper() != quote.ticker:
            quote.peers.append(t.upper())

    return quote


def fetch_tickertape_quote(ticker: str, slug: str | None = None) -> TickertapeQuote:
    slug = slug or _resolve_slug(ticker)
    if not slug:
        return TickertapeQuote(ticker=ticker.upper())
    # Search API returns slug like "/stocks/reliance-industries-RELI"; normalise
    # so callers can pass either a bare slug or the absolute path.
    path = slug if slug.startswith("/") else f"/stocks/{slug}"
    url = f"https://www.tickertape.in{path}"
    html = _fetch(url)
    return parse_tickertape_page(html, ticker)


def fetch_tickertape_quotes(
    tickers: list[str], pause_seconds: float = 1.5
) -> dict[str, TickertapeQuote]:
    out: dict[str, TickertapeQuote] = {}
    for i, ticker in enumerate(tickers):
        try:
            out[ticker.upper()] = fetch_tickertape_quote(ticker)
        except Exception as exc:
            print(f"  [tickertape fail] {ticker}: {exc}")
        if i < len(tickers) - 1:
            time.sleep(pause_seconds)
    return out
