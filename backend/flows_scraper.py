"""Institutional fund flow scrapers (IN: FII/DII; US placeholder).

NSE publishes FII/FPI + DII net buy/sell in Cr at the end of each trading day
via an unauthenticated JSON endpoint. We normalize it into a simple shape the
dashboard can render directly.

The endpoint sometimes rejects direct hits with 401; we prime a cookie jar by
touching the HTML page first, which has always been enough in practice.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from typing import Any
from urllib.request import HTTPCookieProcessor, Request, build_opener

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _nse_json(url: str) -> Any:
    """Hit NSE with a shared cookie jar — a bare request returns 401."""
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    opener.addheaders = [
        ("User-Agent", _USER_AGENT),
        ("Accept", "application/json, */*"),
        ("Referer", "https://www.nseindia.com/reports/fii-dii"),
        ("Accept-Language", "en-US,en;q=0.9"),
    ]
    # Warm-up: fetch the HTML first so the api request has the right cookies.
    opener.open("https://www.nseindia.com/reports/fii-dii", timeout=20).read()
    with opener.open(url, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


@dataclass
class InstitutionalFlow:
    market: str
    snapshot_date: str
    source: str
    flows: list[dict[str, Any]]  # [{category, buy, sell, net, ...}]

    def to_dict(self) -> dict[str, Any]:
        return {
            "market": self.market,
            "snapshot_date": self.snapshot_date,
            "source": self.source,
            "flows": self.flows,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }


def _parse_nse_date(text: str) -> str:
    """NSE gives dates like '20-Apr-2026'; normalize to ISO."""
    try:
        return datetime.strptime(text.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def fetch_in_flows() -> InstitutionalFlow:
    data = _nse_json("https://www.nseindia.com/api/fiidiiTradeReact")
    if not isinstance(data, list) or not data:
        raise RuntimeError("NSE FII/DII endpoint returned no rows")
    snapshot_date = _parse_nse_date(str(data[0].get("date", ""))) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    flows: list[dict[str, Any]] = []
    for row in data:
        category = str(row.get("category", "")).strip()
        # Normalize "FII/FPI" → "FII" for consistency. Everyone outside NSE just
        # says "FII".
        canonical = "FII" if "FII" in category.upper() else category.upper()
        try:
            buy = float(row.get("buyValue"))
            sell = float(row.get("sellValue"))
            net = float(row.get("netValue"))
        except (TypeError, ValueError):
            continue
        flows.append({
            "category": canonical,
            "category_label": category,
            "buy_cr": buy,
            "sell_cr": sell,
            "net_cr": net,
            "direction": "inflow" if net > 0 else "outflow" if net < 0 else "flat",
        })
    return InstitutionalFlow(
        market="IN",
        snapshot_date=snapshot_date,
        source="NSE FII/DII Trade Activity",
        flows=flows,
    )


def fetch_flows(market: str) -> InstitutionalFlow:
    m = market.upper()
    if m == "IN":
        return fetch_in_flows()
    raise ValueError(f"Unsupported market for institutional flows: {market}")
