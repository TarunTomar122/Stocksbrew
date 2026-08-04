"""Free-source stock facts for the stock detail page."""
from __future__ import annotations

import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
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
STOCKANALYSIS_USER_AGENT = os.getenv(
    "STOCKANALYSIS_USER_AGENT",
    "Stocksbrew/1.0 contact@stocksbrew.online",
)
STOCKANALYSIS_MIN_INTERVAL_SECONDS = max(
    0.0,
    float(os.getenv("STOCKANALYSIS_MIN_INTERVAL_SECONDS", "1.0")),
)
STOCKANALYSIS_MAX_ATTEMPTS = max(
    1,
    int(os.getenv("STOCKANALYSIS_MAX_ATTEMPTS", "5")),
)
_stockanalysis_rate_lock = threading.Lock()
_stockanalysis_next_request_at = 0.0


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


def _reserve_stockanalysis_request(*, cooldown_seconds: float = 0.0) -> None:
    """Serialize StockAnalysis traffic across workers and honor shared cooldowns."""
    global _stockanalysis_next_request_at

    with _stockanalysis_rate_lock:
        now = time.monotonic()
        if cooldown_seconds > 0:
            _stockanalysis_next_request_at = max(
                _stockanalysis_next_request_at,
                now + cooldown_seconds,
            )
            return
        request_at = max(now, _stockanalysis_next_request_at)
        _stockanalysis_next_request_at = (
            request_at + STOCKANALYSIS_MIN_INTERVAL_SECONDS
        )
    wait_seconds = request_at - now
    if wait_seconds > 0:
        time.sleep(wait_seconds)


def _get_stockanalysis_text(url: str) -> str:
    """Fetch one source page without turning a large weekly run into a 429 storm."""
    for attempt in range(STOCKANALYSIS_MAX_ATTEMPTS):
        _reserve_stockanalysis_request()
        response = requests.get(
            url,
            headers={
                **_headers(),
                "User-Agent": STOCKANALYSIS_USER_AGENT,
            },
            timeout=25,
        )
        if response.status_code != 429:
            response.raise_for_status()
            return response.text

        if attempt + 1 >= STOCKANALYSIS_MAX_ATTEMPTS:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After", "").strip()
        try:
            cooldown_seconds = max(1.0, float(retry_after))
        except ValueError:
            cooldown_seconds = min(60.0, 10.0 * (2**attempt))
        _reserve_stockanalysis_request(cooldown_seconds=cooldown_seconds)

    raise RuntimeError("StockAnalysis request attempts exhausted")


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


def _parse_forward_event_date(value: str | None) -> str | None:
    """Parse source event labels and keep only plausible forward dates.

    Finviz commonly emits values like "Mar 18 AMC" without a year. If that
    month/day is already months behind us, it is a stale event and should not
    be presented as "Next earnings". Near year-end, a Jan date can legitimately
    mean next year, so we allow a small rollover window.
    """
    if not value:
        return None
    text = str(value).strip().split("/")[0].strip()
    if not text or text.upper() in {"-", "N/A", "NA", "NONE"}:
        return None

    text = re.sub(r"\s+(AMC|BMO|TAS|DMH)$", "", text, flags=re.I).strip()
    today = datetime.now(timezone.utc).date()

    for fmt in ("%Y-%m-%d", "%b %d %Y", "%b %d"):
        try:
            parsed = datetime.strptime(text, fmt).date()
        except ValueError:
            continue

        if fmt == "%b %d":
            parsed = parsed.replace(year=today.year)
            if parsed < today:
                rolled = parsed.replace(year=today.year + 1)
                if rolled - today > timedelta(days=180):
                    return None
                parsed = rolled

        if parsed < today or parsed - today > timedelta(days=180):
            return None
        return parsed.isoformat()
    return None


def _parse_millions(value: str | None) -> float | None:
    parsed = _parse_number(value)
    return round(parsed * 1_000_000.0, 4) if parsed is not None else None


def _stockanalysis_soup(ticker: str, suffix: str) -> BeautifulSoup:
    # StockAnalysis keeps exchange-style dots for share classes (for example
    # BF.B), unlike Yahoo and Finviz which use a hyphen.
    slug = ticker.lower()
    return BeautifulSoup(
        _get_stockanalysis_text(f"https://stockanalysis.com/stocks/{slug}/{suffix}"),
        "html.parser",
    )


