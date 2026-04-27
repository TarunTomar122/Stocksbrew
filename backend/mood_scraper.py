"""Market Mood Index scrapers.

US pulls CNN's Fear & Greed JSON endpoint (unofficial but stable — backs the
widget on edition.cnn.com/markets/fear-and-greed). IN pulls Tickertape's MMI
which is embedded in the page's Next.js `__NEXT_DATA__` blob.

Normalized into a single schema so the dashboard can render both the same way:
    score (0-100), rating (extreme_fear|fear|neutral|greed|extreme_greed),
    previous_day / _week / _month, source label.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _fetch(url: str, referer: str | None = None) -> str:
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/json,text/html"}
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


@dataclass
class MoodIndex:
    market: str
    score: float
    rating: str
    source: str
    snapshot_date: str
    previous_day: float | None = None
    previous_week: float | None = None
    previous_month: float | None = None
    previous_year: float | None = None
    components: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "market": self.market,
            "score": round(self.score, 1),
            "rating": self.rating,
            "source": self.source,
            "snapshot_date": self.snapshot_date,
            "previous_day": self.previous_day,
            "previous_week": self.previous_week,
            "previous_month": self.previous_month,
            "previous_year": self.previous_year,
            "components": self.components,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }


def _normalize_rating(score: float) -> str:
    """Our canonical 5-band scale. Matches CNN's breakpoints; Tickertape's
    raw label gets re-derived here so both markets share one vocabulary."""
    if score < 25:
        return "extreme_fear"
    if score < 45:
        return "fear"
    if score < 55:
        return "neutral"
    if score < 75:
        return "greed"
    return "extreme_greed"


def fetch_us_mood() -> MoodIndex:
    """CNN Fear & Greed — unofficial but widely-used endpoint. Their HTML
    widget on edition.cnn.com hits this same URL."""
    url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    body = _fetch(url, referer="https://edition.cnn.com/markets/fear-and-greed")
    data = json.loads(body)
    fg = data.get("fear_and_greed", {})
    score = float(fg.get("score", 50))
    ts = str(fg.get("timestamp", ""))
    snapshot_date = ts[:10] if len(ts) >= 10 else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return MoodIndex(
        market="US",
        score=score,
        rating=_normalize_rating(score),
        source="CNN Fear & Greed",
        snapshot_date=snapshot_date,
        previous_day=fg.get("previous_close"),
        previous_week=fg.get("previous_1_week"),
        previous_month=fg.get("previous_1_month"),
        previous_year=fg.get("previous_1_year"),
    )


_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
    re.DOTALL,
)


def fetch_in_mood() -> MoodIndex:
    """Tickertape MMI — score is embedded in pageProps.nowData."""
    html = _fetch("https://www.tickertape.in/market-mood-index")
    m = _NEXT_DATA_RE.search(html)
    if not m:
        raise RuntimeError("Tickertape MMI page did not contain __NEXT_DATA__")
    data = json.loads(m.group(1))
    now = data.get("props", {}).get("pageProps", {}).get("nowData", {})
    score = float(now.get("currentValue") or now.get("indicator") or 50)
    date_str = str(now.get("date", ""))[:10] or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return MoodIndex(
        market="IN",
        score=score,
        rating=_normalize_rating(score),
        source="Tickertape MMI",
        snapshot_date=date_str,
        previous_day=(now.get("lastDay") or {}).get("indicator"),
        previous_week=(now.get("lastWeek") or {}).get("indicator"),
        previous_month=(now.get("lastMonth") or {}).get("indicator"),
    )


def fetch_mood(market: str) -> MoodIndex:
    m = market.upper()
    if m == "US":
        return fetch_us_mood()
    if m == "IN":
        return fetch_in_mood()
    raise ValueError(f"Unsupported market: {market}")
