"""Build the public US opening-sentiment report.

The report is intentionally a small materialized view. It reuses our existing
pre-market movers, Firecrawl-first mover context, and Reddit snapshot, then
adds global market cues and the last five S&P 500 sessions. The only model work
is one bounded final synthesis; the score and source data remain deterministic
and inspectable.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from backend.storage import TraceMoneyStore


GLOBAL_CUES: tuple[dict[str, str], ...] = (
    {
        "instrument_id": "US_OPEN_ES",
        "ticker": "ES=F",
        "quote_symbol_yahoo": "ES=F",
        "name": "S&P 500 futures",
        "region": "US futures",
        "group": "futures",
    },
    {
        "instrument_id": "US_OPEN_NQ",
        "ticker": "NQ=F",
        "quote_symbol_yahoo": "NQ=F",
        "name": "Nasdaq 100 futures",
        "region": "US futures",
        "group": "futures",
    },
    {
        "instrument_id": "US_OPEN_RTY",
        "ticker": "RTY=F",
        "quote_symbol_yahoo": "RTY=F",
        "name": "Russell 2000 futures",
        "region": "US futures",
        "group": "futures",
    },
    {
        "instrument_id": "US_OPEN_NIKKEI",
        "ticker": "NIKKEI",
        "quote_symbol_yahoo": "^N225",
        "name": "Nikkei 225",
        "region": "Japan",
        "group": "asia",
    },
    {
        "instrument_id": "US_OPEN_KOSPI",
        "ticker": "KOSPI",
        "quote_symbol_yahoo": "^KS11",
        "name": "KOSPI",
        "region": "South Korea",
        "group": "asia",
    },
    {
        "instrument_id": "US_OPEN_NIFTY",
        "ticker": "NIFTY",
        "quote_symbol_yahoo": "^NSEI",
        "name": "Nifty 50",
        "region": "India",
        "group": "asia",
    },
    {
        "instrument_id": "US_OPEN_HSI",
        "ticker": "HSI",
        "quote_symbol_yahoo": "^HSI",
        "name": "Hang Seng",
        "region": "Hong Kong",
        "group": "asia",
    },
    {
        "instrument_id": "US_OPEN_STOXX",
        "ticker": "STOXX",
        "quote_symbol_yahoo": "^STOXX50E",
        "name": "Euro Stoxx 50",
        "region": "Europe",
        "group": "europe",
    },
    {
        "instrument_id": "US_OPEN_OIL",
        "ticker": "OIL",
        "quote_symbol_yahoo": "CL=F",
        "name": "WTI crude",
        "region": "Macro",
        "group": "macro",
    },
    {
        "instrument_id": "US_OPEN_VIX",
        "ticker": "VIX",
        "quote_symbol_yahoo": "^VIX",
        "name": "VIX",
        "region": "Macro",
        "group": "macro",
    },
)

SPX_INSTRUMENT = {
    "instrument_id": "US_OPEN_SPX_HISTORY",
    "ticker": "SPX",
    "quote_symbol_yahoo": "^GSPC",
    "name": "S&P 500",
    "market": "US",
}

OPENING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "drivers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "tone": {"type": "string", "enum": ["positive", "negative", "neutral"]},
                },
                "required": ["title", "detail", "tone"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "drivers"],
    "additionalProperties": False,
}

OPENING_PROMPT = """You write a compact US market-opening briefing for a retail investor.
Use only the supplied figures and source snippets. Do not invent catalysts, prices, or causes.
Treat the opening label as a setup, not a promise. Never give investment advice or say the market will definitely move.
Write a plain-English summary of no more than 42 words and at most three compact drivers.
Avoid clickbait, hype, emojis, and generic filler. If pre-market data is unavailable, say so clearly."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _number(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed else default