def _table_heading(table: Any) -> str:
    heading = table.find_previous(["h1", "h2", "h3"])
    return _clean_cell(heading.get_text(" ", strip=True)) if heading else ""


def _table_matrix(table: Any) -> list[list[str]]:
    matrix: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = [
            _clean_cell(cell.get_text(" ", strip=True))
            for cell in tr.find_all(["th", "td"])
        ]
        if cells:
            matrix.append(cells)
    return matrix


def _table_for_heading(soup: BeautifulSoup, heading: str) -> Any | None:
    wanted = heading.strip().lower()
    for table in soup.find_all("table"):
        if _table_heading(table).strip().lower() == wanted:
            return table
    return None


def _rows_by_label(table: Any | None) -> dict[str, list[str]]:
    if table is None:
        return {}
    return {row[0]: row[1:] for row in _table_matrix(table) if len(row) > 1}


def _row_values(rows: dict[str, list[str]], label: str) -> list[str]:
    exact = rows.get(label)
    if exact is not None:
        return exact
    prefix = f"{label} "
    for key, values in rows.items():
        if key.startswith(prefix):
            return values
    return []


def _value_at(values: list[str], index: int, parser: Any) -> Any:
    if index >= len(values):
        return None
    return parser(values[index])


def _parse_stockanalysis_statistics(ticker: str) -> dict[str, Any]:
    soup = _stockanalysis_soup(ticker, "statistics/")

    def table_value(heading: str, label: str, parser: Any = _parse_number) -> Any:
        rows = _rows_by_label(_table_for_heading(soup, heading))
        values = _row_values(rows, label)
        return parser(values[0]) if values else None

    return {
        "valuation": {
            "forward_pe": table_value("Valuation Ratios", "Forward PE"),
            "price_to_sales": table_value("Valuation Ratios", "PS Ratio"),
            "price_to_fcf": table_value("Valuation Ratios", "P/FCF Ratio"),
            "ev_to_ebitda": table_value("Enterprise Valuation", "EV / EBITDA"),
        },
        "quality": {
            "roic_pct": table_value("Financial Efficiency", "Return on Invested Capital (ROIC)", _parse_percent),
            "roe_pct": table_value("Financial Efficiency", "Return on Equity (ROE)", _parse_percent),
            "debt_to_equity": table_value("Financial Position", "Debt / Equity"),
            "current_ratio": table_value("Financial Position", "Current Ratio"),
        },
        "dividends": {
            "annual_dividend": table_value("Dividends & Yields", "Dividend Per Share"),
            "yield_pct": table_value("Dividends & Yields", "Dividend Yield", _parse_percent),
            "payout_ratio_pct": table_value("Dividends & Yields", "Payout Ratio", _parse_percent),
            "growth_pct": table_value("Dividends & Yields", "Dividend Growth (YoY)", _parse_percent),
            "growth_years": table_value("Dividends & Yields", "Years of Dividend Growth"),
            "buyback_yield_pct": table_value("Dividends & Yields", "Buyback Yield", _parse_percent),
            "shareholder_yield_pct": table_value("Dividends & Yields", "Shareholder Yield", _parse_percent),
            "next_ex_dividend_date": table_value("Important Dates", "Ex-Dividend Date", str),
        },
    }


def _parse_stockanalysis_dividends(ticker: str) -> dict[str, Any]:
    soup = _stockanalysis_soup(ticker, "dividend/")
    table = _table_for_heading(soup, "Dividend History")
    if table is None:
        return {"history": []}
    rows = _table_matrix(table)
    history: list[dict[str, Any]] = []
    for row in rows[1:13]:
        if len(row) < 2:
            continue
        amount = _parse_number(row[1])
        if not row[0] or amount is None:
            continue
        history.append({
            "ex_date": row[0],
            "amount": amount,
            "record_date": row[2] if len(row) > 2 else None,
            "pay_date": row[3] if len(row) > 3 else None,
        })
    return {"history": history}


