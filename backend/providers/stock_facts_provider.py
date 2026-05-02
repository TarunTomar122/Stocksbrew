"""Free-source stock facts for the stock detail page."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from html import unescape
from typing import Any

import requests
import yfinance as yf
from bs4 import BeautifulSoup

from backend.providers.yfinance_provider import yahoo_symbol_for
from backend.screener_scraper import fetch_screener_quote
from backend.tickertape_scraper import fetch_tickertape_quote

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _headers(accept: str = "text/html,application/json") -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Accept-Language": "en-US,en;q=0.9",
    }


def _get_text(url: str) -> str:
    response = requests.get(url, headers=_headers(), timeout=25)
    response.raise_for_status()
    return response.text


def _get_json(url: str) -> dict[str, Any]:
    headers = _headers("application/json")
    headers.update({
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/",
    })
    response = requests.get(url, headers=headers, timeout=25)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, dict) else {}
    return data if isinstance(data, dict) else {}


def _clean_cell(value: str) -> str:
    return " ".join(unescape(value).split()).strip()


def _parse_percent(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.replace("%", "").replace(",", "").strip()
    try:
        return round(float(cleaned), 4)
    except ValueError:
        return None


def _parse_number(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = str(value).replace("$", "").replace(",", "").strip()
    if cleaned in {"", "-", "N/A", "NA", "None"}:
        return None

    is_negative = cleaned.startswith("(") and cleaned.endswith(")")
    if is_negative:
        cleaned = cleaned[1:-1].strip()

    multiplier = 1.0
    suffix = cleaned[-1:].upper()
    if suffix == "T":
        multiplier = 1_000_000_000_000.0
        cleaned = cleaned[:-1]
    elif suffix == "B":
        multiplier = 1_000_000_000.0
        cleaned = cleaned[:-1]
    elif suffix == "M":
        multiplier = 1_000_000.0
        cleaned = cleaned[:-1]

    try:
        parsed = float(cleaned) * multiplier
    except ValueError:
        return None
    return round(-parsed if is_negative else parsed, 4)


def _parse_millions(value: str | None) -> float | None:
    parsed = _parse_number(value)
    return round(parsed * 1_000_000.0, 4) if parsed is not None else None


def _parse_finviz_snapshot(ticker: str) -> dict[str, Any]:
    html = _get_text(f"https://finviz.com/quote.ashx?t={ticker}&p=d")
    rows = re.findall(
        r'<td[^>]*class="snapshot-td2[^>]*>(.*?)</td>\s*'
        r'<td[^>]*class="snapshot-td2[^>]*>(.*?)</td>',
        html,
        re.S,
    )
    raw: dict[str, str] = {}
    for key_html, value_html in rows:
        key = _clean_cell(re.sub("<.*?>", "", key_html))
        value = _clean_cell(re.sub("<.*?>", "", value_html))
        if key:
            raw[key] = value

    return {
        "returns": {
            "one_month_pct": _parse_percent(raw.get("Perf Month")),
            "three_month_pct": _parse_percent(raw.get("Perf Quarter")),
            "six_month_pct": _parse_percent(raw.get("Perf Half Y")),
            "one_year_pct": _parse_percent(raw.get("Perf Year")),
        },
        "quick_stats": {
            "market_cap": _parse_number(raw.get("Market Cap")),
            "pe_ttm": _parse_number(raw.get("P/E")),
            "eps_next_year_growth_pct": _parse_percent(raw.get("EPS next Y")),
            "institutional_ownership_pct": _parse_percent(raw.get("Inst Own")),
            "recommendation_score": _parse_number(raw.get("Recom")),
        },
        "events": [
            {
                "kind": "earnings",
                "title": "Earnings",
                "date_label": raw.get("Earnings"),
                "source": "finviz",
            }
        ] if raw.get("Earnings") else [],
        "analyst_hint": {
            "target_price": _parse_number(raw.get("Target Price")),
        },
    }


def _parse_nasdaq_analyst(ticker: str) -> dict[str, Any]:
    data = _get_json(
        "https://api.nasdaq.com/api/analyst/"
        f"{ticker}/targetprice"
    )
    overview = data.get("consensusOverview") or {}
    buy = int(overview.get("buy") or 0)
    hold = int(overview.get("hold") or 0)
    sell = int(overview.get("sell") or 0)
    total = buy + hold + sell
    target = _parse_number(str(overview.get("priceTarget") or ""))
    return {
        "label": "Buy" if buy >= hold and buy >= sell else "Hold",
        "target_price": target,
        "target_low": _parse_number(str(overview.get("lowPriceTarget") or "")),
        "target_high": _parse_number(str(overview.get("highPriceTarget") or "")),
        "buy": buy,
        "hold": hold,
        "sell": sell,
        "analyst_count": total,
        "source": "nasdaq",
    }


def _parse_nasdaq_institutions(ticker: str) -> dict[str, Any]:
    data = _get_json(
        "https://api.nasdaq.com/api/company/"
        f"{ticker}/institutional-holdings?limit=5&type=TOTAL"
    )
    summary = data.get("ownershipSummary") or {}
    tx = data.get("holdingsTransactions") or {}
    table = tx.get("table") or {}
    rows = table.get("rows") or []
    ownership = summary.get("SharesOutstandingPCT") or {}
    total_value = summary.get("TotalHoldingsValue") or {}
    return {
        "ownership_pct": _parse_percent(str(ownership.get("value") or "")),
        "total_value_label": total_value.get("value"),
        "total_holders": tx.get("totalRecords"),
        "top_holders": [
            {
                "name": row.get("ownerName"),
                "date": row.get("date"),
                "shares": row.get("sharesHeld"),
                "change_pct": row.get("sharesChangePCT"),
                "market_value": row.get("marketValue"),
            }
            for row in rows[:5]
            if isinstance(row, dict)
        ],
        "source": "nasdaq",
    }


def _parse_stockanalysis_financials(ticker: str) -> dict[str, Any]:
    slug = ticker.lower().replace(".", "-")
    html = _get_text(f"https://stockanalysis.com/stocks/{slug}/financials/")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        return {}

    rows: dict[str, list[str]] = {}
    fiscal_years: list[str] = []
    for tr in table.find_all("tr"):
        cells = [
            cell.get_text(" ", strip=True)
            for cell in tr.find_all(["th", "td"])
        ]
        if not cells:
            continue
        if cells[0] == "Fiscal Year":
            fiscal_years = cells[1:6]
            continue
        rows[cells[0]] = cells[1:6]

    def latest(label: str) -> str | None:
        values = rows.get(label) or []
        return values[0] if values else None

    return {
        "fiscal_year": fiscal_years[0] if fiscal_years else None,
        "revenue": _parse_millions(latest("Revenue")),
        "revenue_growth_yoy_pct": _parse_percent(latest("Revenue Growth (YoY)")),
        "gross_profit": _parse_millions(latest("Gross Profit")),
        "operating_income": _parse_millions(latest("Operating Income")),
        "net_income": _parse_millions(latest("Net Income")),
        "eps_diluted": _parse_number(latest("EPS (Diluted)")),
        "source": "stockanalysis",
    }


def _history_returns(instrument: dict[str, Any]) -> dict[str, float | None]:
    history = yf.Ticker(yahoo_symbol_for(instrument)).history(
        period="1y",
        interval="1d",
        auto_adjust=False,
    )
    if history is None or getattr(history, "empty", True):
        return {}

    closes = history["Close"].dropna()
    if closes.empty:
        return {}

    latest = float(closes.iloc[-1])

    def pct_back(sessions: int) -> float | None:
        if latest <= 0 or len(closes) <= 1:
            return None
        index = max(0, len(closes) - 1 - sessions)
        base = float(closes.iloc[index])
        if base <= 0:
            return None
        return round(((latest - base) / base) * 100.0, 4)

    return {
        "one_month_pct": pct_back(21),
        "three_month_pct": pct_back(63),
        "six_month_pct": pct_back(126),
        "one_year_pct": pct_back(252),
    }


def _fetch_yahoo_info(instrument: dict[str, Any]) -> dict[str, Any]:
    try:
        return yf.Ticker(yahoo_symbol_for(instrument)).info or {}
    except Exception:
        return {}


def _analyst_label(buy_pct: float | None, target_price: float | None, current_price: float | None) -> str:
    if buy_pct is not None:
        if buy_pct >= 65:
            return "Buy"
        if buy_pct <= 35:
            return "Sell"
        return "Hold"
    if target_price and current_price:
        if target_price >= current_price * 1.1:
            return "Buy"
        if target_price <= current_price * 0.95:
            return "Sell"
        return "Hold"
    return ""


def _fetch_india_stock_facts(instrument: dict[str, Any]) -> dict[str, Any]:
    ticker = str(instrument.get("ticker", "")).upper().strip()
    errors: list[str] = []
    screener = None
    tickertape = None

    try:
        screener = fetch_screener_quote(ticker)
    except Exception as exc:
        errors.append(f"screener: {exc}")

    try:
        tickertape = fetch_tickertape_quote(ticker)
    except Exception as exc:
        errors.append(f"tickertape: {exc}")

    try:
        returns = _history_returns(instrument)
    except Exception as exc:
        errors.append(f"yfinance_history: {exc}")
        returns = {}

    yahoo = _fetch_yahoo_info(instrument)
    metrics: dict[str, float] = {}
    if screener:
        metrics.update(screener.metrics)
    if tickertape:
        for key, value in tickertape.metrics.items():
            metrics.setdefault(key, value)

    target_price = _parse_number(str(yahoo.get("targetMeanPrice") or ""))
    analyst_count = tickertape.analyst_total_reco if tickertape else None
    analyst_buy_pct = tickertape.analyst_buy_pct if tickertape else None
    current_price = metrics.get("price")
    buy_count = (
        round(analyst_count * analyst_buy_pct / 100)
        if analyst_count is not None and analyst_buy_pct is not None
        else 0
    )
    shareholding = screener.shareholding if screener else {}
    institutional_pct = None
    if shareholding:
        institutional_pct = round(
            shareholding.get("fii_pct", 0.0) + shareholding.get("dii_pct", 0.0),
            2,
        )

    quick_stats = {
        "market_cap": metrics.get("market_cap"),
        "pe_ttm": metrics.get("pe") or metrics.get("pe_ttm"),
        "eps_next_year_growth_pct": metrics.get("profit_growth_past_1y"),
        "institutional_ownership_pct": institutional_pct,
        "recommendation_score": (
            round(5 - (analyst_buy_pct / 25), 2)
            if analyst_buy_pct is not None
            else None
        ),
    }

    return {
        "instrument_id": instrument["instrument_id"],
        "market": "IN",
        "ticker": ticker,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "returns": returns,
        "quick_stats": quick_stats,
        "analyst": {
            "label": _analyst_label(analyst_buy_pct, target_price, current_price),
            "target_price": target_price,
            "buy": buy_count,
            "hold": max(0, (analyst_count or 0) - buy_count),
            "sell": 0,
            "analyst_count": analyst_count or 0,
            "source": "tickertape+yahoo",
        },
        "events": [],
        "financials": {
            "revenue": metrics.get("revenue"),
            "revenue_growth_yoy_pct": metrics.get("sales_growth_past_1y"),
            "operating_income": metrics.get("operating_income"),
            "net_income": metrics.get("net_income"),
            "eps_diluted": metrics.get("eps_diluted"),
            "source": "screener",
        },
        "institutions": {
            "ownership_pct": institutional_pct,
            "top_holders": [
                {
                    "name": label,
                    "shares": f"{value:.2f}%",
                    "date": "latest quarter",
                }
                for label, value in (
                    ("Promoters", shareholding.get("promoter_pct")),
                    ("FIIs", shareholding.get("fii_pct")),
                    ("DIIs", shareholding.get("dii_pct")),
                    ("Government", shareholding.get("government_pct")),
                    ("Public", shareholding.get("public_pct")),
                )
                if value is not None
            ],
            "source": "screener",
        },
        "source_status": {
            "sources": ["screener", "tickertape", "yfinance"],
            "errors": errors,
        },
    }


def fetch_stock_facts(instrument: dict[str, Any]) -> dict[str, Any]:
    ticker = str(instrument.get("ticker", "")).upper().strip()
    market = str(instrument.get("market", "US")).upper()
    if not ticker:
        raise ValueError("instrument is missing ticker")
    if market == "IN":
        return _fetch_india_stock_facts(instrument)
    if market != "US":
        raise ValueError(f"stock_facts_provider does not support market={market}")

    errors: list[str] = []
    finviz: dict[str, Any] = {}
    analyst: dict[str, Any] = {}
    institutions: dict[str, Any] = {}
    financials: dict[str, Any] = {}

    for label, fn in (
        ("finviz", lambda: _parse_finviz_snapshot(ticker)),
        ("nasdaq_analyst", lambda: _parse_nasdaq_analyst(ticker)),
        ("nasdaq_institutions", lambda: _parse_nasdaq_institutions(ticker)),
        ("stockanalysis_financials", lambda: _parse_stockanalysis_financials(ticker)),
    ):
        try:
            result = fn()
        except Exception as exc:
            errors.append(f"{label}: {exc}")
            continue
        if label == "finviz":
            finviz = result
        elif label == "nasdaq_analyst":
            analyst = result
        elif label == "nasdaq_institutions":
            institutions = result
        elif label == "stockanalysis_financials":
            financials = result

    if not analyst and finviz.get("analyst_hint"):
        analyst = {
            "target_price": finviz["analyst_hint"].get("target_price"),
            "source": "finviz",
        }

    return {
        "instrument_id": instrument["instrument_id"],
        "market": market,
        "ticker": ticker,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "returns": finviz.get("returns") or {},
        "quick_stats": finviz.get("quick_stats") or {},
        "analyst": analyst,
        "events": finviz.get("events") or [],
        "financials": financials,
        "institutions": institutions,
        "source_status": {
            "sources": ["finviz", "nasdaq", "stockanalysis"],
            "errors": errors,
        },
    }
