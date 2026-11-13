from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.anomaly_refs import write_refs as write_anomaly_refs
from backend.context_search import context_search_enabled, search_context_articles_for_ticker
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.open_email_intel import fresh_sector_summary_from_prices
from backend.price_pipeline_contract import (
    PriceFreshnessPolicy,
    assert_fresh_price_documents,
    partition_fresh_price_documents,
)
from backend.scripts.trigger_web_revalidate import trigger_web_revalidate
from backend.instrument_universe import get_coverage_universe_id, list_instruments
from backend.stock_intelligence import build_no_news_intelligence_doc
from backend.storage import TraceMoneyStore


OPENAI_DEFAULT_MODEL = "gpt-5.6-luna"
MIN_EXPLAIN_MOVE_PCT = 2.0
ANOMALY_REVALIDATE_PATHS = ["/", "/pulse", "/anomalies", "/radar"]
ANOMALY_INTELLIGENCE_MAX_AGE_HOURS = max(
    1,
    int(os.getenv("ANOMALY_INTELLIGENCE_MAX_AGE_HOURS", "6") or 6),
)
MARKET_TIMEZONES = {
    "US": ZoneInfo("America/New_York"),
    "IN": ZoneInfo("Asia/Kolkata"),
}
ANOMALY_CONTEXT_RESCUE_LOOKBACK_HOURS = max(
    48,
    int(os.getenv("ANOMALY_CONTEXT_RESCUE_LOOKBACK_HOURS", "48") or 48),
)
MOVE_EXPLAINER_PROMPT = """You explain sharp single-stock moves for a market app.

You receive the ticker, company name, today's price move, and the latest internal news items for that stock.

Decide whether those news items plausibly explain today's sudden move.

Rules:
- Use only the supplied news items. Do not infer from old market memory.
- If the items are unrelated, stale, contradictory, or do not explain the move, return can_explain=false.
- If they explain the move, write a plain-English headline and explanation.
- Keep headline under 12 words.
- Keep why_it_matters to 1-2 complete sentences, 35-55 words total.
- Do not mention that you are an AI or that evidence was supplied.
"""

