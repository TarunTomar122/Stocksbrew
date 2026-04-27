"""Finviz quote-page scraper.

Finviz renders a stock's pre-computed technicals — RSI (14), SMA20/50/200,
ATR, beta, etc. — as a static HTML table on every quote page:

    https://finviz.com/quote.ashx?t=AAPL

We only need RSI for the heat-list signal. One GET per ticker (~30 KB),
parsed with a regex against the `snapshot-td2` cells. Concurrent fetches
via ThreadPoolExecutor; no auth, no API key.
"""
from __future__ import annotations

import random
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests


FINVIZ_URL = "https://finviz.com/quote.ashx?t={ticker}"

# A modern UA — Finviz returns 403 to default `python-requests`.
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}

# Finviz's snapshot now uses tailwind-style classes; the cell pattern is
# (with all the inner spans stripped):
#   <td>... LABEL </td><td class="snapshot-td2 ..."> ... VALUE ...</td>
#
# Practical strategy: find each label, then search forward for the next
# `<td class="snapshot-td2 ...">` and pull out the deepest text node in it.
LABEL_TO_VALUE_RE = re.compile(
    r'>([A-Za-z][A-Za-z0-9 ./()%\-]+?)</(?:div|td)></td>\s*'
    r'<td[^>]*class="[^"]*snapshot-td2[^"]*"[^>]*>(.*?)</td>',
    re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(html: str) -> str:
    return TAG_RE.sub("", html).strip()


def _parse_snapshot(html: str) -> dict[str, str]:
    """Return a {label: raw_value} map from the snapshot table."""
    out: dict[str, str] = {}
    for label, raw in LABEL_TO_VALUE_RE.findall(html):
        key = label.strip()
        value = _strip_tags(raw)
        if key and key not in out:
            out[key] = value
    return out


def _to_float(value: str) -> float | None:
    if not value or value in ("-", "N/A"):
        return None
    cleaned = value.replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _rsi_state_from_value(rsi: float | None) -> str:
    if rsi is None:
        return "insufficient_data"
    if rsi >= 70:
        return "overbought"
    if rsi <= 30:
        return "oversold"
    return "neutral"


def fetch_one_finviz_technicals(
    ticker: str,
    *,
    timeout: float = 8.0,
    session: requests.Session | None = None,
    max_retries: int = 4,
) -> dict[str, Any]:
    """Scrape one Finviz quote page. Returns {"error": ...} if anything fails.

    Retries with exponential backoff on 429 (Too Many Requests). Finviz
    rate-limits bursts hard but recovers within a few seconds, so a short
    backoff lets us scrape the whole universe reliably from one IP.
    """
    sess = session or requests
    delay = 1.0  # seconds; doubles each retry
    last_exc: Exception | None = None

    for attempt in range(max_retries):
        try:
            resp = sess.get(
                FINVIZ_URL.format(ticker=ticker),
                headers=DEFAULT_HEADERS,
                timeout=timeout,
            )
            if resp.status_code == 429:
                # Honour Retry-After when present, otherwise back off ourselves.
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else delay
                time.sleep(wait + random.uniform(0, 0.4))
                delay = min(delay * 2, 16.0)
                continue
            resp.raise_for_status()
            break
        except Exception as exc:
            last_exc = exc
            time.sleep(delay + random.uniform(0, 0.4))
            delay = min(delay * 2, 16.0)
    else:
        return {"ticker": ticker, "error": f"max retries exceeded: {last_exc}"}

    snap = _parse_snapshot(resp.text)
    rsi = _to_float(snap.get("RSI (14)", ""))

    return {
        "ticker": ticker,
        "rsi_14": {
            "value": round(rsi, 2) if rsi is not None else None,
            "state": _rsi_state_from_value(rsi),
        },
        # Bonus: keep these around — useful for future technical signals
        # without paying for another scrape pass.
        "atr": _to_float(snap.get("ATR (14)", "")),
        "beta": _to_float(snap.get("Beta", "")),
        "sma_20_pct": _to_float(snap.get("SMA20", "").rstrip("%")),
        "sma_50_pct": _to_float(snap.get("SMA50", "").rstrip("%")),
        "sma_200_pct": _to_float(snap.get("SMA200", "").rstrip("%")),
    }


def fetch_finviz_technicals_batch(
    tickers: list[str],
    *,
    max_workers: int = 3,
    timeout: float = 8.0,
) -> dict[str, dict[str, Any]]:
    """Concurrently scrape Finviz for many tickers. Keyed by upper-case ticker.

    Failed tickers are present with an `error` key — caller decides whether
    to fall back to another source.
    """
    if not tickers:
        return {}

    upper = sorted({t.strip().upper() for t in tickers if t and t.strip()})
    out: dict[str, dict[str, Any]] = {}
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, len(upper)))) as pool:
        futures = {
            pool.submit(fetch_one_finviz_technicals, ticker, timeout=timeout, session=session): ticker
            for ticker in upper
        }
        for fut in as_completed(futures):
            ticker = futures[fut]
            try:
                out[ticker] = fut.result()
            except Exception as exc:
                out[ticker] = {"ticker": ticker, "error": str(exc)}

    return out
