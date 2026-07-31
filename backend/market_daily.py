"""Evidence-first generation for the public Market Daily letter.

The writer sees a bounded, timestamped evidence pack. Deterministic gates then
reject unsupported numbers, unknown citations, copied source phrasing, stale
premarket inputs, em dashes, and investment advice before anything is
published.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import json
import math
import os
import re
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import yfinance as yf

from backend.instrument_universe import list_instruments
from backend.llm_client import parse_json_content, post_chat_completion
from backend.storage import TraceMoneyStore
from backend.url_extractor import ExtractedArticle, extract_urls, search_firecrawl_urls


NEW_YORK = ZoneInfo("America/New_York")
IST = ZoneInfo("Asia/Kolkata")
DEFAULT_WRITER_MODEL = "openai/gpt-5.5"
RESEARCH_VERSION = 7

MARKET_SERIES: tuple[tuple[str, str, str], ...] = (
    ("S&P 500", "^GSPC", "index"),
    ("Nasdaq Composite", "^IXIC", "index"),
    ("Russell 2000", "^RUT", "index"),
    ("VIX", "^VIX", "macro"),
    ("10-year Treasury yield", "^TNX", "macro"),
    ("US dollar index", "DX-Y.NYB", "macro"),
    ("WTI crude", "CL=F", "macro"),
    ("Gold", "GC=F", "macro"),
)

FUTURES_SERIES: tuple[tuple[str, str], ...] = (
    ("S&P 500 futures", "ES=F"),
    ("Nasdaq 100 futures", "NQ=F"),
    ("Russell 2000 futures", "RTY=F"),
)

SECTOR_SERIES: tuple[tuple[str, str], ...] = (
    ("Technology", "XLK"),
    ("Financials", "XLF"),
    ("Consumer discretionary", "XLY"),
    ("Consumer staples", "XLP"),
    ("Energy", "XLE"),
    ("Health care", "XLV"),
    ("Industrials", "XLI"),
    ("Materials", "XLB"),
    ("Real estate", "XLRE"),
    ("Utilities", "XLU"),
    ("Communication services", "XLC"),
)

PREFERRED_SOURCE_DOMAINS = (
    "sec.gov",
    "federalreserve.gov",
    "bls.gov",
    "bea.gov",
    "treasury.gov",
    "investor.",
    "reuters.com",
    "apnews.com",
    "cnbc.com",
    "finance.yahoo.com",
    "investopedia.com",
    "bloomberg.com",
    "wsj.com",
    "ft.com",
    "marketwatch.com",
    "barrons.com",
)

PAYWALLED_SOURCE_DOMAINS = (
    "bloomberg.com",
    "wsj.com",
    "barrons.com",
    "ft.com",
)

INVESTMENT_ADVICE_PATTERNS = (
    r"\byou should (?:buy|sell|hold|trim|add)\b",
    r"\bwe recommend\b",
    r"\bstrong buy\b",
    r"\btime to (?:buy|sell)\b",
    r"\bmust-own\b",
)

ARTICLE_COMPONENTS = (
    "{{INDEX_CHART}}",
    "{{SECTOR_CHART}}",
    "{{MARKET_PULSE}}",
    "{{PREMARKET_BOARD}}",
    "{{MOVER_CARDS}}",
    "{{ANOMALY_RAIL}}",
)

ARTICLE_SCHEMA: dict[str, Any] = {
    "name": "market_daily_article",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "headline": {"type": "string"},
            "dek": {"type": "string"},
            "thesis": {"type": "string"},
            "article_markdown": {"type": "string"},
            "source_ids": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["headline", "dek", "thesis", "article_markdown", "source_ids"],
        "additionalProperties": False,
    },
}


@dataclass(slots=True)
class ValidationResult:
    passed: bool
    score: int
    blockers: list[str]
    warnings: list[str]
    word_count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "score": self.score,
            "blockers": self.blockers,
            "warnings": self.warnings,
            "word_count": self.word_count,
        }


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _pct(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous == 0:
        return None
    return round(((current - previous) / previous) * 100.0, 2)


def _iso_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _frame_for_symbol(frame: Any, symbol: str, *, single: bool) -> Any:
    if frame is None or getattr(frame, "empty", True):
        return None
    if single:
        return frame
    try:
        return frame[symbol]
    except (KeyError, TypeError):
        try:
            return frame.xs(symbol, level=1, axis=1)
        except (KeyError, TypeError, ValueError):
            return None


def _download_daily(symbols: list[str], *, start: date, end: date) -> dict[str, Any]:
    frame = yf.download(
        symbols,
        start=start.isoformat(),
        end=end.isoformat(),
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=True,
        group_by="ticker",
    )
    single = len(symbols) == 1
    return {symbol: _frame_for_symbol(frame, symbol, single=single) for symbol in symbols}


def _rows_by_date(frame: Any) -> dict[str, dict[str, float]]:
    rows: dict[str, dict[str, float]] = {}
    if frame is None or getattr(frame, "empty", True):
        return rows
    for index in range(len(frame)):
        row = frame.iloc[index]
        stamp = getattr(row.name, "date", lambda: row.name)()
        key = stamp.isoformat() if hasattr(stamp, "isoformat") else str(stamp)[:10]
        close = _finite(row.get("Close"))
        if close is None:
            continue
        rows[key] = {
            "open": round(_finite(row.get("Open")) or close, 4),
            "high": round(_finite(row.get("High")) or close, 4),
            "low": round(_finite(row.get("Low")) or close, 4),
            "close": round(close, 4),
            "volume": round(_finite(row.get("Volume")) or 0.0, 2),
        }
    return rows


def _session_dates(spx_rows: dict[str, dict[str, float]], edition: date) -> tuple[date, date]:
    available = sorted(_iso_date(key) for key in spx_rows if _iso_date(key) < edition)
    if len(available) < 2:
        raise ValueError(f"Not enough completed S&P 500 sessions before {edition.isoformat()}")
    return available[-1], available[-2]


def build_market_tape(edition_date: str | date) -> dict[str, Any]:
    edition = _iso_date(edition_date)
    start = edition - timedelta(days=140)
    end = edition + timedelta(days=1)
    symbols = [symbol for _, symbol, _ in MARKET_SERIES] + [symbol for _, symbol in SECTOR_SERIES]
    frames = _download_daily(symbols, start=start, end=end)
    rows = {symbol: _rows_by_date(frame) for symbol, frame in frames.items()}
    previous_session, comparison_session = _session_dates(rows["^GSPC"], edition)
    previous_key = previous_session.isoformat()
    comparison_key = comparison_session.isoformat()

    markets: list[dict[str, Any]] = []
    for label, symbol, group in MARKET_SERIES:
        current = rows.get(symbol, {}).get(previous_key)
        prior = rows.get(symbol, {}).get(comparison_key)
        if not current or not prior:
            continue
        markets.append(
            {
                "label": label,
                "symbol": symbol,
                "group": group,
                "session_date": previous_key,
                "close": current["close"],
                "change_pct": _pct(current["close"], prior["close"]),
                "open": current["open"],
                "high": current["high"],
                "low": current["low"],
            }
        )

    sectors: list[dict[str, Any]] = []
    for label, symbol in SECTOR_SERIES:
        current = rows.get(symbol, {}).get(previous_key)
        prior = rows.get(symbol, {}).get(comparison_key)
        if not current or not prior:
            continue
        sectors.append(
            {
                "label": label,
                "symbol": symbol,
                "change_pct": _pct(current["close"], prior["close"]),
                "close": current["close"],
            }
        )
    sectors.sort(key=lambda row: float(row.get("change_pct") or 0), reverse=True)
    positive = sum(1 for row in sectors if float(row.get("change_pct") or 0) > 0)
    negative = sum(1 for row in sectors if float(row.get("change_pct") or 0) < 0)

    def rolling_context(symbol: str) -> dict[str, Any]:
        symbol_rows = rows.get(symbol, {})
        keys = sorted(key for key in symbol_rows if key <= previous_key)
        if not keys:
            return {}
        latest_close = symbol_rows[keys[-1]]["close"]
        returns: dict[str, float | None] = {}
        for sessions in (5, 20, 60):
            comparison_index = len(keys) - sessions - 1
            returns[f"{sessions}_session_change_pct"] = (
                _pct(latest_close, symbol_rows[keys[comparison_index]]["close"])
                if comparison_index >= 0
                else None
            )
        recent_keys = keys[-20:]
        recent_closes = [symbol_rows[key]["close"] for key in recent_keys]
        return {
            **returns,
            "distance_from_20_session_high_pct": (
                _pct(latest_close, max(recent_closes)) if recent_closes else None
            ),
            "up_sessions_of_last_10": sum(
                1
                for left, right in zip(keys[-11:-1], keys[-10:], strict=False)
                if symbol_rows[right]["close"] > symbol_rows[left]["close"]
            ),
        }

    index_context = {
        symbol: {"label": label, **rolling_context(symbol)}
        for label, symbol, group in MARKET_SERIES
        if group == "index"
    }
    sector_context = [
        {
            "label": label,
            "symbol": symbol,
            **rolling_context(symbol),
        }
        for label, symbol in SECTOR_SERIES
    ]
    sector_context.sort(
        key=lambda row: float(row.get("20_session_change_pct") or 0),
        reverse=True,
    )
    index_symbols = {
        "sp500": "^GSPC",
        "nasdaq": "^IXIC",
        "russell": "^RUT",
    }
    history_dates = sorted(
        key for key in rows.get("^GSPC", {}) if key <= previous_key
    )[-30:]
    history_bases = {
        key: (
            rows.get(symbol, {}).get(history_dates[0], {}).get("close")
            if history_dates
            else None
        )
        for key, symbol in index_symbols.items()
    }
    index_history: list[dict[str, Any]] = []
    for history_date in history_dates:
        point: dict[str, Any] = {"date": history_date}
        for key, symbol in index_symbols.items():
            close = rows.get(symbol, {}).get(history_date, {}).get("close")
            base = _finite(history_bases.get(key))
            point[key] = _pct(_finite(close), base)
        index_history.append(point)
    sector_chart = [
        {
            "label": row["label"],
            "symbol": row["symbol"],
            "session_change_pct": next(
                (
                    item.get("change_pct")
                    for item in sectors
                    if item.get("symbol") == row["symbol"]
                ),
                None,
            ),
            "5_session_change_pct": row.get("5_session_change_pct"),
            "20_session_change_pct": row.get("20_session_change_pct"),
        }
        for row in sector_context
    ]

    return {
        "edition_date": edition.isoformat(),
        "previous_session_date": previous_key,
        "comparison_session_date": comparison_key,
        "as_of": datetime.combine(previous_session, time(16, 0), tzinfo=NEW_YORK)
        .astimezone(timezone.utc)
        .isoformat(),
        "markets": markets,
        "sectors": sectors,
        "sector_breadth": {
            "positive": positive,
            "negative": negative,
            "unchanged": len(sectors) - positive - negative,
            "leader": sectors[0] if sectors else None,
            "laggard": sectors[-1] if sectors else None,
        },
        "context": {
            "indices": index_context,
            "sector_20_session_leaders": sector_context[:3],
            "sector_20_session_laggards": sector_context[-3:],
        },
        "charts": {
            "index_history": index_history,
            "sector_performance": sector_chart,
        },
    }


def _normalize_anomaly_row(row: dict[str, Any]) -> dict[str, Any] | None:
    ticker = str(row.get("ticker") or row.get("symbol") or "").strip().upper()
    change = _finite(row.get("day_change_pct"))
    if not ticker or change is None:
        return None
    explanation = row.get("move_explanation")
    explanation = explanation if isinstance(explanation, dict) else {}
    return {
        "ticker": ticker,
        "name": str(row.get("name") or ticker).strip(),
        "sector": str(row.get("sector") or "").strip(),
        "price": _finite(row.get("price")),
        "previous_close": _finite(row.get("previous_close")),
        "day_change_pct": round(change, 2),
        "volume_ratio": _finite(row.get("volume_ratio")),
        "direction": "up" if change >= 0 else "down",
        "explanation": str(
            explanation.get("headline") or row.get("headline") or ""
        ).strip(),
        "why_it_matters": str(explanation.get("why_it_matters") or "").strip(),
        "cause_type": str(explanation.get("cause_type") or "").strip(),
    }


def _stored_anomalies(store: TraceMoneyStore, session_date: str) -> dict[str, Any] | None:
    collection = store.db.collection("tm_daily_anomalies")
    for doc_id in (f"US__{session_date}", "US__latest"):
        snapshot = collection.document(doc_id).get()
        if not snapshot.exists:
            continue
        payload = snapshot.to_dict() or {}
        if str(payload.get("date") or "")[:10] != session_date:
            continue
        rows = [
            normalized
            for row in list(payload.get("anomalies") or [])
            if isinstance(row, dict)
            if (normalized := _normalize_anomaly_row(row)) is not None
        ]
        if not rows:
            continue
        gainers = sorted(
            (row for row in rows if row["day_change_pct"] >= 0),
            key=lambda row: row["day_change_pct"],
            reverse=True,
        )[:5]
        losers = sorted(
            (row for row in rows if row["day_change_pct"] < 0),
            key=lambda row: row["day_change_pct"],
        )[:5]
        return {
            "session_date": session_date,
            "source": "stocksbrew_anomaly_pipeline",
            "gainers": gainers,
            "losers": losers,
            "unusual": sorted(
                rows,
                key=lambda row: abs(row["day_change_pct"]),
                reverse=True,
            )[:6],
        }
    return None


def _historical_anomalies(session_date: str) -> dict[str, Any]:
    session = _iso_date(session_date)
    instruments = list_instruments("US", "us_core_100")
    symbols = [str(row.get("ticker") or "").strip().upper() for row in instruments]
    symbols = [symbol for symbol in symbols if symbol]
    frames = _download_daily(
        symbols,
        start=session - timedelta(days=45),
        end=session + timedelta(days=1),
    )
    instrument_by_ticker = {
        str(row.get("ticker") or "").strip().upper(): row for row in instruments
    }
    movers: list[dict[str, Any]] = []
    for symbol in symbols:
        dated_rows = _rows_by_date(frames.get(symbol))
        keys = sorted(key for key in dated_rows if key <= session_date)
        if len(keys) < 2 or keys[-1] != session_date:
            continue
        current = dated_rows[keys[-1]]
        prior = dated_rows[keys[-2]]
        change = _pct(current["close"], prior["close"])
        if change is None:
            continue
        prior_volumes = [
            dated_rows[key]["volume"]
            for key in keys[-21:-1]
            if dated_rows[key]["volume"] > 0
        ]
        average_volume = sum(prior_volumes) / len(prior_volumes) if prior_volumes else 0
        volume_ratio = (
            round(current["volume"] / average_volume, 2)
            if average_volume > 0 and current["volume"] > 0
            else None
        )
        instrument = instrument_by_ticker.get(symbol) or {}
        movers.append(
            {
                "ticker": symbol,
                "name": str(instrument.get("name") or symbol),
                "sector": str(instrument.get("sector") or ""),
                "price": current["close"],
                "previous_close": prior["close"],
                "day_change_pct": change,
                "volume_ratio": volume_ratio,
                "direction": "up" if change >= 0 else "down",
                "explanation": "",
                "why_it_matters": "",
                "cause_type": "unresolved",
            }
        )
    gainers = sorted(movers, key=lambda row: row["day_change_pct"], reverse=True)[:5]
    losers = sorted(movers, key=lambda row: row["day_change_pct"])[:5]
    return {
        "session_date": session_date,
        "source": "historical_market_data",
        "gainers": gainers,
        "losers": losers,
        "unusual": sorted(
            movers,
            key=lambda row: abs(row["day_change_pct"]),
            reverse=True,
        )[:6],
    }


def build_anomaly_evidence(store: TraceMoneyStore, session_date: str) -> dict[str, Any]:
    return _stored_anomalies(store, session_date) or _historical_anomalies(session_date)


def _closest_intraday_price(frame: Any, target: datetime) -> tuple[float | None, str]:
    if frame is None or getattr(frame, "empty", True):
        return None, ""
    try:
        index = frame.index
        if getattr(index, "tz", None) is None:
            index = index.tz_localize(NEW_YORK)
        target_local = target.astimezone(index.tz)
        eligible = frame.loc[index <= target_local]
        if eligible.empty:
            eligible = frame
        row = eligible.iloc[-1]
        close = _finite(row.get("Close"))
        stamp = eligible.index[-1]
        return close, stamp.tz_convert(timezone.utc).isoformat()
    except Exception:
        return None, ""


def _historical_futures(edition: date) -> dict[str, Any]:
    symbols = [symbol for _, symbol in FUTURES_SERIES]
    start = edition - timedelta(days=4)
    end = edition + timedelta(days=1)
    daily = _download_daily(symbols, start=start, end=end)
    target = datetime.combine(edition, time(5, 30), tzinfo=NEW_YORK)
    intraday_frame = yf.download(
        symbols,
        start=edition.isoformat(),
        end=(edition + timedelta(days=1)).isoformat(),
        interval="5m",
        auto_adjust=False,
        prepost=True,
        progress=False,
        threads=True,
        group_by="ticker",
    )
    single = len(symbols) == 1
    futures: list[dict[str, Any]] = []
    timestamps: list[str] = []
    for label, symbol in FUTURES_SERIES:
        intraday = _frame_for_symbol(intraday_frame, symbol, single=single)
        price, captured_at = _closest_intraday_price(intraday, target)
        daily_rows = _rows_by_date(daily.get(symbol))
        prior_dates = sorted(key for key in daily_rows if key < edition.isoformat())
        previous_close = daily_rows[prior_dates[-1]]["close"] if prior_dates else None
        if price is None:
            continue
        if captured_at:
            timestamps.append(captured_at)
        futures.append(
            {
                "label": label,
                "symbol": symbol,
                "price": round(price, 4),
                "previous_close": previous_close,
                "change_pct": _pct(price, previous_close),
                "captured_at": captured_at,
            }
        )
    return {
        "available": bool(futures),
        "source": "Yahoo Finance historical 5-minute futures",
        "as_of": min(timestamps) if timestamps else "",
        "futures": futures,
        "movers": [],
        "opening_label": "",
        "opening_summary": "",
        "drivers": [],
    }


def _current_premarket(store: TraceMoneyStore, edition: date) -> dict[str, Any] | None:
    movers_doc = store.get_premarket_movers("US") or {}
    if str(movers_doc.get("date") or "")[:10] != edition.isoformat():
        return None
    opening_doc = store.get_premarket_opening_report("US") or {}
    futures = [
        {
            "label": str(row.get("label") or row.get("ticker") or "Market cue"),
            "symbol": str(row.get("ticker") or ""),
            "price": _finite(row.get("price")),
            "previous_close": _finite(row.get("previous_close")),
            "change_pct": _finite(row.get("change_pct")),
            "captured_at": str(row.get("captured_at") or ""),
        }
        for row in list(opening_doc.get("global_cues") or [])
        if isinstance(row, dict) and str(row.get("group") or "") == "futures"
    ]
    movers: list[dict[str, Any]] = []
    for direction, rows in (
        ("up", list(movers_doc.get("gappers_up") or [])[:6]),
        ("down", list(movers_doc.get("gappers_down") or [])[:6]),
    ):
        for row in rows:
            if not isinstance(row, dict):
                continue
            movers.append(
                {
                    "ticker": str(row.get("ticker") or ""),
                    "name": str(row.get("name") or ""),
                    "direction": direction,
                    "change_pct": _finite(row.get("pre_market_change_pct")),
                    "price": _finite(row.get("pre_market_price")),
                    "sector": str(row.get("sector") or ""),
                }
            )
    return {
        "available": bool(futures),
        "source": "Stocksbrew live premarket pipeline",
        "as_of": str(movers_doc.get("generated_at") or opening_doc.get("generated_at") or ""),
        "futures": futures,
        "movers": movers,
        "opening_label": str(opening_doc.get("label") or ""),
        "opening_summary": str(opening_doc.get("summary") or ""),
        "drivers": list(opening_doc.get("drivers") or []),
    }


def build_premarket_evidence(store: TraceMoneyStore, edition_date: str | date) -> dict[str, Any]:
    edition = _iso_date(edition_date)
    today_et = datetime.now(NEW_YORK).date()
    if edition == today_et:
        current = _current_premarket(store, edition)
        if current is not None:
            return current
    return _historical_futures(edition)


def _domain_rank(url: str) -> int:
    host = urlparse(url).netloc.lower()
    for index, pattern in enumerate(PREFERRED_SOURCE_DOMAINS):
        if pattern in host:
            return index
    return len(PREFERRED_SOURCE_DOMAINS) + 10


def _article_source(result: ExtractedArticle, *, source_id: str) -> dict[str, Any]:
    body = " ".join(str(result.body_text or "").split())
    return {
        "id": source_id,
        "title": str(result.title or "").strip(),
        "publisher": str(result.publisher or "").strip(),
        "url": str(result.url or "").strip(),
        "published_at": str(result.published_at or "").strip(),
        "excerpt": body[:520],
        "research_text": body[:2600],
        "provider": result.provider,
    }


def _search_window(day: date) -> str:
    start = day.strftime("%m/%d/%Y")
    end = (day + timedelta(days=1)).strftime("%m/%d/%Y")
    return f"cdr:1,cd_min:{start},cd_max:{end}"


def _published_datetime(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _mentions_date(text: str, day: date) -> bool:
    lowered = str(text or "").lower()
    variants = (
        day.isoformat(),
        day.strftime("%B %d, %Y").lower(),
        f"{day.strftime('%B')} {day.day}, {day.year}".lower(),
        day.strftime("%m/%d/%Y"),
        f"{day.month}/{day.day}/{day.year}",
        day.strftime("%m%d%Y"),
    )
    return any(value in lowered for value in variants)


def research_sources(
    *,
    edition_date: str | date,
    previous_session_date: str | date,
    limit: int = 12,
) -> list[dict[str, Any]]:
    edition = _iso_date(edition_date)
    previous = _iso_date(previous_session_date)
    queries = (
        (
            f"US stock market {previous.strftime('%B %d %Y')} recap",
            "qdr:w",
        ),
        (
            f"US markets premarket {edition.strftime('%B %d %Y')} futures stocks",
            "qdr:w",
        ),
        (
            f"Federal Reserve economic data earnings market catalyst "
            f"{previous.strftime('%B %d %Y')} {edition.strftime('%B %d %Y')}",
            f"cdr:1,cd_min:{previous.strftime('%m/%d/%Y')},cd_max:{edition.strftime('%m/%d/%Y')}",
        ),
    )
    discovered: dict[str, dict[str, str]] = {}
    for query, window in queries:
        try:
            for result in search_firecrawl_urls(query, limit=6, time_filter=window):
                discovered.setdefault(result["url"].rstrip("/"), result)
        except Exception as exc:
            print({"stage": "market_daily_research_error", "query": query[:80], "error": str(exc)}, flush=True)
    if not any(
        _mentions_date(f"{row.get('title', '')} {row.get('url', '')}", previous)
        for row in discovered.values()
    ):
        retry_query = f"US stock market {previous.strftime('%B %d %Y')} recap"
        for retry in range(2):
            try:
                for result in search_firecrawl_urls(
                    retry_query,
                    limit=6,
                    time_filter="qdr:w",
                ):
                    discovered.setdefault(result["url"].rstrip("/"), result)
            except Exception as exc:
                print(
                    {
                        "stage": "market_daily_research_retry_error",
                        "retry": retry + 1,
                        "error": str(exc),
                    },
                    flush=True,
                )
            if any(
                _mentions_date(f"{row.get('title', '')} {row.get('url', '')}", previous)
                for row in discovered.values()
            ):
                break
    ranked_urls = sorted(
        discovered,
        key=lambda url: (
            1 if any(domain in urlparse(url).netloc.lower() for domain in PAYWALLED_SOURCE_DOMAINS) else 0,
            _domain_rank(url),
        ),
    )[:8]
    print(
        {
            "stage": "market_daily_research_discovery",
            "discovered": len(discovered),
            "selected_for_extract": len(ranked_urls),
        },
        flush=True,
    )
    extracted_by_url = {
        result.url.rstrip("/"): result
        for result in extract_urls(ranked_urls)
        if result.url
    }
    found: list[ExtractedArticle] = []
    for url in ranked_urls:
        key = url.rstrip("/")
        extracted = extracted_by_url.get(key)
        discovered_result = discovered[key]
        if extracted is not None and extracted.published_at:
            found.append(extracted)
            continue
        searchable = " ".join(
            (
                discovered_result.get("title", ""),
                discovered_result.get("url", ""),
            )
        )
        if not _mentions_date(searchable, previous):
            continue
        description = discovered_result.get("description", "")
        if len(description.split()) < 12:
            continue
        found.append(
            ExtractedArticle(
                url=discovered_result["url"],
                title=discovered_result["title"],
                body_text=description,
                summary=description,
                published_at=datetime.combine(
                    previous,
                    time(23, 59),
                    tzinfo=timezone.utc,
                ).isoformat(),
                publisher=urlparse(discovered_result["url"]).netloc.removeprefix("www."),
                status="ok",
                word_count=len(description.split()),
                provider="firecrawl-search",
                note="Dated search result used after full-page extraction lacked a timestamp",
            )
        )
    deduped: dict[str, ExtractedArticle] = {}
    cutoff = datetime.combine(edition, time(15, 0), tzinfo=IST).astimezone(timezone.utc)
    earliest = datetime.combine(previous - timedelta(days=2), time.min, tzinfo=timezone.utc)
    premarket_terms = ("premarket", "pre-market", "futures", "before the bell", "morning")
    for result in found:
        if not result.url or not result.title:
            continue
        published_at = _published_datetime(result.published_at)
        if published_at is None:
            continue
        if published_at < earliest or published_at > cutoff:
            continue
        title_lower = result.title.lower()
        years = {int(value) for value in re.findall(r"\b20\d{2}\b", result.title)}
        if years and not years.issubset({previous.year, edition.year}):
            continue
        if published_at.date() == edition:
            if not any(term in title_lower for term in premarket_terms):
                continue
            if published_at.time() == time.min:
                continue
        deduped.setdefault(result.url.rstrip("/"), result)
    ranked = sorted(
        deduped.values(),
        key=lambda result: (
            _domain_rank(result.url),
            0 if result.published_at else 1,
            -result.word_count,
        ),
    )[: max(4, limit)]
    print(
        {
            "stage": "market_daily_research_complete",
            "extracted": len(found),
            "accepted": len(ranked),
            "sources": [urlparse(result.url).netloc for result in ranked],
        },
        flush=True,
    )
    return [_article_source(result, source_id=f"web-{index:02d}") for index, result in enumerate(ranked, start=1)]


def _internal_sources(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    tape = evidence["tape"]
    premarket = evidence["premarket"]
    sources = [
        {
            "id": "sb-close",
            "title": f"Stocksbrew market tape for {tape['previous_session_date']}",
            "publisher": "stocksbrew",
            "url": "https://www.stocksbrew.online/pulse",
            "published_at": tape["as_of"],
            "excerpt": json.dumps(
                {
                    "markets": tape["markets"],
                    "sector_breadth": tape["sector_breadth"],
                    "sectors": tape["sectors"],
                },
                separators=(",", ":"),
            ),
            "research_text": json.dumps(tape, separators=(",", ":")),
            "provider": "stocksbrew",
        },
        {
            "id": "sb-premarket",
            "title": f"Stocksbrew premarket tape for {evidence['edition_date']}",
            "publisher": "stocksbrew",
            "url": "https://www.stocksbrew.online/premarket",
            "published_at": premarket.get("as_of") or "",
            "excerpt": json.dumps(
                {
                    "futures": premarket.get("futures"),
                    "movers": premarket.get("movers"),
                    "opening_label": premarket.get("opening_label"),
                    "opening_summary": premarket.get("opening_summary"),
                },
                separators=(",", ":"),
            ),
            "research_text": json.dumps(premarket, separators=(",", ":")),
            "provider": "stocksbrew",
        },
    ]
    anomalies = evidence.get("anomalies") or {}
    if list(anomalies.get("unusual") or []):
        sources.append(
            {
                "id": "sb-anomalies",
                "title": f"Stocksbrew close movers for {anomalies.get('session_date')}",
                "publisher": "stocksbrew",
                "url": "https://www.stocksbrew.online/pulse",
                "published_at": tape["as_of"],
                "excerpt": json.dumps(anomalies, separators=(",", ":")),
                "research_text": json.dumps(anomalies, separators=(",", ":")),
                "provider": str(anomalies.get("source") or "stocksbrew"),
            }
        )
    return sources


def build_evidence_pack(
    store: TraceMoneyStore,
    *,
    edition_date: str | date,
    with_research: bool = True,
) -> dict[str, Any]:
    edition = _iso_date(edition_date)
    today_et = datetime.now(NEW_YORK).date()
    cache_ref = store.db.collection("tm_market_daily_evidence").document(
        f"US__{edition.isoformat()}"
    )
    if edition < today_et and with_research:
        cached = cache_ref.get()
        if cached.exists:
            cached_data = cached.to_dict() or {}
            if (
                cached_data.get("research_version") == RESEARCH_VERSION
                and
                cached_data.get("evidence_hash")
                and any(
                    str(source.get("id") or "").startswith("web-")
                    for source in list(cached_data.get("sources") or [])
                    if isinstance(source, dict)
                )
            ):
                print(
                    {
                        "stage": "market_daily_evidence_cache_hit",
                        "edition_date": edition.isoformat(),
                    },
                    flush=True,
                )
                return cached_data
    tape = build_market_tape(edition)
    premarket = build_premarket_evidence(store, edition)
    anomalies = build_anomaly_evidence(store, tape["previous_session_date"])
    evidence: dict[str, Any] = {
        "market": "US",
        "edition_date": edition.isoformat(),
        "previous_session_date": tape["previous_session_date"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "research_version": RESEARCH_VERSION,
        "tape": tape,
        "premarket": premarket,
        "anomalies": anomalies,
        "sources": [],
        "editorial_contract": {
            "fact": "Directly supported by supplied market data or source text.",
            "reported": "Attributed to a named source.",
            "inference": "A Stocksbrew interpretation, written conditionally.",
            "unresolved": "No verified explanation surfaced.",
        },
    }
    sources = _internal_sources(evidence)
    if with_research:
        sources.extend(
            research_sources(
                edition_date=edition,
                previous_session_date=tape["previous_session_date"],
            )
        )
    evidence["sources"] = sources
    public_evidence = {
        **evidence,
        "sources": [
            {key: value for key, value in source.items() if key != "research_text"}
            for source in sources
        ],
    }
    evidence["evidence_hash"] = hashlib.sha256(
        json.dumps(public_evidence, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    if edition < today_et and with_research:
        cache_ref.set(evidence)
    return evidence


WRITER_PROMPT = """You are the sole writer of Stocksbrew Market Daily.