def _bounded(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _clip(value: Any, max_chars: int) -> str:
    del max_chars
    return " ".join(str(value or "").split()).strip()


def _us_date() -> str:
    return datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def _is_live_premarket(snapshot: dict[str, Any] | None) -> bool:
    if not snapshot:
        return False
    if str(snapshot.get("date") or "")[:10] != _us_date():
        return False
    return str(snapshot.get("market_state") or "").upper().startswith("PRE")


def _row_for_cue(spec: dict[str, str], raw: dict[str, Any] | None) -> dict[str, Any] | None:
    quote = (raw or {}).get("quote") or {}
    price = _number(quote.get("current"), 0.0)
    previous_close = _number(quote.get("previous_close"), 0.0)
    change = _number(quote.get("day_change_pct"), 0.0)
    if price <= 0 and previous_close <= 0:
        return None
    return {
        "id": spec["instrument_id"],
        "label": spec["name"],
        "ticker": spec["ticker"],
        "region": spec["region"],
        "group": spec["group"],
        "price": round(price, 3),
        "previous_close": round(previous_close, 3),
        "change_pct": round(change, 2),
        "captured_at": str((raw or {}).get("captured_at") or ""),
    }


def summarize_social(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    raw = (snapshot or {}).get("tickers") or []
    entries: list[tuple[str, dict[str, Any]]] = []
    if isinstance(raw, dict):
        entries = [(str(ticker).upper(), row if isinstance(row, dict) else {}) for ticker, row in raw.items()]
    elif isinstance(raw, list):
        for row in raw:
            payload = row if isinstance(row, dict) else {}
            ticker = str(payload.get("ticker") or payload.get("symbol") or "").upper()
            if ticker:
                entries.append((ticker, payload))

    positive = negative = neutral = 0
    tickers: list[dict[str, Any]] = []
    for ticker, row in entries:
        mentions = max(0, int(_number(row.get("mention_count", row.get("mentions", 0)), 0)))
        sentiment = str(row.get("sentiment") or "neutral").lower()
        if sentiment in {"bullish", "positive", "up"}:
            positive += max(1, mentions)
            tone = "positive"
        elif sentiment in {"bearish", "negative", "down"}:
            negative += max(1, mentions)
            tone = "negative"
        else:
            neutral += max(1, mentions)
            tone = "neutral"
        tickers.append({
            "ticker": ticker,
            "mentions": mentions,
            "sentiment": tone,
            "summary": _clip(row.get("summary") or row.get("context"), 130),
        })

    total = positive + negative + neutral
    return {
        "available": bool(entries),
        "generated_at": str((snapshot or {}).get("generated_at") or ""),
        "positive_mentions": positive,
        "negative_mentions": negative,
        "neutral_mentions": neutral,
        "sentiment_score": round(((positive - negative) / total) * 100, 1) if total else 0.0,
        "top_tickers": sorted(tickers, key=lambda item: item["mentions"], reverse=True)[:5],
    }


def summarize_premarket(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    if not _is_live_premarket(snapshot):
        return {
            "available": False,
            "generated_at": str((snapshot or {}).get("generated_at") or ""),
            "quoted_count": 0,
            "up_count": 0,
            "down_count": 0,
            "breadth_score": 0.0,
            "average_gap_pct": 0.0,
            "top_gainers": [],
            "top_losers": [],
        }

    gainers = list(snapshot.get("gappers_up") or [])
    losers = list(snapshot.get("gappers_down") or [])
    rows = gainers + losers
    average_gap = sum(_number(row.get("pre_market_change_pct")) for row in rows) / len(rows) if rows else 0.0
    breadth = ((len(gainers) - len(losers)) / len(rows) * 100.0) if rows else 0.0

    def compact(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "ticker": str(row.get("ticker") or "").upper(),
            "name": _clip(row.get("name"), 44),
            "gap_pct": round(_number(row.get("pre_market_change_pct")), 2),
            "sector": _clip(row.get("sector"), 42),
        }

    return {
        "available": True,
        "generated_at": str(snapshot.get("generated_at") or ""),
        "quoted_count": int(_number(snapshot.get("quoted_count"), 0)),
        "up_count": len(gainers),
        "down_count": len(losers),
        "breadth_score": round(breadth, 1),
        "average_gap_pct": round(average_gap, 2),
        "top_gainers": [compact(row) for row in gainers[:5]],
        "top_losers": [compact(row) for row in losers[:5]],
    }


def context_matches_movers(
    context: dict[str, Any] | None,
    movers: dict[str, Any] | None,
) -> bool:
    """True only when catalyst context was built from this exact mover snapshot."""
    if not context or not movers:
        return False
    mover_generated_at = str(movers.get("generated_at") or "").strip()
    mover_date = str(movers.get("date") or "").strip()
    return bool(
        mover_generated_at
        and str(context.get("source_movers_generated_at") or "").strip() == mover_generated_at
        and str(context.get("source_movers_date") or "").strip() == mover_date
    )


def summarize_news(
    context: dict[str, Any] | None,
    premarket: dict[str, Any],
) -> list[dict[str, Any]]:
    by_ticker = (context or {}).get("by_ticker") or {}
    if not isinstance(by_ticker, dict):
        return []
    gap_by_ticker = {
        row["ticker"]: row["gap_pct"]
        for row in premarket.get("top_gainers", []) + premarket.get("top_losers", [])
        if row.get("ticker")
    }
    ordered = sorted(
        by_ticker.items(),
        key=lambda item: abs(_number(gap_by_ticker.get(str(item[0]).upper()))),
        reverse=True,
    )
    rows: list[dict[str, Any]] = []
    for ticker, raw in ordered:
        row = raw if isinstance(raw, dict) else {}
        detail = _clip(row.get("why") or row.get("headline"), 170)
        tape_line = _clip(row.get("tape_line"), 170)
        if not tape_line:
            continue
        symbol = str(ticker or "").upper()
        rows.append({
            "ticker": symbol,
            "headline": _clip(row.get("headline"), 150),
            "detail": detail,
            "tape_line": tape_line or None,
            "source": _clip(row.get("source"), 48),
            "url": str(row.get("url") or ""),
            "gap_pct": gap_by_ticker.get(symbol),
        })
        if len(rows) >= 6:
            break
    return rows


def score_opening(
    cues: list[dict[str, Any]],
    premarket: dict[str, Any],
    social: dict[str, Any],
    sessions: list[dict[str, Any]],
) -> dict[str, Any]:
    grouped: dict[str, list[float]] = {}
    for cue in cues:
        grouped.setdefault(str(cue.get("group") or "other"), []).append(_number(cue.get("change_pct")))

    def average(group: str) -> float | None:
        values = grouped.get(group) or []
        return (sum(values) / len(values)) if values else None

    futures = average("futures")
    asia = average("asia")
    europe = average("europe")
    vix = next((cue for cue in cues if cue.get("id") == "US_OPEN_VIX"), None)
    vix_change = _number(vix.get("change_pct")) if vix else None
    last_session = _number(sessions[-1].get("change_pct")) if sessions else None

    score = 50.0
    components: dict[str, float] = {}
    if futures is not None:
        components["futures"] = _bounded(futures, -2.0, 2.0) * 8.0
        score += components["futures"]
    if asia is not None:
        components["asia"] = _bounded(asia, -3.0, 3.0) * 2.5
        score += components["asia"]
    if europe is not None:
        components["europe"] = _bounded(europe, -3.0, 3.0) * 1.5
        score += components["europe"]
    if premarket.get("available"):
        components["premarket"] = _bounded(_number(premarket.get("breadth_score")), -100, 100) * 0.14
        score += components["premarket"]
    if social.get("available"):
        components["social"] = _bounded(_number(social.get("sentiment_score")), -100, 100) * 0.08
        score += components["social"]
    if last_session is not None:
        components["prior_session"] = _bounded(last_session, -3.0, 3.0) * 1.5
        score += components["prior_session"]
    if vix_change is not None:
        components["volatility"] = _bounded(-vix_change, -4.0, 4.0) * 1.4
        score += components["volatility"]

    score = round(_bounded(score, 0, 100))
    if score >= 64:
        label, direction = "Constructive open setup", "constructive"
    elif score >= 56:
        label, direction = "Slightly constructive setup", "slightly constructive"
    elif score <= 36:
        label, direction = "Cautious open setup", "cautious"
    elif score <= 44:
        label, direction = "Slightly cautious setup", "slightly cautious"
    else:
        label, direction = "Mixed open setup", "mixed"

    source_count = sum([
        bool(futures is not None),
        bool(asia is not None),
        bool(europe is not None),
        bool(premarket.get("available")),
        bool(social.get("available")),
        bool(sessions),
    ])
    confidence = "high" if source_count >= 5 else "medium" if source_count >= 3 else "low"
    return {
        "score": score,
        "label": label,
        "direction": direction,
        "confidence": confidence,
        "components": {key: round(value, 1) for key, value in components.items()},
        "averages": {
            "futures": round(futures, 2) if futures is not None else None,
            "asia": round(asia, 2) if asia is not None else None,
            "europe": round(europe, 2) if europe is not None else None,
            "vix_change": round(vix_change, 2) if vix_change is not None else None,
            "last_session": round(last_session, 2) if last_session is not None else None,
        },
    }


def fallback_summary(scorecard: dict[str, Any], premarket: dict[str, Any]) -> str:
    averages = scorecard.get("averages") or {}
    details: list[str] = []
    if averages.get("futures") is not None:
        details.append(f"US futures average {averages['futures']:+.1f}%")
    if averages.get("asia") is not None:
        details.append(f"Asian markets average {averages['asia']:+.1f}%")
    if premarket.get("available"):
        details.append(
            f"pre-market breadth is {int(premarket.get('up_count', 0))} up vs {int(premarket.get('down_count', 0))} down"
        )
    else:
        details.append("US pre-market pricing is not live yet")
    return _clip(f"{scorecard['label']}: " + "; ".join(details) + ".", 240)


def deterministic_drivers(
    scorecard: dict[str, Any],
    premarket: dict[str, Any],
    social: dict[str, Any],
) -> list[dict[str, str]]:
    averages = scorecard.get("averages") or {}
    drivers: list[dict[str, str]] = []
    futures = averages.get("futures")
    if futures is not None:
        drivers.append({
            "title": "US index futures",
            "detail": f"S&P, Nasdaq and Russell futures average {float(futures):+.2f}%.",
            "tone": "positive" if futures > 0.08 else "negative" if futures < -0.08 else "neutral",
        })
    asia = averages.get("asia")
    if asia is not None:
        drivers.append({
            "title": "Overnight Asia",
            "detail": f"Japan, South Korea, India and Hong Kong average {float(asia):+.2f}% where available.",
            "tone": "positive" if asia > 0.12 else "negative" if asia < -0.12 else "neutral",
        })
    if premarket.get("available"):
        breadth = _number(premarket.get("breadth_score"))
        drivers.append({
            "title": "Pre-market breadth",
            "detail": f"{premarket.get('up_count', 0)} tracked names gap up and {premarket.get('down_count', 0)} gap down.",
            "tone": "positive" if breadth > 10 else "negative" if breadth < -10 else "neutral",
        })
    if social.get("available"):
        social_score = _number(social.get("sentiment_score"))
        drivers.append({
            "title": "Investor discussion",
            "detail": f"Reddit mention balance is {social_score:+.0f} on the latest monitored investing conversations.",
            "tone": "positive" if social_score > 10 else "negative" if social_score < -10 else "neutral",
        })
    return drivers[:3]


def llm_synthesis(payload: dict[str, Any]) -> tuple[str, list[dict[str, str]], str]:
    from backend.llm_client import (
        json_response_format,
        llm_model,
        parse_json_content,
        post_chat_completion,
        schema_system_prompt,
    )

    try:
        response = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(OPENING_PROMPT, OPENING_SCHEMA)},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=llm_model("gpt-5.6-luna"),
            temperature=0.15,
            response_format=json_response_format(),
            timeout=45,
            stage="premarket_opening_sentiment",
            max_attempts=3,
        )
        parsed = parse_json_content(response["choices"][0]["message"]["content"])
        summary = _clip(parsed.get("summary"), 260)
        drivers: list[dict[str, str]] = []
        for raw in parsed.get("drivers") or []:
            if not isinstance(raw, dict):
                continue
            title = _clip(raw.get("title"), 54)
            detail = _clip(raw.get("detail"), 150)
            tone = str(raw.get("tone") or "neutral").lower()
            if title and detail and tone in {"positive", "negative", "neutral"}:
                drivers.append({"title": title, "detail": detail, "tone": tone})
            if len(drivers) >= 3:
                break
        return summary, drivers, llm_model("gpt-5.6-luna")
    except Exception as exc:
        print(f"[warn] opening-sentiment LLM synthesis failed: {exc}")
        return "", [], "rules"


def build_opening_report(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    phase: str = "premarket",
    require_web_revalidate: bool = False,
) -> dict[str, Any]:
    # Keep pure scoring helpers importable in lightweight test environments
    # without yfinance installed; Cloud Run installs it from requirements.txt.
    from backend.providers.yfinance_provider import YFinanceClient, fetch_recent_sessions

    market = market.upper()
    quotes = YFinanceClient(max_workers=6).fetch_quotes(list(GLOBAL_CUES), include_fundamentals=False)
    global_cues = [
        row
        for spec in GLOBAL_CUES
        if (row := _row_for_cue(spec, quotes.get(spec["instrument_id"]))) is not None
    ]

    price_rows = []
    for spec in GLOBAL_CUES:
        raw = quotes.get(spec["instrument_id"])
        if not raw:
            continue
        price_rows.append({
            "instrument_id": spec["instrument_id"],
            "market": "US",
            "ticker": spec["ticker"],
            "captured_at": raw.get("captured_at") or _now_iso(),
            "session_phase": "pre_open",
            "source": "yfinance",
            "currency": raw.get("currency") or "USD",
            "quote": raw.get("quote") or {},
            "provider_metadata": {
                "yahoo_symbol": raw.get("yahoo_symbol") or spec["quote_symbol_yahoo"],
                "name": spec["name"],
            },
        })
    if price_rows:
        store.save_price_snapshots_bulk(price_rows)

    sessions = fetch_recent_sessions(SPX_INSTRUMENT, sessions=5)
    mover_snapshot = store.get_premarket_movers(market)
    premarket = summarize_premarket(mover_snapshot)
    social_doc = store.db.collection("reddit_snapshots").document(f"{market}__latest").get()
    social = summarize_social(social_doc.to_dict() if social_doc.exists else None)
    raw_context = store.get_premarket_context(market)
    context = raw_context if context_matches_movers(raw_context, mover_snapshot) else None
    news = summarize_news(context, premarket)
    scorecard = score_opening(global_cues, premarket, social, sessions)

    llm_payload = {
        "opening_label": scorecard["label"],
        "score": scorecard["score"],
        "confidence": scorecard["confidence"],
        "global_cues": [
            {"label": cue["label"], "region": cue["region"], "change_pct": cue["change_pct"]}
            for cue in global_cues
        ],
        "premarket": {
            "available": premarket["available"],
            "up_count": premarket["up_count"],
            "down_count": premarket["down_count"],
            "average_gap_pct": premarket["average_gap_pct"],
        },
        "social": {
            "available": social["available"],
            "sentiment_score": social["sentiment_score"],
            "top_tickers": social["top_tickers"][:3],
        },
        "news": news[:4],
        "last_session": sessions[-1] if sessions else None,
    }
    summary, drivers, model = llm_synthesis(llm_payload)
    if not summary:
        summary = fallback_summary(scorecard, premarket)
    if not drivers:
        drivers = deterministic_drivers(scorecard, premarket, social)

    report = {
        "market": market,
        "generated_at": _now_iso(),
        "source_movers_generated_at": str((mover_snapshot or {}).get("generated_at") or ""),
        "source_context_generated_at": str((context or {}).get("generated_at") or ""),
        "source_context_status": "matched" if context is not None else "missing_or_stale",
        "phase": phase,
        "score": scorecard["score"],
        "label": scorecard["label"],
        "direction": scorecard["direction"],
        "confidence": scorecard["confidence"],
        "summary": summary,
        "drivers": drivers,
        "global_cues": global_cues,
        "sessions": sessions,
        "premarket": premarket,
        "social": social,
        "news": news,
        "score_components": scorecard["components"],
        "source_note": "Global pricing via Yahoo Finance; social tape from monitored Reddit investing feeds; news context is sourced from the existing pre-market pipeline.",
        "model": model,
    }
    store.save_premarket_opening_report(market, report)

    from backend.scripts.trigger_web_revalidate import trigger_web_revalidate

    revalidated = trigger_web_revalidate(["/premarket", "/pulse"], force=True)
    if require_web_revalidate and not revalidated:
        raise RuntimeError("opening report was saved, but the web refresh failed")
    return report