def _parse_mix_table(table: Any | None) -> dict[str, Any] | None:
    if table is None:
        return None
    rows = _table_matrix(table)
    if len(rows) < 2 or len(rows[0]) < 2:
        return None
    period = rows[0][1]
    items: list[dict[str, Any]] = []
    for row in rows[1:]:
        if len(row) < 2:
            continue
        name = row[0].strip()
        if not name or "growth" in name.lower() or name.lower() in {"total", "revenue (total)"}:
            continue
        value = _parse_number(row[1])
        if value is None or value <= 0:
            continue
        items.append({"name": name, "value": value})
    items = items[:10]
    total = sum(float(item["value"]) for item in items)
    if total <= 0:
        return None
    for item in items:
        item["share_pct"] = round(float(item["value"]) / total * 100.0, 2)
    return {"period": period, "items": items}


def _parse_stockanalysis_metrics(ticker: str) -> dict[str, Any]:
    soup = _stockanalysis_soup(ticker, "metrics/")
    return {
        "business_segments": _parse_mix_table(_table_for_heading(soup, "Revenue by Segment")),
        "geographic_mix": _parse_mix_table(_table_for_heading(soup, "Revenue by Geography")),
    }


def _parse_stockanalysis_forecast(ticker: str) -> dict[str, Any]:
    soup = _stockanalysis_soup(ticker, "forecast/")
    target_rows = _rows_by_label(_table_for_heading(soup, "Price Target"))
    prices = _row_values(target_rows, "Price")
    target = {
        "low": _value_at(prices, 0, _parse_number),
        "average": _value_at(prices, 1, _parse_number),
        "median": _value_at(prices, 2, _parse_number),
        "high": _value_at(prices, 3, _parse_number),
    }

    trend_table = _table_for_heading(soup, "Recommendation Trends")
    trend_rows = _table_matrix(trend_table) if trend_table is not None else []
    trend: list[dict[str, Any]] = []
    if trend_rows and len(trend_rows[0]) > 1:
        periods = trend_rows[0][1:]
        series = {row[0].strip().lower().replace(" ", "_"): row[1:] for row in trend_rows[1:] if len(row) > 1}
        for index, period in enumerate(periods):
            trend.append({
                "period": period,
                "strong_buy": _value_at(series.get("strong_buy", []), index, _parse_number),
                "buy": _value_at(series.get("buy", []), index, _parse_number),
                "hold": _value_at(series.get("hold", []), index, _parse_number),
                "sell": _value_at(series.get("sell", []), index, _parse_number),
                "strong_sell": _value_at(series.get("strong_sell", []), index, _parse_number),
            })
    return {"target": target, "recommendation_trend": trend[-12:]}