Write one original, reported markets article around the most revealing idea in
yesterday's session and this morning's setup. Keep the pace brisk. Explain the
market mechanism and why it matters, then move on. Every paragraph must add a
new piece of the argument.

Write like one curious human with a point of view. Use plain English,
contractions, varied paragraph length, occasional first person, and at most one
good analogy. Do not perform folksiness. Do not imitate a named writer. Do not
use em dashes, en dashes, emojis, generic greetings, canned AI transitions, or
a motivational ending.

Avoid trader and newsroom shorthand that ordinary readers would never use.
Never call the market "the tape" or use phrases such as "the market's tell",
"calm open", "modest bid", "green board", "risk-on", "risk-off", "price
action", "digest the move", "constructive backdrop", "buyers stepped in", or
"quality of the bid". Describe what stocks and investors actually did in plain
language.

Use 6 to 10 meaningful numeric facts in the prose. Replace nonessential figures
with directional language. Never inventory index levels, sectors, futures, or
movers. Interactive components carry that data. Do not introduce a date, year,
target, forecast, or statistic that is absent from the supplied material.

The article_markdown must:
- be 600 to 800 words;
- begin with an actual lede, not a heading, date, time, or market scorecard;
- contain 2 or 3 short, natural ## headings that move the argument forward;
- use exactly 3 of these component markers, each alone between paragraphs:
  {{INDEX_CHART}}, {{SECTOR_CHART}}, {{MARKET_PULSE}},
  {{PREMARKET_BOARD}}, {{MOVER_CARDS}}, {{ANOMALY_RAIL}};