MOVE_EXPLAINER_SCHEMA = {
    "type": "object",
    "properties": {
        "can_explain": {"type": "boolean"},
        "cause_type": {"type": "string"},
        "headline": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["can_explain", "cause_type", "headline", "why_it_matters", "confidence"],
}

INTERNAL_MOVE_CONTEXT_PROMPT = """You write non-generic context for a sharp stock move when fresh company-news evidence is absent or weak.

Use only the supplied internal stock data. Do not invent or imply a confirmed news catalyst.

First choose ONE dominant_angle. Then write the headline from only that angle.

dominant_angle must be one of:
hard_catalyst, earnings, analyst_action, sector_pressure, peer_readthrough,
technical_break, crowded_trade, valuation_reset, sentiment_shift, quiet_move.

Rules:
- If news_count/source_count is 0 or evidence is weak, confidence must be low or medium, never high.
- Keep headline under 12 words.
- Keep why_it_matters to 1-2 complete sentences.
- Avoid generic phrases like "top mover", "price momentum", or "against the broader tape".
- Do NOT blend weak generic factors in the headline.
- Do NOT use these headline phrases: "amid consolidation", "amid neutral technicals", "despite strong analyst", "strong analyst upside", "no fresh news", "cautious sentiment and neutral technicals".
- Analyst targets are never the headline reason unless dominant_angle is analyst_action.
- If there is no hard catalyst, say the market behavior plainly: "momentum unwinds", "breaks lower without a fresh catalyst", "crowded trade cools", "sector pressure hits", or "valuation resets".
- Do NOT use upcoming earnings or a generic future catalyst as the main reason unless the supplied payload includes explicit same-day evidence tying today's move to it.
- Prefer concrete structural explanations from the payload: pillar imbalances, analyst-target gap, sector tape, market backdrop, and relative performance vs market/sector.
- Be concrete and honest when there is no clean catalyst.
"""

INTERNAL_MOVE_CONTEXT_SCHEMA = {
    "type": "object",
    "properties": {
        "dominant_angle": {
            "type": "string",
            "enum": [
                "hard_catalyst",
                "earnings",
                "analyst_action",
                "sector_pressure",
                "peer_readthrough",
                "technical_break",
                "crowded_trade",
                "valuation_reset",
                "sentiment_shift",
                "quiet_move",
            ],
        },
        "headline": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium"]},
        "is_generic": {"type": "boolean"},
    },
    "required": ["dominant_angle", "headline", "why_it_matters", "confidence", "is_generic"],
    "additionalProperties": False,
}

DOMINANT_ANGLES = {
    "hard_catalyst",
    "earnings",
    "analyst_action",
    "sector_pressure",
    "peer_readthrough",
    "technical_break",
    "crowded_trade",
    "valuation_reset",
    "sentiment_shift",
    "quiet_move",
}

GENERIC_HEADLINE_PATTERNS = (
    "amid consolidation",
    "amid neutral technicals",
    "despite strong analyst",
    "strong analyst upside",
    "strong analyst target",
    "no fresh news",
    "cautious sentiment and neutral technicals",
    "quiet consolidation",
    "without fresh catalyst",
    "without a fresh catalyst",
    "without a clear catalyst",
    "without catalyst",
    "no fresh catalyst",
    "with no fresh catalyst",
    "momentum unwinds",
    "dips modestly",
)

CRYPTO_EXPOSED_TICKERS = {"MSTR", "COIN", "HOOD", "RIOT", "MARA", "CLSK", "IREN", "APLD", "HUT", "BTDR"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _parse_timestamp(value: Any) -> datetime | None:
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


def _intelligence_timestamp(intel_doc: dict[str, Any] | None) -> datetime | None:
    if not isinstance(intel_doc, dict):
        return None
    return _parse_timestamp(
        intel_doc.get("generated_at") or intel_doc.get("as_of") or intel_doc.get("updated_at")
    )


def _is_current_intelligence_for_quote(
    intel_doc: dict[str, Any] | None,
    quote_doc: dict[str, Any] | None,
    *,
    market: str,
) -> bool:
    """Return whether narrative research can truthfully describe this quote.

    Price snapshots and stock research are produced independently. A prior
    session's stock brief is valuable historical context, but must never be
    labelled as the reason for a new mover. Require the same market session
    and a bounded age window before the public anomaly feed joins them.
    """
    if not isinstance(quote_doc, dict):
        return False
    quote_time = _parse_timestamp(quote_doc.get("captured_at") or quote_doc.get("updated_at"))
    intel_time = _intelligence_timestamp(intel_doc)
    if quote_time is None or intel_time is None:
        return False
    market_tz = MARKET_TIMEZONES.get(str(market or "").upper(), timezone.utc)
    if quote_time.astimezone(market_tz).date() != intel_time.astimezone(market_tz).date():
        return False
    return intel_time >= quote_time - timedelta(hours=ANOMALY_INTELLIGENCE_MAX_AGE_HOURS)


def _ticker_context_doc_id(market: str, ticker: str) -> str:
    return f"{market.upper()}__{str(ticker or '').strip().upper()}"


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _mentions_earnings(value: Any) -> bool:
    return "earnings" in _clean_text(value).lower()


def _filtered_internal_text(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    if _mentions_earnings(text):
        return ""
    return text


def _filtered_catalyst_text(value: Any) -> str:
    text = _filtered_internal_text(value)
    lowered = text.lower()
    if not text or lowered in {"none", "n/a"}:
        return ""
    if lowered.startswith("upcoming ") or " could " in lowered or "watch for " in lowered:
        return ""
    if "await" in lowered or "waiting for" in lowered:
        return ""
    return text


def _pillar_snapshot(intel_pro_doc: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    pillars = (intel_pro_doc or {}).get("pillars") or {}
    if not isinstance(pillars, dict):
        return out
    for name, payload in pillars.items():
        if not isinstance(payload, dict):
            continue
        standout = ""
        weak = ""
        metrics = payload.get("metrics") or []
        if isinstance(metrics, list):
            for row in metrics:
                if not isinstance(row, dict):
                    continue
                score = row.get("score")
                label = _clean_text(row.get("label") or row.get("summary"))
                if not label or not isinstance(score, (int, float)):
                    continue
                if score >= 75 and not standout:
                    standout = label
                if score <= 25 and not weak:
                    weak = label
        out[str(name)] = {
            "score": payload.get("score"),
            "verdict": _clean_text(payload.get("verdict")),
            "standout": standout,
            "weak": weak,
        }
    return out


def _context_brief(doc: dict[str, Any] | None) -> str:
    payload = doc or {}
    visual = payload.get("visual_summary") if isinstance(payload.get("visual_summary"), dict) else {}
    for candidate in (
        visual.get("what_changed"),
        payload.get("today_brief"),
        visual.get("why_it_matters"),
        payload.get("week_brief"),
    ):
        text = _filtered_internal_text(candidate)
        if text:
            return text
    return ""


def _has_sourced_explanation(row: dict[str, Any]) -> bool:
    explanation = row.get("move_explanation")
    if not isinstance(explanation, dict):
        return False
    evidence = explanation.get("evidence") or []
    return bool(
        str(row.get("ticker") or "").strip()
        and str(explanation.get("headline") or "").strip()
        and any(isinstance(item, dict) and str(item.get("url") or "").startswith(("http://", "https://")) for item in evidence)
    )


_UNEXPLAINED_CAUSES = {"price_action", "no_verified_catalyst", "unknown", "none"}


def is_confirmed_move(row: dict[str, Any]) -> bool:
    """Mirror of isConfirmedMove (lib/seo/families.ts): whether the web gives this move a page."""
    if not isinstance(row, dict) or row.get("narrative_status") != "verified" or not _has_sourced_explanation(row):
        return False
    explanation = row["move_explanation"]
    if str(explanation.get("confidence") or "").lower() not in {"high", "medium"}:
        return False
    cause = str(explanation.get("cause_type") or "").strip().lower()
    if not cause or cause in _UNEXPLAINED_CAUSES:
        return False
    return not str(explanation.get("external_source") or "").startswith("internal_tape")


def merge_explained_day(existing: list[dict[str, Any]], current: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Merge one day's explained movers into what the day's archive already holds.

    A ticker researched again replaces its earlier row; a ticker that dropped
    out of the live mover list keeps the row it had, so a published "why it
    moved" page never disappears later the same day. Returns the merged rows
    (largest move first) and the tickers that are new to the day.
    """
    merged: dict[str, dict[str, Any]] = {}
    for row in existing:
        if isinstance(row, dict) and _has_sourced_explanation(row):
            merged[str(row["ticker"]).strip().upper()] = row
    added: list[str] = []
    for row in current:
        if not isinstance(row, dict) or not _has_sourced_explanation(row):
            continue
        ticker = str(row["ticker"]).strip().upper()
        if ticker not in merged:
            added.append(ticker)
        merged[ticker] = row
    rows = sorted(merged.values(), key=lambda row: -abs(float(row.get("day_change_pct") or 0)))
    return rows, sorted(added)


# Midday rebuilds (`mid_check`) re-select the movers from the fresh tape. A
# source-backed reason researched earlier the same session still explains a
# stock that is moving the same way, so it is carried over instead of being
# dropped and researched again. Only reasons written intraday qualify: a
# post-close reason says "closed", and an intraday one must not open the close.
CARRY_REASON_FROM_PHASES = frozenset({"open_check", "mid_check"})
# A reason that quotes the day's move ("the 11.85% gain") is carried only while
# that figure still describes the current move, to the nearest half point.
# Rounded figures ("up 12%" for 11.3%) get a whole point.
CARRY_MOVE_FIGURE_TOLERANCE_PCT = 0.5
CARRY_ROUNDED_FIGURE_TOLERANCE_PCT = 1.0
# A move that has grown well past the one the reason was written for may have a
# new cause (an upgrade at 2%, a takeover at 18%), so it is researched again.
CARRY_MAX_GROWTH_PCT_POINTS = 3.0
CARRY_MAX_GROWTH_RATIO = 0.5
# Every narrative field the reason pass owns (research_daily_anomaly_reasons).
CARRIED_REASON_FIELDS = (
    "narrative_status",
    "narrative_as_of",
    "move_explanation",
    "headline",
    "thesis",
    "today_brief",
    "catalyst",
    "risk",
    "key_points",
    "visual_summary",
    "overall_verdict",
    "comparative_context",
)
_PERCENT_FIGURE = re.compile(r"(?<![\d.])(\d+(?:\.(\d+))?)\s?(?:%|percent\b)", re.IGNORECASE)


def is_carryable_reason(row: dict[str, Any]) -> bool:
    """A reason worth keeping across an intraday rebuild: verified and source-backed.

    Tape reads (`internal_tape_*`) and "no verified catalyst" rows quote the
    snapshot's own numbers or say nothing, so the next pass redoes them.
    """
    if not isinstance(row, dict) or row.get("narrative_status") != "verified" or not _has_sourced_explanation(row):
        return False
    explanation = row["move_explanation"]
    cause = str(explanation.get("cause_type") or "").strip().lower()
    if not cause or cause in _UNEXPLAINED_CAUSES or cause == "price_context":
        return False
    return not str(explanation.get("external_source") or "").startswith("internal_tape")


def _market_day(value: Any, market: str) -> str | None:
    """The market's local day for a stamp; a midnight-UTC daily-bar label keeps its own date."""
    parsed = _parse_timestamp(value)
    if parsed is None:
        return None
    if parsed.time() == datetime.min.time():
        # Yahoo daily bars label the trading day as midnight UTC (see
        # price_pipeline_contract.is_current_market_timestamp); shifting that
        # into New York would make it the day before.
        return parsed.date().isoformat()
    return parsed.astimezone(MARKET_TIMEZONES.get(market.upper(), timezone.utc)).date().isoformat()


def _reason_still_fits_move(explanation: dict[str, Any], written_for_pct: float, current_pct: float) -> bool:
    """Whether a reason written for one move size still reads true for the current one.

    False when the move has grown well past it (it may have a new cause), or
    when the text quotes the old size ("the 11.85% gain") and that figure no
    longer describes the move.
    """
    written, current = abs(written_for_pct), abs(current_pct)
    if current - written > max(CARRY_MAX_GROWTH_PCT_POINTS, CARRY_MAX_GROWTH_RATIO * written):
        return False
    text = f"{explanation.get('headline') or ''} {explanation.get('why_it_matters') or ''}"
    for match in _PERCENT_FIGURE.finditer(text):
        figure = float(match.group(1))
        tolerance = CARRY_MOVE_FIGURE_TOLERANCE_PCT if match.group(2) else CARRY_ROUNDED_FIGURE_TOLERANCE_PCT
        if abs(figure - written) <= tolerance and abs(figure - current) > tolerance:
            return False
    return True


def _carry_key(row: dict[str, Any]) -> str:
    return str(row.get("instrument_id") or row.get("ticker") or "").strip().upper()


def carry_session_reasons(
    previous: dict[str, Any] | None,
    rows: list[dict[str, Any]],
    *,
    market: str,
    archived: dict[str, Any] | None = None,
) -> list[str]:
    """Copy same-session, same-direction verified reasons from earlier today onto `rows`.

    `previous` is the feed being replaced; `archived` is the day's dated copy
    (archive_explained_day), which also holds a stock that dropped out of the
    previous feed and came back. Mutates `rows` in place and returns the
    carried tickers. A reason is never carried across New York days (its
    quote, its research and the new quote must share one market day), from a
    post-close feed, onto a stock whose move flipped direction, or onto a move
    that has outgrown it. Rows left without a reason are what the reason pass
    researches next (`--only-unresolved`).
    """
    earlier: dict[str, dict[str, Any]] = {}
    # The archive has no phase of its own. Read it only when the feed it sits
    # beside is intraday: before 15:30 ET (the midday window) the day's archive
    # holds intraday research only, and the day checks below do the rest.
    if not isinstance(previous, dict) or previous.get("price_session_phase") not in CARRY_REASON_FROM_PHASES:
        return []
    for source in (archived, previous):
        for row in (source or {}).get("anomalies") or []:
            if is_carryable_reason(row) and _carry_key(row):
                earlier[_carry_key(row)] = row  # the live feed wins over the archive
    carried: list[str] = []
    for row in rows:
        key = _carry_key(row)
        before = earlier.get(key)
        if not before or row.get("narrative_status") == "verified":
            continue
        day = _market_day(row.get("price_as_of"), market)
        if (
            day is None
            or _market_day(before.get("price_as_of"), market) != day
            or _market_day(before.get("narrative_as_of"), market) != day
        ):
            continue
        current_pct = _to_float(row.get("day_change_pct"))
        previous_pct = _to_float(before.get("day_change_pct"))
        if current_pct is None or previous_pct is None:
            continue
        if row.get("direction") != before.get("direction") or (current_pct >= 0) != (previous_pct >= 0):
            continue
        explanation = before["move_explanation"]
        written_for = _to_float(explanation.get("researched_day_change_pct"))
        if written_for is None or (written_for >= 0) != (previous_pct >= 0):
            written_for = previous_pct  # reasons researched before this field existed
        if not _reason_still_fits_move(explanation, written_for, current_pct):
            continue
        for field in CARRIED_REASON_FIELDS:
            row[field] = deepcopy(before.get(field))
        carried.append(str(row.get("ticker") or key).strip().upper())
    return carried


def archive_explained_day(store: TraceMoneyStore, market: str, payload: dict[str, Any]) -> list[str]:
    """Keep the day's explained movers at tm_daily_anomalies/{MARKET}__{YYYY-MM-DD}.

    `{MARKET}__latest` is replaced every run; the dated copy is what the
    /stock/[T]/moves/[day] and /movers/[day] pages read once the day is over.
    Only rows with a sourced explanation are kept. Returns the tickers new to
    the day that get a page (is_confirmed_move), so only live pages are pinged.
    """
    day = str(payload.get("date") or "")[:10]
    if len(day) != 10 or day[4] != "-" or day[7] != "-":
        return []
    market_key = market.upper()
    ref = store.db.collection("tm_daily_anomalies").document(f"{market_key}__{day}")
    snapshot = ref.get()
    existing = (snapshot.to_dict() or {}).get("anomalies") or [] if snapshot.exists else []
    current = [row for row in (payload.get("anomalies") or []) if isinstance(row, dict)]
    rows, added = merge_explained_day(existing, current)
    if not rows:
        return []
    archived = {
        "market": market_key,
        "date": day,
        "archived": True,
        "generated_at": payload.get("generated_at"),
        "reasoned_at": payload.get("reasoned_at"),
        "anomalies": rows,
        "anomaly_count": len(rows),
    }
    ref.set(archived)
    write_anomaly_refs(store.db, f"tm_daily_anomalies/{market_key}__{day}", archived)
    confirmed = {str(row.get("ticker") or "").strip().upper() for row in rows if is_confirmed_move(row)}
    return [ticker for ticker in added if ticker in confirmed]


def _write_ticker_read_models(store: TraceMoneyStore, market: str, payload: dict[str, Any]) -> None:
    """Write per-ticker anomaly docs so stock pages avoid the full anomalies feed."""
    market_key = market.upper()
    rows = [row for row in (payload.get("anomalies") or []) if isinstance(row, dict)]
    current_tickers = sorted({str(row.get("ticker") or "").strip().upper() for row in rows if row.get("ticker")})
    index_ref = store.db.collection("tm_daily_anomaly_ticker_index").document(market_key)
    previous = index_ref.get()
    previous_tickers = []
    if previous.exists:
        previous_data = previous.to_dict() or {}
        previous_tickers = [
            str(ticker or "").strip().upper()
            for ticker in (previous_data.get("tickers") or [])
            if str(ticker or "").strip()
        ]

    batch = store.db.batch()
    collection = store.db.collection("tm_daily_anomaly_tickers")
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        batch.set(
            collection.document(_ticker_context_doc_id(market_key, ticker)),
            {
                "market": market_key,
                "ticker": ticker,
                "generated_at": payload.get("generated_at"),
                "enriched_at": payload.get("enriched_at"),
                "date": payload.get("date"),
                "anomaly": row,
            },
        )
    for ticker in sorted(set(previous_tickers) - set(current_tickers)):
        batch.delete(collection.document(_ticker_context_doc_id(market_key, ticker)))
    batch.set(
        index_ref,
        {
            "market": market_key,
            "generated_at": payload.get("generated_at"),
            "date": payload.get("date"),
            "tickers": current_tickers,
            "count": len(current_tickers),
        },
    )
    batch.commit()


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    return None


def _latest_timeline_items(intel_doc: dict[str, Any] | None, *, limit: int = 3) -> list[dict[str, Any]]:
    intel = intel_doc or {}
    rows = [row for row in (intel.get("timeline") or []) if isinstance(row, dict)]
    rows.sort(key=lambda row: str(row.get("timestamp") or ""), reverse=True)
    out: list[dict[str, Any]] = []
    for row in rows:
        title = str(row.get("title") or "").strip()
        summary = str(row.get("summary") or "").strip()
        if not title and not summary:
            continue
        out.append(
            {
                "date": str(row.get("timestamp") or "").strip()[:10],
                "source": str(row.get("source_name") or "").strip(),
                "title": title,
                "summary": summary,
                "url": str(row.get("article_url") or "").strip(),
            }
        )
        if len(out) >= limit:
            break
    return out


def _article_matches_instrument(article: dict[str, Any], instrument: dict[str, Any]) -> bool:
    ticker = str(instrument.get("ticker") or "").strip().upper()
    company = _clean_text(instrument.get("name")).lower()
    aliases = [ticker.lower()]
    if company:
        aliases.append(company)
        aliases.extend(part for part in company.replace(",", " ").split()[:2] if len(part) >= 5)
    haystack = _clean_text(f"{article.get('title')} {article.get('summary')}").lower()
    return any(alias and alias in haystack for alias in aliases)


def _reject_off_topic_crypto_explanation(text: str, instrument: dict[str, Any]) -> bool:
    lowered = text.lower()
    if not any(term in lowered for term in ("crypto", "bitcoin", "btc")):
        return False
    ticker = str(instrument.get("ticker") or "").strip().upper()
    sector = str(instrument.get("sector") or "").strip().lower()
    industry = str(instrument.get("industry") or "").strip().lower()
    if ticker in CRYPTO_EXPOSED_TICKERS:
        return False
    return "crypto" not in sector and "crypto" not in industry and "bitcoin" not in industry


def _fallback_move_explanation() -> dict[str, Any]:
    return {
        "cause_type": "unclear",
        "dominant_angle": "quiet_move",
        "headline": "No clear company-specific driver surfaced yet.",
        "why_it_matters": "The move is large, but current internal news and intelligence do not explain it cleanly.",
        "confidence": "low",
        "searched_externally": False,
        "evidence": [],
    }


def _llm_move_explanation(
    *,
    instrument: dict[str, Any],
    day_change_pct: float,
    articles: list[dict[str, Any]],
) -> dict[str, Any] | None:
    articles = [row for row in articles if _article_matches_instrument(row, instrument)]
    if not articles:
        return None
    api_key = llm_api_key()
    if not api_key:
        return None
    payload = {
        "ticker": str(instrument.get("ticker") or "").strip().upper(),
        "company": str(instrument.get("name") or instrument.get("ticker") or "").strip(),
        "day_change_pct": day_change_pct,
        "direction": "up" if day_change_pct >= 0 else "down",
        "latest_articles": articles,
    }
    try:
        body = post_chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": schema_system_prompt(MOVE_EXPLAINER_PROMPT, MOVE_EXPLAINER_SCHEMA),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=llm_model(OPENAI_DEFAULT_MODEL),
            temperature=0.0,
            response_format=json_response_format(),
            timeout=35,
            stage="anomaly_source_explainer",
            max_attempts=3,
        )
        parsed = parse_json_content(body["choices"][0]["message"]["content"])
    except Exception as exc:
        print(f"  [move explainer] failed {payload['ticker']}: {exc}", flush=True)
        return None
    if not parsed.get("can_explain"):
        return None
    headline = str(parsed.get("headline") or "").strip()
    why = str(parsed.get("why_it_matters") or "").strip()
    if not headline or not why:
        return None
    if _reject_off_topic_crypto_explanation(f"{headline} {why}", instrument):
        return None
    return {
        "cause_type": str(parsed.get("cause_type") or "company_news").strip() or "company_news",
        "dominant_angle": "hard_catalyst",
        "headline": headline,
        "why_it_matters": why,
        "confidence": str(parsed.get("confidence") or "medium").strip() or "medium",
        "searched_externally": False,
        "evidence": [{"title": row.get("title"), "url": row.get("url")} for row in articles if row.get("url")],
    }


def _article_to_move_item(article: Any) -> dict[str, Any]:
    key_points = [
        str(point or "").strip()
        for point in (getattr(article, "article_key_points", []) or [])
        if str(point or "").strip()
    ]
    summary = (
        str(getattr(article, "article_overview", "") or "").strip()
        or str(getattr(article, "summary", "") or "").strip()
        or " ".join(key_points[:2]).strip()
        or str(getattr(article, "body_text", "") or "").strip()[:500]
    )
    return {
        "date": str(getattr(article, "published_at", "") or "").strip()[:10],
        "source": str(getattr(article, "source_name", "") or "").strip(),
        "title": str(getattr(article, "title", "") or "").strip(),
        "summary": summary,
        "url": str(getattr(article, "url", "") or "").strip(),
    }


def _context_rescue_move_explanation(
    *,
    instrument: dict[str, Any],
    market: str,
    universe_id: str,
    day_change_pct: float,
    store: TraceMoneyStore | None = None,
    limit: int = 5,
    lookback_hours: int = ANOMALY_CONTEXT_RESCUE_LOOKBACK_HOURS,
) -> dict[str, Any] | None:
    if not context_search_enabled():
        return None
    articles, health = search_context_articles_for_ticker(
        instrument,
        market=market,
        limit=limit,
        lookback_hours=lookback_hours,
    )
    ticker = str(instrument.get("ticker") or "").strip().upper()
    if not articles:
        print({"stage": "anomaly_context_rescue_empty", "ticker": ticker, "health": health}, flush=True)
        return None

    if store is not None:
        store.upsert_news_articles(market, universe_id, [article.to_dict() for article in articles], source_health=[health])

    try:
        enriched = OpenAIArticleEnricher(store=store).enrich_articles(articles)
    except Exception as exc:
        print(f"  [anomaly context rescue] enrichment failed {ticker}: {exc}", flush=True)
        enriched = articles

    if store is not None and enriched:
        store.upsert_article_enrichments(market, universe_id, [article.to_dict() for article in enriched])

    explanation = _llm_move_explanation(
        instrument=instrument,
        day_change_pct=day_change_pct,
        articles=[_article_to_move_item(article) for article in enriched],
    )
    if not explanation:
        return None
    explanation["searched_externally"] = True
    explanation["external_source"] = "context_web_search"
    return explanation


def _is_generic_anomaly_headline(value: Any) -> bool:
    text = _clean_text(value).lower()
    return any(pattern in text for pattern in GENERIC_HEADLINE_PATTERNS)


def _normalize_angle(value: Any, *, fallback: str = "quiet_move") -> str:
    angle = str(value or "").strip().lower()
    return angle if angle in DOMINANT_ANGLES else fallback


def _rewrite_headline_from_angle(
    *,
    ticker: str,
    direction: str,
    angle: str,
    sector: str = "",
) -> str:
    moves_down = direction == "down"
    sector_label = sector or "sector"
    quiet_down = [
        f"{ticker} breaks lower as buyers step back",
        f"{ticker} gives back recent momentum",
        f"{ticker} slides as the tape fades",
        f"{ticker} sells off as risk appetite fades",
    ]
    quiet_up = [
        f"{ticker} catches a bid in quiet trading",
        f"{ticker} extends its recent momentum",
        f"{ticker} lifts as buyers step in",
        f"{ticker} rises as buyers rotate in",
    ]
    quiet = (quiet_down if moves_down else quiet_up)[sum(ord(c) for c in ticker) % 4]
    templates = {
        "sector_pressure": f"{ticker} {'falls with' if moves_down else 'lifts with'} {sector_label} {'pressure' if moves_down else 'strength'}",
        "peer_readthrough": f"{ticker} {'slides on' if moves_down else 'jumps on'} peer read-through",
        "technical_break": f"{ticker} {'breaks lower' if moves_down else 'breaks higher'} on technical pressure",
        "crowded_trade": f"{ticker} {'drops as crowded trade cools' if moves_down else 'rallies as momentum returns'}",
        "valuation_reset": f"{ticker} {'reprices on valuation reset' if moves_down else 'rerates on valuation gap'}",
        "sentiment_shift": f"{ticker} {'sells off as sentiment fades' if moves_down else 'lifts as sentiment improves'}",
        "quiet_move": quiet,
        "analyst_action": f"{ticker} {'moves on analyst pressure' if moves_down else 'moves on analyst support'}",
        "earnings": f"{ticker} {'falls on earnings read-through' if moves_down else 'rises on earnings read-through'}",
        "hard_catalyst": f"{ticker} {'falls on company catalyst' if moves_down else 'rises on company catalyst'}",
    }
    return templates.get(angle, templates["quiet_move"])


def _sanitize_move_explanation(
    explanation: dict[str, Any],
    *,
    instrument: dict[str, Any],
    day_change_pct: float,
) -> dict[str, Any]:
    ticker = str(instrument.get("ticker") or explanation.get("ticker") or "").strip().upper()
    direction = "up" if day_change_pct >= 0 else "down"
    angle = _normalize_angle(explanation.get("dominant_angle"), fallback="quiet_move")
    headline = _clean_text(explanation.get("headline"))
    if _is_generic_anomaly_headline(headline):
        headline = _rewrite_headline_from_angle(
            ticker=ticker,
            direction=direction,
            angle=angle,
            sector=str(instrument.get("sector") or "").strip(),
        )
    cleaned = dict(explanation)
    cleaned["dominant_angle"] = angle
    cleaned["headline"] = headline
    return cleaned


def _internal_move_payload(
    *,
    instrument: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    day_change_pct: float,
    intel_pro_doc: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    intel = intel_doc or {}
    visual = intel.get("visual_summary") if isinstance(intel.get("visual_summary"), dict) else {}
    visual_payload = {
        "drivers": visual.get("drivers") if isinstance(visual.get("drivers"), list) else [],
        "risk_cards": visual.get("risk_cards") if isinstance(visual.get("risk_cards"), list) else [],
        "what_changed": _filtered_internal_text(visual.get("what_changed")),
        "why_it_matters": _filtered_internal_text(visual.get("why_it_matters")),
        "what_to_watch": _filtered_internal_text(visual.get("what_to_watch")),
    }
    return {
        "ticker": str(instrument.get("ticker") or intel.get("ticker") or "").strip().upper(),
        "company": str(instrument.get("name") or intel.get("name") or instrument.get("ticker") or "").strip(),
        "sector": str(instrument.get("sector") or intel.get("sector") or "").strip(),
        "industry": str(instrument.get("industry") or intel.get("industry") or "").strip(),
        "day_change_pct": day_change_pct,
        "headline": _filtered_internal_text(intel.get("headline")),
        "today_brief": _filtered_internal_text(intel.get("today_brief") or intel.get("body")),
        "thesis": _filtered_internal_text(intel.get("thesis")),
        "risk": _filtered_internal_text(intel.get("risk")),
        "overall_label": str(intel.get("overall_label") or "").strip(),
        "overall_score": intel.get("overall_score"),
        "key_points": [
            point for point in (_filtered_internal_text(p) for p in (intel.get("key_points") or []))
            if point
        ][:4],
        "visual_summary": visual_payload,
        "news_count": int(intel.get("news_count") or 0),
        "source_count": int(intel.get("source_count") or 0),
        "comparative_context": intel.get("comparative_context")
        if isinstance(intel.get("comparative_context"), dict)
        else None,
        "pillars": _pillar_snapshot(intel_pro_doc),
        "market_context": {"today_brief": _context_brief(market_context)},
        "sector_context": {"today_brief": _context_brief(sector_context)},
    }


def _llm_internal_context_move_explanation(
    *,
    instrument: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    day_change_pct: float,
    intel_pro_doc: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    api_key = llm_api_key()
    if not api_key:
        return None
    payload = _internal_move_payload(
        instrument=instrument,
        intel_doc=intel_doc,
        day_change_pct=day_change_pct,
        intel_pro_doc=intel_pro_doc,
        market_context=market_context,
        sector_context=sector_context,
    )
    if not any(
        payload.get(key)
        for key in (
            "today_brief",
            "thesis",
            "risk",
            "key_points",
            "visual_summary",
            "comparative_context",
            "pillars",
            "market_context",
            "sector_context",
        )
    ):
        return None
    try:
        body = post_chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": schema_system_prompt(
                        INTERNAL_MOVE_CONTEXT_PROMPT,
                        INTERNAL_MOVE_CONTEXT_SCHEMA,
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=llm_model(OPENAI_DEFAULT_MODEL),
            temperature=0.1,
            response_format=json_response_format(),
            timeout=35,
            stage="anomaly_internal_context",
            max_attempts=3,
        )
        parsed = parse_json_content(body["choices"][0]["message"]["content"])
    except Exception as exc:
        print(f"  [move internal context] failed {payload['ticker']}: {exc}", flush=True)
        return None
    if parsed.get("is_generic"):
        return None
    headline = str(parsed.get("headline") or "").strip()
    why = str(parsed.get("why_it_matters") or "").strip()
    if not headline or not why:
        return None
    if _mentions_earnings(headline) or _mentions_earnings(why):
        return None
    confidence = str(parsed.get("confidence") or "low").strip().lower()
    if confidence not in {"low", "medium"}:
        confidence = "medium"
    return {
        "cause_type": "internal_context",
        "dominant_angle": _normalize_angle(parsed.get("dominant_angle")),
        "headline": headline,
        "why_it_matters": why,
        "confidence": confidence,
        "searched_externally": False,
        "evidence": [],
    }


def _clean_sentence(value: Any, *, max_chars: int = 170) -> str:
    text = " ".join(str(value or "").strip().split())
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0].rstrip(" ,;:")
    return f"{cut}."


def _clean_clause(value: Any, *, max_chars: int = 120) -> str:
    text = " ".join(str(value or "").strip().split()).rstrip(" .")
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0].rstrip(" ,;:")


def _structured_internal_context_move_explanation(
    *,
    instrument: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    day_change_pct: float,
    intel_pro_doc: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    payload = _internal_move_payload(
        instrument=instrument,
        intel_doc=intel_doc,
        day_change_pct=day_change_pct,
        intel_pro_doc=intel_pro_doc,
        market_context=market_context,
        sector_context=sector_context,
    )
    ticker = str(payload.get("ticker") or "").strip().upper()
    if not ticker:
        return None

    visual = payload.get("visual_summary") if isinstance(payload.get("visual_summary"), dict) else {}
    drivers = [row for row in (visual.get("drivers") or []) if isinstance(row, dict)]
    key_points = [str(p).strip() for p in (payload.get("key_points") or []) if str(p).strip()]
    thesis = str(payload.get("thesis") or "").strip()
    brief = str(payload.get("today_brief") or "").strip()
    sector_brief = str(((payload.get("sector_context") or {}).get("today_brief")) or "").strip()
    market_brief = str(((payload.get("market_context") or {}).get("today_brief")) or "").strip()

    positive_drivers = [
        row
        for row in drivers
        if str(row.get("direction") or "").lower() in {"up", "mixed", ""}
        and (str(row.get("label") or "").strip() or str(row.get("detail") or "").strip())
    ]
    negative_drivers = [
        row
        for row in drivers
        if str(row.get("direction") or "").lower() == "down"
        and (str(row.get("label") or "").strip() or str(row.get("detail") or "").strip())
    ]
    primary = positive_drivers[0] if day_change_pct >= 0 and positive_drivers else drivers[0] if drivers else None
    counter = negative_drivers[0] if negative_drivers else None

    primary_label = _clean_clause((primary or {}).get("label"), max_chars=70)
    primary_detail = _clean_clause((primary or {}).get("detail"), max_chars=125)
    counter_label = _clean_clause((counter or {}).get("label"), max_chars=70)
    counter_detail = _clean_clause((counter or {}).get("detail"), max_chars=115)

    anchor = (
        primary_detail
        or _clean_clause(key_points[0] if key_points else "", max_chars=125)
        or _clean_clause(thesis, max_chars=125)
        or _clean_clause(brief, max_chars=125)
        or _clean_clause(sector_brief, max_chars=125)
        or _clean_clause(market_brief, max_chars=125)
    )
    if not anchor:
        return None

    direction = "rise" if day_change_pct >= 0 else "drop"
    headline_base = primary_label or thesis or key_points[0] or f"{ticker} setup reprices"
    angle = "sector_pressure" if sector_brief else "valuation_reset" if "target" in " ".join(key_points).lower() else "quiet_move"
    headline = _rewrite_headline_from_angle(
        ticker=ticker,
        direction="up" if day_change_pct >= 0 else "down",
        angle=angle,
        sector=str(payload.get("sector") or "").strip(),
    )

    why = f"The move looks like investors leaning into {anchor}."
    if counter_detail or counter_label:
        why += f" {counter_detail or counter_label}. That keeps the read from being a clean catalyst."
    elif sector_brief:
        why += f" Sector backdrop: {_clean_clause(sector_brief, max_chars=105)}."
    elif market_brief:
        why += f" Market backdrop: {_clean_clause(market_brief, max_chars=105)}."

    return {
        "cause_type": "internal_context",
        "dominant_angle": angle,
        "headline": headline,
        "why_it_matters": why,
        "confidence": "low",
        "searched_externally": False,
        "evidence": [],
    }


def _move_explanation(
    *,
    instrument: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    day_change_pct: float,
    external_search: bool,
    intel_pro_doc: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
    market: str = "US",
    universe_id: str = "",
    store: TraceMoneyStore | None = None,
) -> dict[str, Any] | None:
    if abs(day_change_pct) < MIN_EXPLAIN_MOVE_PCT:
        return None
    explanation = _llm_move_explanation(
        instrument=instrument,
        day_change_pct=day_change_pct,
        articles=_latest_timeline_items(intel_doc, limit=3),
    )
    if explanation:
        return _sanitize_move_explanation(explanation, instrument=instrument, day_change_pct=day_change_pct)
    if external_search:
        context_explanation = _context_rescue_move_explanation(
            instrument=instrument,
            market=market,
            universe_id=universe_id,
            day_change_pct=day_change_pct,
            store=store,
        )
        if context_explanation:
            return _sanitize_move_explanation(
                context_explanation,
                instrument=instrument,
                day_change_pct=day_change_pct,
            )
    internal = _llm_internal_context_move_explanation(
        instrument=instrument,
        intel_doc=intel_doc,
        day_change_pct=day_change_pct,
        intel_pro_doc=intel_pro_doc,
        market_context=market_context,
        sector_context=sector_context,
    )
    if internal:
        return _sanitize_move_explanation(internal, instrument=instrument, day_change_pct=day_change_pct)
    structured = _structured_internal_context_move_explanation(
        instrument=instrument,
        intel_doc=intel_doc,
        day_change_pct=day_change_pct,
        intel_pro_doc=intel_pro_doc,
        market_context=market_context,
        sector_context=sector_context,
    )
    if structured:
        return _sanitize_move_explanation(structured, instrument=instrument, day_change_pct=day_change_pct)
    return _sanitize_move_explanation(_fallback_move_explanation(), instrument=instrument, day_change_pct=day_change_pct)


def _run_intelligence_fill_for_missing(
    *,
    market: str,
    universe_id: str,
    instrument_ids: list[str],
    per_stock_cap: int,
    chunk_workers: int,
    per_stock_lookback_hours: int,
) -> None:
    if not instrument_ids:
        return
    cmd = [
        sys.executable,
        "-m",
        "backend.scripts.build_per_stock_intelligence",
        "--market",
        market,
        "--universe",
        universe_id,
        "--instrument-ids",
        ",".join(instrument_ids),
        "--upsert",
        "--per-stock-cap",
        str(per_stock_cap),
        "--per-stock-lookback-hours",
        str(max(1, int(per_stock_lookback_hours))),
        "--broad-cap",
        "0",
        "--chunk-size",
        "10",
        "--chunk-workers",
        str(chunk_workers),
        "--skip-context",
        "--skip-materialize",
    ]
    print({"stage": "fill_missing_intelligence", "instrument_count": len(instrument_ids), "cmd": " ".join(cmd)})
    subprocess.run(cmd, check=True)


def _tracked_instrument_ids(store: TraceMoneyStore, market: str) -> list[str]:
    prefix = f"{market.upper()}_"
    seen: set[str] = set()
    out: list[str] = []
    for user in store.list_subscribed_users():
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw in tracked:
            instrument_id = str(raw or "").strip().upper()
            if not instrument_id or not instrument_id.startswith(prefix) or instrument_id in seen:
                continue
            seen.add(instrument_id)
            out.append(instrument_id)
    return out


def _load_scan_instruments(
    store: TraceMoneyStore,
    *,
    market: str,
    universe_id: str,
    include_tracked: bool,
    include_price_overrides: bool = True,
) -> list[dict[str, Any]]:
    rows = list_instruments(market, universe_id)
    by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in rows
        if str(row.get("instrument_id") or "").strip()
    }
    coverage_universe_id = get_coverage_universe_id(market)
    if coverage_universe_id and coverage_universe_id != universe_id:
        try:
            coverage_rows = list_instruments(market, coverage_universe_id)
        except ValueError:
            coverage_rows = []
        for row in coverage_rows:
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            if instrument_id:
                by_id[instrument_id] = row
    if include_tracked:
        missing_ids = [iid for iid in _tracked_instrument_ids(store, market) if iid not in by_id]
        for row in store.list_instruments(market, missing_ids):
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            if instrument_id:
                by_id[instrument_id] = row
    if include_price_overrides:
        missing_ids = [
            str(iid or "").strip().upper()
            for iid in store.get_price_core_overrides(market)
            if str(iid or "").strip().upper() not in by_id
        ]
        for row in store.list_instruments(market, missing_ids):
            instrument_id = str(row.get("instrument_id") or "").strip().upper()
            if instrument_id:
                by_id[instrument_id] = row
    return list(by_id.values())


def _pick_row(
    instrument: dict[str, Any],
    quote_doc: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    intel_pro_doc: dict[str, Any] | None = None,
    market_context: dict[str, Any] | None = None,
    sector_context: dict[str, Any] | None = None,
    *,
    explain_moves: bool,
    external_search: bool,
    market: str = "US",
    universe_id: str = "",
    store: TraceMoneyStore | None = None,
) -> dict[str, Any] | None:
    quote = (quote_doc or {}).get("quote") or {}
    price = _to_float(quote.get("current"))
    day_change_pct = _to_float(quote.get("day_change_pct"))
    if price is None or day_change_pct is None:
        return None
    previous_close = _to_float(quote.get("previous_close"))
    day_change_abs = _to_float(quote.get("day_change_abs"))
    volume = _to_float(quote.get("volume"))

    instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
    ticker = str(instrument.get("ticker") or "").strip().upper()
    direction = "up" if day_change_pct >= 0 else "down"
    intelligence_is_current = _is_current_intelligence_for_quote(
        intel_doc, quote_doc, market=market
    )
    # Never mix a fresh quote with old narrative fields. The UI receives an
    # explicit status so it can render the verified move without inventing an
    # explanation while fresh research is unavailable.
    current_intel_doc = intel_doc if intelligence_is_current else None
    key_points = [
        point for point in (_filtered_internal_text(p) for p in ((current_intel_doc or {}).get("key_points") or []))
        if point
    ][:4]
    headline = _filtered_internal_text((current_intel_doc or {}).get("headline")) or None
    thesis = _filtered_internal_text((current_intel_doc or {}).get("thesis")) or None
    raw_brief = (
        _filtered_internal_text(
            (current_intel_doc or {}).get("today_brief")
            or (current_intel_doc or {}).get("body")
            or ""
        )
        or None
    )
    brief = raw_brief or (key_points[0] if key_points else None)
    label = str((current_intel_doc or {}).get("overall_label") or "").strip() or None
    score = (current_intel_doc or {}).get("overall_score")
    overall_score = int(score) if isinstance(score, (int, float)) else None
    visual_summary = (current_intel_doc or {}).get("visual_summary")
    if not isinstance(visual_summary, dict):
        visual_summary = None
    move_explanation = (
        _move_explanation(
            instrument=instrument,
            intel_doc=current_intel_doc,
            day_change_pct=day_change_pct,
            external_search=external_search,
            intel_pro_doc=intel_pro_doc,
            market_context=market_context,
            sector_context=sector_context,
            market=market,
            universe_id=universe_id,
            store=store,
        )
        if explain_moves
        else None
    )

    if intelligence_is_current and not headline:
        sector = str(instrument.get("sector") or "").strip()
        if sector:
            headline = f"{ticker} is a top {direction} mover in {sector}."
        else:
            headline = f"{ticker} is a top {direction} mover today."
    if intelligence_is_current and not brief:
        context = (
            f"relative to its prior close and peer moves"
            if previous_close is not None
            else "against the broader tape"
        )
        brief = (
            f"Move is driven by price momentum {context}. "
            "Watch for follow-through, catalyst updates, and reversal risk in the next session."
        )

    return {
        "instrument_id": instrument_id,
        "ticker": ticker,
        "name": str(instrument.get("name") or ticker),
        "sector": instrument.get("sector"),
        "industry": instrument.get("industry"),
        "logo_url": instrument.get("logo_url"),
        "price": price,
        "previous_close": previous_close,
        "day_change_pct": day_change_pct,
        "day_change_abs": day_change_abs,
        "volume": volume,
        "price_as_of": str(quote_doc.get("captured_at") or quote_doc.get("updated_at") or ""),
        "direction": direction,
        "narrative_status": "verified" if intelligence_is_current else "unverified",
        "narrative_as_of": (
            _intelligence_timestamp(current_intel_doc).isoformat() if current_intel_doc else None
        ),
        "headline": headline,
        "thesis": thesis,
        "today_brief": brief,
        "news_count": int((current_intel_doc or {}).get("news_count") or 0),
        "source_count": int((current_intel_doc or {}).get("source_count") or 0),
        "overall_score": overall_score,
        "overall_label": label,
        "catalyst": _filtered_catalyst_text((current_intel_doc or {}).get("catalyst")) or None,
        "risk": _filtered_internal_text((current_intel_doc or {}).get("risk")) or None,
        "key_points": key_points,
        "visual_summary": visual_summary,
        "move_explanation": move_explanation,
        "overall_verdict": (current_intel_doc or {}).get("overall_verdict"),
        "comparative_context": (current_intel_doc or {}).get("comparative_context")
        if isinstance((current_intel_doc or {}).get("comparative_context"), dict)
        else None,
    }


def _select_mover_ids(
    prices: dict[str, Any],
    instrument_ids: list[str],
    threshold_pct: float,
    limit_per_side: int,
) -> list[str]:
    threshold = abs(threshold_pct)
    gainers: list[tuple[str, float]] = []
    losers: list[tuple[str, float]] = []
    for instrument_id in instrument_ids:
        pct = _to_float(((prices.get(instrument_id) or {}).get("quote") or {}).get("day_change_pct"))
        if pct is None or abs(pct) < threshold:
            continue
        if pct >= 0:
            gainers.append((instrument_id, pct))
        else:
            losers.append((instrument_id, pct))
    gainers.sort(key=lambda item: item[1], reverse=True)
    losers.sort(key=lambda item: item[1])
    return (
        [instrument_id for instrument_id, _ in gainers[: max(0, limit_per_side)]]
        + [instrument_id for instrument_id, _ in losers[: max(0, limit_per_side)]]
    )


def _assert_price_session_fresh(
    prices: dict[str, Any],
    instrument_ids: list[str],
    *,
    required_phase: str,
    max_age_hours: float,
    market: str = "US",
    now: datetime | None = None,
) -> None:
    """Fail closed when a close feed would publish an older price phase.

    A successful upstream job is not enough: quote providers can fail for an
    individual symbol and leave yesterday's `post_close` document in place.
    Validate both the requested phase and the document write time for every
    mover that is about to be published.
    """
    assert_fresh_price_documents(
        prices,
        instrument_ids,
        policy=PriceFreshnessPolicy(
            required_phase=required_phase,
            max_age_hours=max_age_hours,
            market=market,
        ),
        context=f"to publish {required_phase} anomalies",
        now=now,
    )


def _fresh_price_partition(
    prices: dict[str, Any],
    instrument_ids: list[str],
    *,
    required_phase: str,
    max_age_hours: float,
    market: str = "US",
    now: datetime | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Separate the current session snapshot from isolated provider misses."""
    fresh, stale = partition_fresh_price_documents(
        prices,
        instrument_ids,
        policy=PriceFreshnessPolicy(
            required_phase=required_phase,
            max_age_hours=max_age_hours,
            market=market,
        ),
        now=now,
    )
    return dict(fresh), stale


def main() -> None:
    parser = argparse.ArgumentParser(description="Build tm_daily_anomalies for a market")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None)
    parser.add_argument("--threshold-pct", type=float, default=1.0)
    parser.add_argument("--limit", type=int, default=15)
    parser.add_argument("--enrich-missing", action="store_true")
    parser.add_argument("--per-stock-cap", type=int, default=3)
    parser.add_argument("--per-stock-lookback-hours", type=int, default=168)
    parser.add_argument("--chunk-workers", type=int, default=4)
    parser.add_argument("--explain-hard-moves", action="store_true")
    parser.add_argument(
        "--mover-reasoning-only",
        action="store_true",
        help="Do not display generic stock-brief copy; a separate mover-evidence pass supplies reasons.",
    )
    parser.add_argument("--exclude-tracked", action="store_true")
    parser.add_argument(
        "--require-price-session-phase",
        choices=["pre_open", "open_check", "mid_check", "close_check", "post_close", "manual"],
        default=None,
        help="Fail instead of publishing when selected mover quotes are from another session phase.",
    )
    parser.add_argument(
        "--max-price-age-hours",
        type=float,
        default=8.0,
        help="Maximum tm_latest_prices age when --require-price-session-phase is set.",
    )
    parser.add_argument("--require-web-revalidate", action="store_true")
    parser.add_argument(
        "--carry-session-reasons",
        action="store_true",
        help=(
            "Midday rebuild: keep the previous feed's source-backed reasons for stocks still moving "
            "the same way this session. Requires --require-price-session-phase mid_check."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read everything and print what would be published; write nothing and skip the web refresh.",
    )
    args = parser.parse_args()
    if args.carry_session_reasons and (
        args.require_price_session_phase != "mid_check" or not args.mover_reasoning_only
    ):
        parser.error(
            "--carry-session-reasons only applies with --mover-reasoning-only "
            "and --require-price-session-phase mid_check"
        )
    if args.dry_run and (args.enrich_missing or args.explain_hard_moves):
        # Both write stock intelligence or call models before the feed write.
        parser.error("--dry-run cannot be combined with --enrich-missing or --explain-hard-moves")

    store = TraceMoneyStore()
    universe_id = args.universe or store.get_active_price_universe(args.market) or ""
    if not universe_id:
        raise ValueError(f"No active universe configured for {args.market}")

    instruments = _load_scan_instruments(
        store,
        market=args.market,
        universe_id=universe_id,
        include_tracked=not bool(args.exclude_tracked),
    )
    by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in instruments
        if str(row.get("instrument_id") or "").strip()
    }
    instrument_ids = list(by_id.keys())
    prices = store.get_latest_prices(instrument_ids)
    stale_price_ids: list[str] = []
    if args.require_price_session_phase:
        prices, stale_price_ids = _fresh_price_partition(
            prices,
            instrument_ids,
            required_phase=args.require_price_session_phase,
            max_age_hours=max(0.25, float(args.max_price_age_hours)),
            market=args.market,
        )
        minimum_fresh = max(1, int(len(instrument_ids) * 0.8))
        if len(prices) < minimum_fresh:
            raise RuntimeError(
                f"Refusing to replace anomaly feed: only {len(prices)}/{len(instrument_ids)} "
                f"price inputs match {args.require_price_session_phase}"
            )
    selected_ids = _select_mover_ids(
        prices=prices,
        instrument_ids=instrument_ids,
        threshold_pct=args.threshold_pct,
        limit_per_side=args.limit,
    )

    intelligence = (
        {}
        if args.mover_reasoning_only
        else store.get_stock_intelligence_docs_batch(args.market, universe_id, selected_ids)
    )
    intel_pro_docs = (
        {}
        if args.mover_reasoning_only or not selected_ids
        else store.get_stock_intel_pro_batch(args.market, universe_id, selected_ids)
    )
    market_context_doc = {} if args.mover_reasoning_only else (store.get_market_context_doc(args.market, universe_id) or {})
    sector_context_docs = [] if args.mover_reasoning_only or not selected_ids else store.list_sector_context_docs(args.market, universe_id)
    sector_context_by_key = {
        str(doc.get(key) or "").strip().lower(): doc
        for doc in sector_context_docs
        for key in ("sector_label", "sector_id", "sector")
        if str(doc.get(key) or "").strip()
    }
    if args.enrich_missing:
        if args.mover_reasoning_only:
            raise ValueError("--enrich-missing cannot be combined with --mover-reasoning-only")
        missing_ids = [
            instrument_id
            for instrument_id in selected_ids
            if not intelligence.get(instrument_id)
            or int((intelligence.get(instrument_id) or {}).get("news_count") or 0) <= 0
            or not _is_current_intelligence_for_quote(
                intelligence.get(instrument_id), prices.get(instrument_id), market=args.market
            )
        ]
        _run_intelligence_fill_for_missing(
            market=args.market,
            universe_id=universe_id,
            instrument_ids=missing_ids,
            per_stock_cap=args.per_stock_cap,
            chunk_workers=args.chunk_workers,
            per_stock_lookback_hours=args.per_stock_lookback_hours,
        )
        intelligence = store.get_stock_intelligence_docs_batch(args.market, universe_id, selected_ids)

    if selected_ids:
        latest_prices = store.get_latest_prices(selected_ids)
        if args.require_price_session_phase:
            _assert_price_session_fresh(
                latest_prices,
                selected_ids,
                required_phase=args.require_price_session_phase,
                max_age_hours=max(0.25, float(args.max_price_age_hours)),
                market=args.market,
            )
        # Intelligence enrichment can take minutes. Always build the final
        # output rows from a second quote read rather than the pre-enrichment
        # snapshot held in memory.
        prices.update(latest_prices)
        # The close path is intentionally price-first. Do not spend minutes
        # generating a no-news brief after the close; _pick_row emits an
        # explicitly unverified, price-only mover until current intelligence
        # exists. The open-session path has already requested enrichment.
        if args.enrich_missing:
            fallback_docs: dict[str, dict[str, Any]] = {}
            for instrument_id in selected_ids:
                existing = intelligence.get(instrument_id) or {}
                if (
                    _is_current_intelligence_for_quote(
                        existing, latest_prices.get(instrument_id), market=args.market
                    )
                    and str(existing.get("headline") or "").strip()
                    and str(existing.get("today_brief") or "").strip()
                ):
                    continue
                instrument = by_id.get(instrument_id) or {}
                fallback_doc = build_no_news_intelligence_doc(
                    instrument=instrument,
                    market=args.market,
                    universe_id=universe_id,
                    latest_price_doc=latest_prices.get(instrument_id),
                    technical_doc=None,
                    intel_pro_doc=intel_pro_docs.get(instrument_id),
                    avg_volume=None,
                    store=store,
                )
                if fallback_doc:
                    fallback_docs[instrument_id] = fallback_doc
            intelligence.update(fallback_docs)

    rows: list[dict[str, Any]] = []
    for index, instrument_id in enumerate(selected_ids):
        instrument = by_id.get(instrument_id) or {}
        sector_key = str(instrument.get("sector") or "").strip().lower()
        row = _pick_row(
            instrument,
            prices.get(instrument_id) or {},
            intelligence.get(instrument_id),
            intel_pro_docs.get(instrument_id),
            market_context_doc,
            sector_context_by_key.get(sector_key),
            explain_moves=bool(args.explain_hard_moves),
            external_search=bool(args.explain_hard_moves) and index < 12,
            market=args.market,
            universe_id=universe_id,
            store=store,
        )
        if row:
            rows.append(row)

    feed_ref = store.db.collection("tm_daily_anomalies").document(f"{args.market}__latest")
    carried_tickers: list[str] = []
    if args.carry_session_reasons and rows:
        previous_snapshot = feed_ref.get()
        previous_feed = previous_snapshot.to_dict() if previous_snapshot.exists else None
        archive_snapshot = (
            store.db.collection("tm_daily_anomalies").document(f"{args.market}__{_today_utc()}").get()
        )
        carried_tickers = carry_session_reasons(
            previous_feed,
            rows,
            market=args.market,
            archived=archive_snapshot.to_dict() if archive_snapshot.exists else None,
        )

    up_count = sum(1 for row in rows if str(row.get("direction")) == "up")
    down_count = sum(1 for row in rows if str(row.get("direction")) == "down")
    sector_summary, sector_price_as_of, sector_quoted_count = fresh_sector_summary_from_prices(instruments, prices)

    payload = {
        "market": args.market,
        "generated_at": _now_iso(),
        "enriched_at": _now_iso(),
        "date": _today_utc(),
        "anomaly_count": len(rows),
        "threshold_pct": float(args.threshold_pct),
        "up_count": up_count,
        "down_count": down_count,
        "anomalies": rows,
        "sector_summary": sector_summary,
        "sector_price_as_of": sector_price_as_of,
        "sector_quoted_count": sector_quoted_count,
        "universe_id": universe_id,
        # The dedicated anomaly-reasoning pass pins itself to this exact
        # price-session snapshot. It must never reselect movers from a later
        # intraday or pre-market quote set.
        "price_session_phase": args.require_price_session_phase,
        "reasoning_mode": "mover_evidence" if args.mover_reasoning_only else "stock_brief_join",
    }
    if args.carry_session_reasons:
        payload["carried_reason_count"] = len(carried_tickers)
    if args.dry_run:
        print(
            {
                "dry_run": True,
                "market": args.market,
                "price_session_phase": args.require_price_session_phase,
                "scanned": len(instrument_ids),
                "selected": len(selected_ids),
                "written": 0,
                "would_write": len(rows),
                "stale_price_count": len(stale_price_ids),
                "carried": carried_tickers,
                "to_research": [
                    str(row.get("ticker") or "") for row in rows if row.get("narrative_status") != "verified"
                ],
                "oldest_price_as_of": min((str(row.get("price_as_of") or "") for row in rows), default=None),
            }
        )
        return
    feed_ref.set(payload)
    write_anomaly_refs(store.db, f"tm_daily_anomalies/{args.market}__latest", payload)
    _write_ticker_read_models(store, args.market, payload)
    carry_metadata = (
        {"carried_reason_count": len(carried_tickers), "carried_reason_tickers": carried_tickers[:50]}
        if args.carry_session_reasons
        else {}
    )
    store.save_stage_watermark(
        market=args.market,
        stage_key="build_daily_anomalies",
        universe_id=universe_id,
        expected_count=len(selected_ids),
        success_count=len(rows),
        error_count=max(0, len(selected_ids) - len(rows)),
        metadata={
            "threshold_pct": args.threshold_pct,
            "limit": args.limit,
            "enrich_missing": bool(args.enrich_missing),
            "include_tracked": not bool(args.exclude_tracked),
            "include_price_overrides": True,
            "scan_count": len(instrument_ids),
            "required_price_session_phase": args.require_price_session_phase,
            "stale_price_count": len(stale_price_ids),
            "stale_price_ids": stale_price_ids[:50],
            "unverified_narrative_count": sum(
                1 for row in rows if row.get("narrative_status") != "verified"
            ),
            **carry_metadata,
        },
    )

    revalidated = trigger_web_revalidate(ANOMALY_REVALIDATE_PATHS, force=True)
    if args.require_web_revalidate and not revalidated:
        raise RuntimeError("anomaly feed was saved, but the web refresh failed")
    print(
        {
            "market": args.market,
            "scanned": len(instrument_ids),
            "selected": len(selected_ids),
            "written": len(rows),
            **({"carried_reason_count": len(carried_tickers)} if args.carry_session_reasons else {}),
        }
    )


if __name__ == "__main__":
    main()
