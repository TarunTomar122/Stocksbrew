"""Scrape sector day-change tiles from third-party sites.

US sectors come from Finviz group performance tables (static HTML). Only
the five canonical buckets Tikrr cares about are returned:
Finance, Defense, Tech, Energy, Pharma.

Defense and Pharma aren't standalone GICS sectors, so they are sourced from
Finviz's industry table (Aerospace & Defense, Drug Manufacturers - General).
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from http.cookiejar import CookieJar
from typing import Iterable
from urllib.request import Request, build_opener, HTTPCookieProcessor, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

_FINVIZ_SECTOR_URL = "https://finviz.com/groups.ashx?g=sector&v=140"
_FINVIZ_INDUSTRY_URL = "https://finviz.com/groups.ashx?g=industry&v=140"
_FINVIZ_SECTOR_VALUATION_URL = "https://finviz.com/groups.ashx?g=sector&v=120"

# Finviz v=140 (Performance) row cells after the <a>Name</a> link:
#   0: Perf Week  1: Perf Month  2: Perf Quarter  3: Perf Half
#   4: Perf Year  5: Perf YTD    6: Avg Volume    7: Rel Volume
#   8: Change (today %)          9: Volume
_CHANGE_CELL_INDEX = 8

_SECTOR_SLUG_TO_BUCKET = {
    "financial": "Finance",
    "technology": "Tech",
    "energy": "Energy",
}

_INDUSTRY_SLUG_TO_BUCKET = {
    "aerospacedefense": "Defense",
    "drugmanufacturersgeneral": "Pharma",
}

_CANONICAL_ORDER = ("Finance", "Defense", "Tech", "Energy", "Pharma")


@dataclass
class SectorTile:
    label: str
    change_pct: float
    source: str


def _fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    with urlopen(request, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


_ROW_RE = re.compile(
    r'f=(?:sec|ind)_([a-z]+)[^"\']*["\'][^>]*class="tab-link">[^<]+</a>(.*?)</tr>',
    re.DOTALL,
)
_CELL_RE = re.compile(r'<td[^>]*>(?:\s*<[^>]*>)*\s*([-+]?\d[\d.,]*%?|\d[\d.,]*[BMK]?)\s*', re.DOTALL)


def _parse_rows(html: str) -> dict[str, float]:
    """Return {slug: change_pct_float} for all rows in the Finviz group table."""
    rows: dict[str, float] = {}
    for match in _ROW_RE.finditer(html):
        slug = match.group(1)
        tail = match.group(2)
        cells = _CELL_RE.findall(tail)
        if len(cells) <= _CHANGE_CELL_INDEX:
            continue
        raw = cells[_CHANGE_CELL_INDEX].strip().rstrip("%")
        try:
            rows[slug] = float(raw)
        except ValueError:
            continue
    return rows


def fetch_us_sector_tiles() -> list[SectorTile]:
    """Return the 5 canonical US sector tiles scraped from Finviz.

    Any bucket whose upstream row is missing or unparseable is dropped; the
    caller decides how to handle partial data.
    """
    tiles: dict[str, SectorTile] = {}

    try:
        sector_html = _fetch(_FINVIZ_SECTOR_URL)
        sector_rows = _parse_rows(sector_html)
    except Exception:
        sector_rows = {}
    for slug, bucket in _SECTOR_SLUG_TO_BUCKET.items():
        if slug in sector_rows:
            tiles[bucket] = SectorTile(bucket, sector_rows[slug], "finviz-sector")

    try:
        industry_html = _fetch(_FINVIZ_INDUSTRY_URL)
        industry_rows = _parse_rows(industry_html)
    except Exception:
        industry_rows = {}
    for slug, bucket in _INDUSTRY_SLUG_TO_BUCKET.items():
        if slug in industry_rows:
            tiles[bucket] = SectorTile(bucket, industry_rows[slug], "finviz-industry")

    return [tiles[b] for b in _CANONICAL_ORDER if b in tiles]


# Finviz v=120 (Valuation) row cells after the <a>Name</a> link:
#   0: Market Cap    1: P/E         2: Fwd P/E      3: PEG
#   4: P/S           5: P/B         6: P/C          7: P/FCF
#   8: EPS past 5Y   9: EPS next 5Y 10: Sales past 5Y
#   11: Change       12: Volume
_VALUATION_FIELDS = {
    "pe": 1,
    "fwd_pe": 2,
    "peg": 3,
    "ps": 4,
    "pb": 5,
    "eps_growth_past_5y": 8,
    "eps_growth_next_5y": 9,
    "sales_growth_past_5y": 10,
}


_ROW_RE_ROWBOUNDED = re.compile(
    r'f=(?:sec|ind)_([a-z]+)[^"\']*["\'][^>]*class="tab-link">[^<]+</a>(.*?)</tr>',
    re.DOTALL,
)


def _parse_float(raw: str) -> float | None:
    value = raw.strip().rstrip("%").replace(",", "")
    if not value or value == "-":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_valuation_rows(html: str) -> dict[str, dict[str, float]]:
    """Return {sector_slug: {pe, fwd_pe, peg, ps, pb, ...}}."""
    rows: dict[str, dict[str, float]] = {}
    for match in _ROW_RE_ROWBOUNDED.finditer(html):
        slug = match.group(1)
        tail = match.group(2)
        cells = _CELL_RE.findall(tail)
        metrics: dict[str, float] = {}
        for field, idx in _VALUATION_FIELDS.items():
            if idx < len(cells):
                parsed = _parse_float(cells[idx])
                if parsed is not None:
                    metrics[field] = parsed
        if metrics:
            rows[slug] = metrics
    return rows


def fetch_us_sector_benchmarks() -> dict[str, dict[str, float]]:
    """Return per-Finviz-sector valuation benchmarks used as peer medians.

    Keyed by the Finviz sector slug (e.g. 'technology', 'financial',
    'healthcare') — matches the slugs used in quote-page sector links, which
    lets the scoring layer resolve a stock's peer row directly.
    """
    html = _fetch(_FINVIZ_SECTOR_VALUATION_URL)
    return _parse_valuation_rows(html)


# ─────────────────────────── India (NSE) ─────────────────────────────────────

# NSE index name → short display label for the heatmap / sector strip.
# Only the 9 most-watched sectoral indices are shown. The full `allIndices`
# response contains 100+ indices; everything not in this map is dropped.
_NSE_SECTOR_MAP: dict[str, str] = {
    "NIFTY IT":                "IT",
    "NIFTY BANK":              "Banks",
    "NIFTY FMCG":              "FMCG",
    "NIFTY PHARMA":            "Pharma",
    "NIFTY AUTO":              "Auto",
    "NIFTY METAL":             "Metal",
    "NIFTY REALTY":            "Realty",
    "NIFTY OIL & GAS":         "Oil & Gas",
    "NIFTY FINANCIAL SERVICES": "Financial",
    "NIFTY HEALTHCARE INDEX":  "Healthcare",
}

_NSE_ALL_INDICES_URL = "https://www.nseindia.com/api/allIndices"
_NSE_PRIME_URL = "https://www.nseindia.com/market-data/live-market-indices"


def _nse_opener() -> object:
    """Build a cookie-jar opener primed for NSE JSON endpoints."""
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    opener.addheaders = [
        ("User-Agent", _USER_AGENT),
        ("Accept", "application/json, text/html, */*"),
        ("Accept-Language", "en-US,en;q=0.9"),
        ("Referer", _NSE_PRIME_URL),
    ]
    # NSE requires a real browser cookie from the HTML page before it serves JSON.
    opener.open(_NSE_PRIME_URL, timeout=20).read()
    time.sleep(0.8)
    return opener


def fetch_in_sector_tiles() -> list[SectorTile]:
    """Fetch sectoral index day-changes from NSE allIndices API.

    Returns one SectorTile per entry in _NSE_SECTOR_MAP, sorted largest-to-
    smallest day change so the heatmap's natural sort is consistent with the
    caller's contract.
    """
    opener = _nse_opener()
    resp = opener.open(_NSE_ALL_INDICES_URL, timeout=20)
    data = json.loads(resp.read().decode("utf-8"))
    tiles: list[SectorTile] = []
    for idx in data.get("data", []):
        nse_name = str(idx.get("index", "")).strip()
        label = _NSE_SECTOR_MAP.get(nse_name)
        if not label:
            continue
        try:
            change_pct = float(idx.get("percentChange", 0.0))
        except (TypeError, ValueError):
            change_pct = 0.0
        tiles.append(SectorTile(label=label, change_pct=change_pct, source="nse-allindices"))
    tiles.sort(key=lambda t: t.change_pct, reverse=True)
    return tiles


def sector_tiles_for_market(market: str) -> list[SectorTile]:
    if market == "US":
        return fetch_us_sector_tiles()
    if market == "IN":
        return fetch_in_sector_tiles()
    return []


def _smoke() -> None:
    for tile in fetch_us_sector_tiles():
        print(f"{tile.label:8s} {tile.change_pct:+.2f}%   ({tile.source})")
    print("\nSector benchmarks (Finviz v=120):")
    for slug, metrics in fetch_us_sector_benchmarks().items():
        print(f"  {slug:25s} {metrics}")


if __name__ == "__main__":
    _smoke()