- always use {{ANOMALY_RAIL}} and place it after prose that names one to three
  supplied outlier stocks and connects their moves to the central idea;
- use {{MOVER_CARDS}} only when the supplied premarket movers list is nonempty;
- place each component where its data deepens the surrounding argument, never
  as decoration and never two components in a row;
- contain no bullet list or scenario list;
- end with one short paragraph, not a checklist, forecast, or summary box.

Avoid reversal templates and rhetorical seesaws. Never write constructions such
as "not X but Y", "this isn't X, it's Y", "not because X, because Y",
"less X, more Y", "the point isn't", "both can be right", "what makes this
tricky", or close variations. State the idea directly. Do not repeat a thought
in new wording and do not pad the ending.

Facts and exact figures must come from the supplied data or reporting. Attribute
reported explanations naturally. Separate causation from coincidence through
careful prose. If a cause is unresolved, say so without talking about your
research process. Do not copy source wording. Do not give investment advice.
Return every source ID actually used in source_ids, including at least one
web-* source and the relevant Stocksbrew data sources.

Never mention an evidence pack, supplied coverage, source material,
verification, model, prompt, or workflow in the article.
"""


def _writer_input(evidence: dict[str, Any]) -> dict[str, Any]:
    tape = evidence["tape"]
    premarket = evidence["premarket"]
    return {
        "market": evidence["market"],
        "edition_date": evidence["edition_date"],
        "previous_session_date": evidence["previous_session_date"],
        "close": {
            "as_of": tape["as_of"],
            "markets": [
                {
                    "label": row.get("label"),
                    "group": row.get("group"),
                    "change_pct": row.get("change_pct"),
                    "close": row.get("close"),
                }
                for row in tape["markets"]
            ],
            "sectors": [
                {
                    "label": row.get("label"),
                    "change_pct": row.get("change_pct"),
                }
                for row in tape["sectors"]
            ],
            "sector_breadth": tape["sector_breadth"],
            "longer_context": tape.get("context"),
        },
        "premarket": {
            "available": premarket.get("available"),
            "source": premarket.get("source"),
            "as_of": premarket.get("as_of"),
            "futures": [
                {
                    "label": row.get("label"),
                    "change_pct": row.get("change_pct"),
                }
                for row in list(premarket.get("futures") or [])
            ],
            "movers": [
                {
                    "ticker": row.get("ticker"),
                    "name": row.get("name"),
                    "change_pct": row.get("change_pct"),
                    "sector": row.get("sector"),
                }
                for row in list(premarket.get("movers") or [])[:8]
            ],
            "opening_label": premarket.get("opening_label"),
            "opening_summary": premarket.get("opening_summary"),
            "drivers": list(premarket.get("drivers") or [])[:5],
        },
        "close_anomalies": evidence.get("anomalies") or {},
        "available_components": [
            "{{INDEX_CHART}}",
            "{{SECTOR_CHART}}",
            "{{MARKET_PULSE}}",
            "{{PREMARKET_BOARD}}",
            "{{ANOMALY_RAIL}}",
            *(
                ["{{MOVER_CARDS}}"]
                if list(premarket.get("movers") or [])
                else []
            ),
        ],
        "editorial_contract": evidence["editorial_contract"],
        "sources": [
            {
                "id": source["id"],
                "title": source["title"],
                "publisher": source["publisher"],
                "url": source["url"],
                "published_at": source["published_at"],
                "text": source.get("research_text") or source.get("excerpt") or "",
            }
            for source in evidence["sources"]
        ],
    }


def generate_article(evidence: dict[str, Any], *, model: str = DEFAULT_WRITER_MODEL) -> dict[str, Any]:
    body = post_chat_completion(
        model=model,
        stage="market_daily_writer",
        temperature=0.72,
        timeout=180,
        max_attempts=1,
        response_format={"type": "json_schema", "json_schema": ARTICLE_SCHEMA},
        messages=[
            {"role": "system", "content": WRITER_PROMPT},
            {
                "role": "user",
                "content": "Write today's edition from this evidence pack:\n"
                + json.dumps(_writer_input(evidence), ensure_ascii=False),
            },
        ],
    )
    content = str((((body.get("choices") or [{}])[0].get("message") or {}).get("content") or ""))
    article = parse_json_content(content)
    for key in ("headline", "dek", "thesis", "article_markdown"):
        value = str(article.get(key) or "")
        value = re.sub(r"\s*—\s*", ", ", value)
        value = re.sub(r"\s*–\s*", " to ", value)
        article[key] = value
    article["model"] = model
    return article


def generate_validated_article(
    evidence: dict[str, Any],
    *,
    model: str = DEFAULT_WRITER_MODEL,
) -> tuple[dict[str, Any], ValidationResult]:
    """Make one writer call, then fail closed on basic deterministic checks."""
    article = generate_article(evidence, model=model)
    validation = validate_article(article, evidence)
    print(
        {
            "stage": "market_daily_validation",
            "model": model,
            "passed": validation.passed,
            "score": validation.score,
            "blockers": validation.blockers,
        },
        flush=True,
    )
    return article, validation


def _article_strings(article: dict[str, Any]) -> list[str]:
    return [
        str(article.get("headline") or ""),
        str(article.get("dek") or ""),
        str(article.get("thesis") or ""),
        str(article.get("article_markdown") or ""),
    ]


def _word_count(article: dict[str, Any]) -> int:
    return len(re.findall(r"\b[\w'’.-]+\b", " ".join(_article_strings(article))))


def _source_ids(article: dict[str, Any]) -> list[str]:
    return [str(value) for value in list(article.get("source_ids") or [])]


def validate_article(article: dict[str, Any], evidence: dict[str, Any]) -> ValidationResult:
    """Check that the generated artifact can be rendered safely.

    This deliberately does not try to score taste, voice, length, or prose
    quality. Those belong in the writing brief.
    """
    blockers: list[str] = []
    strings = _article_strings(article)
    full_text = "\n".join(strings)
    lowered = full_text.lower()
    word_count = _word_count(article)
    source_map = {
        str(source.get("id") or ""): source
        for source in list(evidence.get("sources") or [])
        if isinstance(source, dict)
    }

    if "—" in full_text:
        blockers.append("em dash present")
    if "–" in full_text:
        blockers.append("en dash present")
    for pattern in INVESTMENT_ADVICE_PATTERNS:
        if re.search(pattern, lowered):
            blockers.append(f"investment-advice wording present: {pattern}")

    markdown = str(article.get("article_markdown") or "").strip()
    for field in ("headline", "dek", "thesis", "article_markdown"):
        if not str(article.get(field) or "").strip():
            blockers.append(f"required field is empty: {field}")
    markers = [marker for marker in ARTICLE_COMPONENTS if marker in markdown]
    marker_count = sum(markdown.count(marker) for marker in ARTICLE_COMPONENTS)
    if marker_count < 2:
        blockers.append("article has fewer than two component markers")
    unknown_markers = sorted(
        {
            value
            for value in re.findall(r"\{\{[A-Z_]+\}\}", markdown)
            if value not in ARTICLE_COMPONENTS
        }
    )
    if unknown_markers:
        blockers.append(f"unknown component markers: {', '.join(unknown_markers)}")
    if "{{MOVER_CARDS}}" in markdown and not list((evidence.get("premarket") or {}).get("movers") or []):
        blockers.append("mover cards requested without mover data")
    if "{{ANOMALY_RAIL}}" in markdown and not list((evidence.get("anomalies") or {}).get("unusual") or []):
        blockers.append("anomaly rail requested without anomaly data")

    cited = _source_ids(article)
    unknown = sorted({source_id for source_id in cited if source_id not in source_map})
    if unknown:
        blockers.append(f"unknown source IDs: {', '.join(unknown)}")
    if not cited:
        blockers.append("article has no source IDs")

    premarket = evidence.get("premarket") or {}
    if not premarket.get("available"):
        blockers.append("premarket evidence unavailable")
    if not str(premarket.get("as_of") or ""):
        blockers.append("premarket as-of timestamp missing")
    if not str((evidence.get("tape") or {}).get("as_of") or ""):
        blockers.append("previous-session timestamp missing")

    if markdown.startswith("#") or any(markdown.startswith(marker) for marker in ARTICLE_COMPONENTS):
        blockers.append("article does not begin with a prose lede")

    blockers = list(dict.fromkeys(blockers))
    return ValidationResult(
        passed=not blockers,
        score=100 if not blockers else 0,
        blockers=blockers,
        warnings=[],
        word_count=word_count,
    )


def public_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        **evidence,
        "sources": [
            {key: value for key, value in source.items() if key != "research_text"}
            for source in list(evidence.get("sources") or [])
        ],
    }


def article_document(
    *,
    article: dict[str, Any],
    evidence: dict[str, Any],
    validation: ValidationResult,
    status: str,
    generated_at: str | None = None,
) -> dict[str, Any]:
    now = generated_at or datetime.now(timezone.utc).isoformat()
    return {
        "market": "US",
        "edition_date": evidence["edition_date"],
        "previous_session_date": evidence["previous_session_date"],
        "status": status,
        "published_at": now if status == "published" else None,
        "generated_at": now,
        "updated_at": now,
        "headline": article["headline"],
        "dek": article["dek"],
        "thesis": article["thesis"],
        "article_markdown": article["article_markdown"],
        "source_ids": article["source_ids"],
        "model": article.get("model"),
        "quality": validation.as_dict(),
        "evidence_hash": evidence["evidence_hash"],
        "tape": evidence["tape"],
        "premarket": evidence["premarket"],
        "anomalies": evidence.get("anomalies") or {},
        "sources": public_evidence(evidence)["sources"],
        "methodology": {
            "label": "Evidence-first daily market letter",
            "editorial_policy_url": "https://www.stocksbrew.online/editorial-policy",
            "corrections": [],
            "automated": True,
        },
    }


def save_article(store: TraceMoneyStore, document: dict[str, Any]) -> None:
    if document.get("status") != "published":
        raise ValueError("Only a passed, published Market Daily document may be saved")
    if not bool((document.get("quality") or {}).get("passed")):
        raise ValueError("Market Daily quality gate did not pass")
    store.save_market_daily(document)


def latest_market_days(count: int = 3, *, reference: date | None = None) -> list[str]:
    current = reference or datetime.now(NEW_YORK).date()
    out: list[str] = []
    while len(out) < max(1, count):
        if current.weekday() < 5:
            out.append(current.isoformat())
        current -= timedelta(days=1)
    return sorted(out)