def _parse_finviz_snapshot(ticker: str) -> dict[str, Any]:
    finviz_ticker = ticker.replace(".", "-")
    html = _get_text(f"https://finviz.com/quote.ashx?t={finviz_ticker}&p=d")
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

    earnings_label = raw.get("Earnings")
    earnings_date = _parse_forward_event_date(earnings_label)

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
                "date": earnings_date,
                "date_label": earnings_label,
                "source": "finviz",
            }
        ] if earnings_date and earnings_label else [],
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
    soup = _stockanalysis_soup(ticker, "financials/")
    profit_table = _table_for_heading(soup, "Revenue & Profits")
    if profit_table is None:
        return {}
    profit_rows = _rows_by_label(profit_table)
    cash_rows = _rows_by_label(_table_for_heading(soup, "Cash & Debt"))
    cashflow_rows = _rows_by_label(_table_for_heading(soup, "Cash Flow & CapEx"))
    margin_rows = _rows_by_label(_table_for_heading(soup, "Margins"))
    valuation_rows = _rows_by_label(_table_for_heading(soup, "Valuation"))
    matrix = _table_matrix(profit_table)
    fiscal_years = matrix[0][1:7] if matrix and matrix[0][0] == "Fiscal Year" else []

    revenue = _row_values(profit_rows, "Revenue")
    revenue_growth = _row_values(profit_rows, "Revenue Growth")
    gross_profit = _row_values(profit_rows, "Gross Profit")
    operating_income = _row_values(profit_rows, "Operating Income")
    net_income = _row_values(profit_rows, "Net Income")
    eps = _row_values(profit_rows, "Earnings Per Share") or _row_values(profit_rows, "EPS (Diluted)")
    free_cash_flow = _row_values(cashflow_rows, "Free Cash Flow")
    gross_margin = _row_values(margin_rows, "Gross Margin")
    operating_margin = _row_values(margin_rows, "Operating Margin")
    profit_margin = _row_values(margin_rows, "Profit Margin")

    history: list[dict[str, Any]] = []
    for index, period in enumerate(fiscal_years[:6]):
        point = {
            "period": period,
            "revenue": _value_at(revenue, index, _parse_millions),
            "gross_profit": _value_at(gross_profit, index, _parse_millions),
            "operating_income": _value_at(operating_income, index, _parse_millions),
            "net_income": _value_at(net_income, index, _parse_millions),
            "eps_diluted": _value_at(eps, index, _parse_number),
            "free_cash_flow": _value_at(free_cash_flow, index, _parse_millions),
            "gross_margin_pct": _value_at(gross_margin, index, _parse_percent),
            "operating_margin_pct": _value_at(operating_margin, index, _parse_percent),
            "profit_margin_pct": _value_at(profit_margin, index, _parse_percent),
        }
        if any(value is not None for key, value in point.items() if key != "period"):
            history.append(point)

    latest = history[0] if history else {}
    return {
        "financials": {
            "fiscal_year": fiscal_years[0] if fiscal_years else None,
            "revenue": latest.get("revenue"),
            "revenue_growth_yoy_pct": _value_at(revenue_growth, 0, _parse_percent),
            "gross_profit": latest.get("gross_profit"),
            "operating_income": latest.get("operating_income"),
            "net_income": latest.get("net_income"),
            "eps_diluted": latest.get("eps_diluted"),
            "free_cash_flow": latest.get("free_cash_flow"),
            "source": "stockanalysis",
        },
        "financial_history": history,
        "balance": {
            "cash_and_investments": _value_at(_row_values(cash_rows, "Cash & Investments"), 0, _parse_millions),
            "total_debt": _value_at(_row_values(cash_rows, "Total Debt"), 0, _parse_millions),
            "net_cash": _value_at(_row_values(cash_rows, "Net Cash (Debt)"), 0, _parse_millions),
        },
        "valuation": {
            "forward_pe": _value_at(_row_values(valuation_rows, "Forward PE"), 0, _parse_number),
            "price_to_sales": _value_at(_row_values(valuation_rows, "PS Ratio"), 0, _parse_number),
            "price_to_fcf": _value_at(_row_values(valuation_rows, "P/FCF Ratio"), 0, _parse_number),
        },
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


def _finite_number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or parsed in {float("inf"), float("-inf")}:
        return None
    return parsed


def _frame_value(frame: Any, row_name: str, column: Any) -> float | None:
    try:
        return _finite_number(frame.loc[row_name, column])
    except (KeyError, TypeError, ValueError):
        return None


def _first_frame_value(frame: Any, row_names: tuple[str, ...], column: Any) -> float | None:
    for row_name in row_names:
        value = _frame_value(frame, row_name, column)
        if value is not None:
            return value
    return None


def _yahoo_period_label(column: Any) -> str:
    if hasattr(column, "year"):
        return str(column.year)
    text = str(column or "").strip()
    return text[:4] if len(text) >= 4 and text[:4].isdigit() else text


def _build_yahoo_financial_depth(
    *,
    info: dict[str, Any],
    income: Any,
    cashflow: Any,
    balance_sheet: Any,
    recommendations: Any = None,
    price_targets: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize yfinance into the existing source-neutral facts contract."""
    columns = []
    try:
        columns = sorted(list(income.columns), reverse=True)[:5]
    except (AttributeError, TypeError):
        columns = []

    history: list[dict[str, Any]] = []
    for column in reversed(columns):
        revenue = _first_frame_value(income, ("Total Revenue", "Operating Revenue"), column)
        gross_profit = _frame_value(income, "Gross Profit", column)
        operating_income = _frame_value(income, "Operating Income", column)
        net_income = _first_frame_value(
            income,
            ("Net Income", "Net Income Common Stockholders"),
            column,
        )
        eps = _first_frame_value(income, ("Diluted EPS", "Basic EPS"), column)
        free_cash_flow = _frame_value(cashflow, "Free Cash Flow", column)
        if free_cash_flow is None:
            operating_cash = _first_frame_value(
                cashflow,
                ("Operating Cash Flow", "Total Cash From Operating Activities"),
                column,
            )
            capex = _first_frame_value(
                cashflow,
                ("Capital Expenditure", "Capital Expenditures"),
                column,
            )
            if operating_cash is not None and capex is not None:
                free_cash_flow = operating_cash + capex if capex < 0 else operating_cash - capex
        row = {
            "period": _yahoo_period_label(column),
            "revenue": revenue,
            "gross_profit": gross_profit,
            "operating_income": operating_income,
            "net_income": net_income,
            "eps_diluted": eps,
            "free_cash_flow": free_cash_flow,
            "gross_margin_pct": round(gross_profit / revenue * 100, 4)
            if revenue and gross_profit is not None
            else None,
            "operating_margin_pct": round(operating_income / revenue * 100, 4)
            if revenue and operating_income is not None
            else None,
            "profit_margin_pct": round(net_income / revenue * 100, 4)
            if revenue and net_income is not None
            else None,
        }
        if any(value is not None for key, value in row.items() if key != "period"):
            history.append(row)

    balance_columns = []
    try:
        balance_columns = list(balance_sheet.columns)
    except (AttributeError, TypeError):
        pass
    latest_balance_column = balance_columns[0] if balance_columns else None
    cash = (
        _first_frame_value(
            balance_sheet,
            (
                "Cash Cash Equivalents And Short Term Investments",
                "Cash And Cash Equivalents",
                "Cash",
            ),
            latest_balance_column,
        )
        if latest_balance_column is not None
        else None
    )
    debt = (
        _first_frame_value(balance_sheet, ("Total Debt", "Long Term Debt"), latest_balance_column)
        if latest_balance_column is not None
        else None
    )

    market_cap = _finite_number(info.get("marketCap"))
    free_cash_flow_ttm = _finite_number(info.get("freeCashflow"))
    price_to_fcf = (
        market_cap / free_cash_flow_ttm
        if market_cap and free_cash_flow_ttm and free_cash_flow_ttm > 0
        else None
    )
    debt_to_equity = _finite_number(info.get("debtToEquity"))
    if debt_to_equity is not None and debt_to_equity > 10:
        debt_to_equity /= 100.0

    target = price_targets or {}
    recommendation_trend: list[dict[str, Any]] = []
    try:
        for period, row in recommendations.tail(6).iterrows():
            recommendation_trend.append(
                {
                    "period": str(period),
                    "strong_buy": int(row.get("strongBuy") or 0),
                    "buy": int(row.get("buy") or 0),
                    "hold": int(row.get("hold") or 0),
                    "sell": int(row.get("sell") or 0),
                    "strong_sell": int(row.get("strongSell") or 0),
                }
            )
    except (AttributeError, TypeError, ValueError):
        recommendation_trend = []

    return {
        "financial_history": history,
        "financials": {
            **(history[-1] if history else {}),
            "source": "yfinance",
        },
        "balance": {
            "cash_and_investments": cash,
            "total_debt": debt,
            "net_cash": cash - debt if cash is not None and debt is not None else None,
        },
        "valuation": {
            "forward_pe": _finite_number(info.get("forwardPE")),
            "price_to_sales": _finite_number(info.get("priceToSalesTrailing12Months")),
            "price_to_fcf": round(price_to_fcf, 4) if price_to_fcf is not None else None,
            "ev_to_ebitda": _finite_number(info.get("enterpriseToEbitda")),
        },
        "quality": {
            "roic_pct": None,
            "roe_pct": (
                round(float(info["returnOnEquity"]) * 100, 4)
                if _finite_number(info.get("returnOnEquity")) is not None
                else None
            ),
            "debt_to_equity": debt_to_equity,
            "current_ratio": _finite_number(info.get("currentRatio")),
        },
        "analyst_trend": {
            "target": {
                "low": _finite_number(target.get("low")),
                "average": _finite_number(target.get("mean")),
                "median": _finite_number(target.get("median")),
                "high": _finite_number(target.get("high")),
            },
            "recommendation_trend": recommendation_trend,
        },
    }


def _fetch_yahoo_financial_depth(instrument: dict[str, Any]) -> dict[str, Any]:
    ticker = yf.Ticker(yahoo_symbol_for(instrument))
    return _build_yahoo_financial_depth(
        info=ticker.info or {},
        income=ticker.income_stmt,
        cashflow=ticker.cashflow,
        balance_sheet=ticker.balance_sheet,
        recommendations=ticker.recommendations_summary,
        price_targets=ticker.analyst_price_targets or {},
    )


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
    financial_history: list[dict[str, Any]] = []
    balance: dict[str, Any] = {}
    valuation: dict[str, Any] = {}
    quality: dict[str, Any] = {}
    dividends: dict[str, Any] = {}
    business_segments: dict[str, Any] | None = None
    geographic_mix: dict[str, Any] | None = None
    analyst_trend: dict[str, Any] = {}
    used_yahoo_depth = False

    for label, fn in (
        ("finviz", lambda: _parse_finviz_snapshot(ticker)),
        ("nasdaq_analyst", lambda: _parse_nasdaq_analyst(ticker)),
        ("nasdaq_institutions", lambda: _parse_nasdaq_institutions(ticker)),
        ("stockanalysis_financials", lambda: _parse_stockanalysis_financials(ticker)),
        ("stockanalysis_statistics", lambda: _parse_stockanalysis_statistics(ticker)),
        ("stockanalysis_dividends", lambda: _parse_stockanalysis_dividends(ticker)),
        ("stockanalysis_metrics", lambda: _parse_stockanalysis_metrics(ticker)),
        ("stockanalysis_forecast", lambda: _parse_stockanalysis_forecast(ticker)),
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
            financials = result.get("financials") or {}
            financial_history = result.get("financial_history") or []
            balance = result.get("balance") or {}
            valuation.update(result.get("valuation") or {})
        elif label == "stockanalysis_statistics":
            valuation.update({key: value for key, value in (result.get("valuation") or {}).items() if value is not None})
            quality = result.get("quality") or {}
            dividends.update(result.get("dividends") or {})
        elif label == "stockanalysis_dividends":
            dividends.update(result)
        elif label == "stockanalysis_metrics":
            business_segments = result.get("business_segments")
            geographic_mix = result.get("geographic_mix")
        elif label == "stockanalysis_forecast":
            analyst_trend = result

    # StockAnalysis has the best presentation-oriented tables, but ADRs and
    # newly listed companies can be absent or temporarily blocked. Fill only
    # missing sections from Yahoo so a source outage cannot erase good saved
    # data or fabricate unsupported business/geographic mixes.
    if not financial_history or not balance or not valuation or not quality:
        try:
            yahoo_depth = _fetch_yahoo_financial_depth(instrument)
            used_yahoo_depth = True
        except Exception as exc:
            errors.append(f"yfinance_depth: {exc}")
            yahoo_depth = {}
        if not financial_history:
            financial_history = yahoo_depth.get("financial_history") or []
        if not financials:
            financials = yahoo_depth.get("financials") or {}
        for key, value in (yahoo_depth.get("balance") or {}).items():
            if value is not None:
                balance.setdefault(key, value)
        for key, value in (yahoo_depth.get("valuation") or {}).items():
            if value is not None:
                valuation.setdefault(key, value)
        for key, value in (yahoo_depth.get("quality") or {}).items():
            if value is not None:
                quality.setdefault(key, value)
        if not analyst_trend:
            analyst_trend = yahoo_depth.get("analyst_trend") or {}

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
        "financial_history": financial_history,
        "balance": balance,
        "valuation": valuation,
        "quality": quality,
        "dividends": dividends,
        "business_segments": business_segments,
        "geographic_mix": geographic_mix,
        "analyst_trend": analyst_trend,
        "institutions": institutions,
        "source_status": {
            "sources": [
                "finviz",
                "nasdaq",
                "stockanalysis",
                *(["yfinance"] if used_yahoo_depth else []),
            ],
            "errors": errors,
        },
    }
