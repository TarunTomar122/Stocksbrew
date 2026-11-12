"""Research evidence-backed reasons for an already-materialized mover snapshot.

This is intentionally not a stock-brief job.  It receives the exact movers
that were selected from one market-session price snapshot, checks current
company news first, and only then escalates to Firecrawl search for names
without a supported explanation. It never changes prices or reselects
movers, so a late research pass cannot mix a closing explanation with a
pre-market quote.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from typing import Any

from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.news_av import fetch_av_news_for_tickers
from backend.scripts.build_daily_anomalies import (
    ANOMALY_REVALIDATE_PATHS,
    OPENAI_DEFAULT_MODEL,
    _article_to_move_item,
    _llm_move_explanation,
    _parse_timestamp,
    _sanitize_move_explanation,
    _write_ticker_read_models,
    archive_explained_day,
)
from backend.scripts.trigger_web_revalidate import (
    notify_indexnow_families,
    trigger_web_revalidate,
)
from backend.storage import TraceMoneyStore
from backend.url_extractor import firecrawl_enabled, search_firecrawl


REASON_LOOKBACK_HOURS = 48
REASON_LLM_WORKERS = 8

TAPE_EXPLAINER_PROMPT = """You explain a sharp stock move when no dated news item cleanly explains it.

You receive exact current-session price data, recent completed sessions, the
stock's latest action context, and market/sector relative performance.

Write an honest tape read, not a made-up catalyst.

Rules:
- Never invent news, earnings, analyst action, flows, or a company event.
- Never say "extends", "continues", "five-session rally", or "five-session
  slide". Those shortcuts are forbidden because an aggregate return does not
  prove every session moved in one direction.
- If today's direction opposes the recent return, describe it as a reversal
  or bounce/selloff against the recent pattern.
- Use exact supplied numbers only. Do not calculate or guess a number.
- Prefer concrete relationships: reversal, break above/below the supplied
  recent range, sector-relative out/underperformance, or unusual volume.
- Mention volume only when volume_context.comparison_available=true.
- During open_check or mid_check, say "trades" or "is moving", never "closed".
- Do not say a stock "gapped" unless an explicit gap fact is supplied.
- recent_close_low/recent_close_high are closing-price bounds, not intraday
  highs/lows, support, or resistance.
- Claim a range break only when the matching supplied boolean is true.
- If the tape does not support a useful relationship, set supported=false and
  plainly say no verified catalyst surfaced. That is better than a fake cause.
- Headline under 12 words. Explanation 1-2 complete sentences.
- Confidence is low unless several supplied facts agree.
"""

TAPE_EXPLAINER_SCHEMA = {
    "type": "object",
    "properties": {
        "supported": {"type": "boolean"},
        "dominant_angle": {
            "type": "string",
            "enum": [
                "technical_break",
                "sector_pressure",
                "peer_readthrough",
                "crowded_trade",
                "valuation_reset",
                "sentiment_shift",
                "quiet_move",
            ],
        },
        "headline": {"type": "string"},
        "why_it_matters": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium"]},
    },
    "required": [
        "supported",
        "dominant_angle",
        "headline",
        "why_it_matters",
        "confidence",
    ],
    "additionalProperties": False,
}


def _fresh_items(items: list[dict[str, Any]], *, reference: datetime) -> list[dict[str, Any]]:
    """Keep dated, recent evidence only; undated web pages cannot explain a move."""
    earliest = reference - timedelta(hours=REASON_LOOKBACK_HOURS)
    latest = datetime.now(timezone.utc) + timedelta(minutes=10)
    fresh: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        published = _parse_timestamp(item.get("date") or item.get("published_at") or item.get("timestamp"))
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        if published is None or published < earliest or published > latest or not title:
            continue
        key = url or f"{title}|{published.isoformat()}"
        if key in seen:
            continue
        seen.add(key)
        row = dict(item)
        row["date"] = published.isoformat()
        fresh.append(row)
    fresh.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    return fresh


def _live_page_reference_at(body_text: str, *, reference: datetime) -> str:
    """Date a live ticker page only when it prints the session date itself."""
    text = " ".join(str(body_text or "").split()).lower()
    if not text:
        return ""
    tokens = {
        reference.strftime("%Y-%m-%d").lower(),
        reference.strftime("%b %d").lower(),
        reference.strftime("%B %d").lower(),
        reference.strftime("%b %d, %Y").lower(),
        reference.strftime("%B %d, %Y").lower(),
        f"{reference.strftime('%b')} {reference.day}".lower(),
        f"{reference.strftime('%B')} {reference.day}".lower(),
        f"{reference.strftime('%b')} {reference.day}, {reference.year}".lower(),
        f"{reference.strftime('%B')} {reference.day}, {reference.year}".lower(),
    }
    if not any(token in text for token in tokens):
        return ""
    return reference.isoformat()


def _snapshot_reference(row: dict[str, Any], payload: dict[str, Any]) -> datetime | None:
    return _parse_timestamp(row.get("price_as_of")) or _parse_timestamp(payload.get("generated_at"))


def _timeline_items(doc: dict[str, Any] | None, *, reference: datetime) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for source in ((doc or {}).get("timeline") or []):
        if not isinstance(source, dict):
            continue
        rows.append(
            {
                "date": source.get("timestamp") or source.get("published_at"),
                "source": source.get("source_name") or source.get("source"),
                "title": source.get("title"),
                "summary": source.get("summary") or source.get("article_overview"),
                "url": source.get("article_url") or source.get("url"),
            }
        )
    return _fresh_items(rows, reference=reference)


def _source_items_by_ticker(
    tickers: list[str], *, market: str, reference: datetime
) -> dict[str, list[dict[str, Any]]]:
    """Fetch narrow, source-attributed company-news evidence for the movers only."""
    # Alpha Vantage is the primary broad-market source: one call gives the
    # entire selected mover cohort with entity relevance. The earlier anomaly
    # lane skipped it, which is why obvious names often reached a weak search
    # fallback with no usable evidence.
    def av() -> list[Any]:
        try:
            return fetch_av_news_for_tickers(
                tickers,
                market=market,
                lookback_hours=REASON_LOOKBACK_HOURS,
            )
        except Exception as exc:
            print({"stage": "anomaly_av_error", "error": str(exc)}, flush=True)
            return []

    def finnhub() -> list[Any]:
        try:
            return fetch_finnhub_news_for_tickers(
                tickers,
                market=market,
                lookback_days=3,
                max_per_ticker=8,
                sleep_between=0.2,
            )
        except Exception as exc:
            print({"stage": "anomaly_finnhub_error", "error": str(exc)}, flush=True)
            return []

    fetched: list[Any] = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(av), executor.submit(finnhub)]
        for future in as_completed(futures):
            fetched.extend(future.result())
    # Marketaux is intentionally not part of this latency-sensitive lane. Its
    # production quota is exhausted/paid-only (402), and one serial request
    # per mover turned a source outage into a slow, low-coverage anomaly run.
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for article in fetched:
        ticker = str(getattr(article, "focus_ticker", "") or "").strip().upper()
        if ticker:
            grouped[ticker].append(_article_to_move_item(article))
    return {
        ticker: _fresh_items(rows, reference=reference)
        for ticker, rows in grouped.items()
    }


def _context_items_by_ticker(
    instruments: dict[str, dict[str, Any]],
    *,
    market: str,
    reference: datetime,
    moves: dict[str, dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Search and scrape current evidence for unresolved movers.

    Context.dev deprecated its Search API in July 2026. Firecrawl's search
    endpoint performs current web search plus extraction in one bounded call,
    and returns publisher metadata needed to enforce the 48-hour evidence
    window.
    """
    _ = market
    if not instruments or not firecrawl_enabled():
        return {}

    def fetch_one(ticker: str, instrument: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        name = str(instrument.get("name") or ticker).strip()
        move = (moves or {}).get(ticker) or {}
        change = _finite(move.get("day_change_pct"))
        move_phrase = (
            f"{'up' if change >= 0 else 'down'} {abs(change):.1f}%"
            if change is not None
            else "moving"
        )
        query = (
            f"why {ticker} {name} stock {move_phrase} today "
            f"{reference.strftime('%B %d %Y')} news earnings guidance analyst "
            "contract partnership"
        )
        try:
            results = search_firecrawl(
                query,
                limit=4,
                time_filter="qdr:d",
            )
        except Exception as exc:
            print({"stage": "anomaly_web_source_error", "ticker": ticker, "error": str(exc)}, flush=True)
            return ticker, []
        items: list[dict[str, Any]] = []
        for result in results:
            effective_date = result.published_at or _live_page_reference_at(
                result.body_text,
                reference=reference,
            )
            if not result.title or not effective_date:
                continue
            items.append(
                {
                    "date": effective_date,
                    "source": result.publisher,
                    "title": result.title,
                    "summary": result.body_text[:1800] or result.summary,
                    "url": result.url,
                    "date_basis": (
                        "publisher_metadata"
                        if result.published_at
                        else "live_page_session_date"
                    ),
                }
            )
        return ticker, _fresh_items(items, reference=reference)

    grouped: dict[str, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=min(6, len(instruments))) as executor:
        futures = [
            executor.submit(fetch_one, ticker, instrument)
            for ticker, instrument in instruments.items()
        ]
        for future in as_completed(futures):
            ticker, items = future.result()
            if items:
                grouped[ticker] = items
            else:
                print({"stage": "anomaly_web_source_empty", "ticker": ticker}, flush=True)
    return grouped


def _price_context_explanation(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    """Represent an unresolved mover without turning an incomplete tape into a cause.

    The prior implementation compared an aggregate five-day return with today's
    move and called it a continuation. Those are different measurements: a
    stock can be down over five sessions while sharply up today. We do not
    publish a causal-sounding price-history sentence unless a dated source
    actually explains the current move.
    """
    # `history` is intentionally unused. Its values are still useful input for
    # future research, but not sufficient evidence for a public explanation.
    _ = row, instrument, history
    return {
        "cause_type": "no_verified_catalyst",
        "dominant_angle": "unresolved",
        "headline": "--",
        "why_it_matters": "",
        "confidence": "low",
        "searched_externally": True,
        "external_source": None,
        "evidence": [],
    }


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _session_tape(price_doc: dict[str, Any]) -> dict[str, Any]:
    """Build exact, dated tape facts from provider daily bars.

    Never derive a "session" return from adjacent rolling fetch snapshots.
    Those snapshots can be weeks apart even though they sit next to each
    other in Firestore.
    """
    current_quote = price_doc.get("quote") if isinstance(price_doc.get("quote"), dict) else {}
    by_day: dict[str, dict[str, Any]] = {}
    for point in price_doc.get("recent_sessions") or []:
        if not isinstance(point, dict):
            continue
        day = str(point.get("date") or "")[:10]
        close = _finite(point.get("close"))
        if day and close is not None and close > 0:
            by_day[day] = {
                "date": day,
                "close": round(close, 4),
                "change_pct": _finite(point.get("change_pct")),
                "volume": _finite(point.get("volume")),
            }

    captured_day = str(
        current_quote.get("captured_at") or price_doc.get("captured_at") or ""
    )[:10]
    current = _finite(current_quote.get("current"))
    today_change = _finite(current_quote.get("day_change_pct"))
    today_volume = _finite(current_quote.get("volume"))
    if captured_day and current is not None and current > 0:
        by_day[captured_day] = {
            "date": captured_day,
            "close": round(current, 4),
            "change_pct": round(today_change, 2) if today_change is not None else None,
            "volume": today_volume,
        }

    rows = [by_day[day] for day in sorted(by_day)][-6:]
    prior_rows = [row for row in rows if row.get("date") != captured_day]
    prior_closes = [float(row["close"]) for row in prior_rows]
    phase = str(price_doc.get("session_phase") or "")
    volume_context: dict[str, Any] = {"comparison_available": False}
    if phase == "post_close":
        prior_volumes = [
            float(row["volume"])
            for row in prior_rows
            if _finite(row.get("volume")) is not None and float(row["volume"]) > 0
        ]
        if today_volume is not None and prior_volumes:
            average = sum(prior_volumes) / len(prior_volumes)
            volume_context = {
                "comparison_available": True,
                "vs_recent_average_pct": round(((today_volume - average) / average) * 100.0, 2),
            }

    prior_window_change = None
    if len(prior_closes) >= 2 and prior_closes[0] > 0:
        prior_window_change = round(
            ((prior_closes[-1] - prior_closes[0]) / prior_closes[0]) * 100.0,
            2,
        )
    recent_close_low = round(min(prior_closes), 4) if prior_closes else None
    recent_close_high = round(max(prior_closes), 4) if prior_closes else None
    return {
        "sessions": rows,
        "current_price": round(current, 4) if current is not None else None,
        "previous_close": _finite(current_quote.get("previous_close")),
        "today_change_pct": today_change,
        "prior_window_session_count": len(prior_rows),
        "prior_window_change_pct": prior_window_change,
        "today_opposes_prior_window": bool(
            today_change is not None
            and prior_window_change is not None
            and today_change * prior_window_change < 0
        ),
        "recent_close_low": recent_close_low,
        "recent_close_high": recent_close_high,
        "breaks_below_recent_close_range": bool(
            current is not None
            and recent_close_low is not None
            and current < recent_close_low
        ),
        "breaks_above_recent_close_range": bool(
            current is not None
            and recent_close_high is not None
            and current > recent_close_high
        ),
        "volume_context": volume_context,
        "session_phase": phase,
    }


def _relative_tape_context(
    store: TraceMoneyStore,
    instruments: dict[str, dict[str, Any]],
    *,
    market: str,
) -> dict[str, dict[str, Any]]:
    try:
        market_rows = store.get_market_price_snapshot(market)
    except Exception:
        market_rows = []
    changes: list[float] = []
    by_sector: dict[str, list[float]] = defaultdict(list)
    for row in market_rows:
        price = row.get("price") if isinstance(row.get("price"), dict) else {}
        change = _finite(price.get("changePct"))
        if change is None:
            continue
        changes.append(change)
        sector_id = str(row.get("sectorId") or "").strip().lower()
        if sector_id:
            by_sector[sector_id].append(change)

    market_average = round(sum(changes) / len(changes), 2) if changes else None
    out: dict[str, dict[str, Any]] = {}
    for ticker, instrument in instruments.items():
        sector = str(instrument.get("sector") or "").strip()
        sector_id = "-".join(
            token for token in "".join(
                char.lower() if char.isalnum() else " "
                for char in sector
            ).split()
            if token
        )
        sector_changes = by_sector.get(sector_id) or []
        out[ticker] = {
            "market_average_change_pct": market_average,
            "sector": sector,
            "sector_average_change_pct": (
                round(sum(sector_changes) / len(sector_changes), 2)
                if sector_changes
                else None
            ),
            "sector_sample_size": len(sector_changes),
        }
    return out


def _directive_context(intel_doc: dict[str, Any] | None) -> dict[str, Any]:
    intel = intel_doc or {}
    directive = intel.get("directive_v2")
    if not isinstance(directive, dict):
        directive = {}
    action = directive.get("action") if isinstance(directive.get("action"), dict) else {}
    return {
        "headline": str(intel.get("headline") or "")[:180],
        "thesis": str(intel.get("thesis") or "")[:240],
        "risk": str(intel.get("risk") or "")[:220],
        "setup_state": str(intel.get("setup_state") or "")[:60],
        "directive_v2": {
            "stance": directive.get("stance"),
            "action": {
                "label": action.get("label"),
                "summary": action.get("summary"),
            },
            "watch_out": directive.get("watch_out"),
            "confidence": directive.get("confidence"),
        },
    }


def _llm_tape_explanation(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    price_doc: dict[str, Any],
    intel_doc: dict[str, Any] | None,
    relative_context: dict[str, Any],
) -> dict[str, Any] | None:
    if not llm_api_key():
        return None
    day_change = _finite(row.get("day_change_pct"))
    if day_change is None:
        return None
    relative = dict(relative_context)
    sector_average = _finite(relative.get("sector_average_change_pct"))
    market_average = _finite(relative.get("market_average_change_pct"))
    relative["relative_to_sector_pct"] = (
        round(day_change - sector_average, 2) if sector_average is not None else None
    )
    relative["relative_to_market_pct"] = (
        round(day_change - market_average, 2) if market_average is not None else None
    )
    tape = _session_tape(price_doc)
    payload = {
        "ticker": str(row.get("ticker") or instrument.get("ticker") or "").strip().upper(),
        "company": str(instrument.get("name") or instrument.get("ticker") or "").strip(),
        "day_change_pct": round(day_change, 2),
        "direction": "up" if day_change >= 0 else "down",
        "tape": tape,
        "relative_context": relative,
        "latest_stock_context": _directive_context(intel_doc),
        "verified_news_catalyst": None,
    }
    messages = [
        {
            "role": "system",
            "content": schema_system_prompt(TAPE_EXPLAINER_PROMPT, TAPE_EXPLAINER_SCHEMA),
        },
        {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
    ]
    last_violations: list[str] = []
    for content_attempt in range(2):
        attempt_messages = list(messages)
        if content_attempt:
            attempt_messages.append(
                {
                    "role": "user",
                    "content": (
                        "The previous response violated these factual constraints: "
                        f"{', '.join(last_violations) or 'empty or invalid output'}. "
                        "Return valid schema JSON and describe only a relationship "
                        "supported by the supplied tape."
                    ),
                }
            )
        try:
            body = post_chat_completion(
                messages=attempt_messages,
                model=llm_model(OPENAI_DEFAULT_MODEL),
                temperature=0.0,
                response_format=json_response_format(),
                timeout=35,
                stage="anomaly_tape_explainer",
                max_attempts=3,
            )
            parsed = parse_json_content(body["choices"][0]["message"]["content"])
        except Exception as exc:
            print(
                {
                    "stage": "anomaly_tape_explainer_error",
                    "ticker": payload["ticker"],
                    "content_attempt": content_attempt + 1,
                    "error": str(exc),
                },
                flush=True,
            )
            continue

        headline = " ".join(str(parsed.get("headline") or "").split()).strip()
        why = " ".join(str(parsed.get("why_it_matters") or "").split()).strip()
        forbidden = (
            " extends ",
            " continues ",
            "five-session rally",
            "five-session slide",
            "session high",
            "session low",
            "support",
            "resistance",
            "gapped",
            "dead cat",
        )
        combined = f" {headline.lower()} {why.lower()} "
        violations = [
            value.strip()
            for value in forbidden
            if value in combined
        ]
        if not bool((tape.get("volume_context") or {}).get("comparison_available")) and "volume" in combined:
            violations.append("unavailable volume comparison")
        if tape.get("session_phase") != "post_close" and any(
            token in combined for token in (" closed ", " closes ", " closing ")
        ):
            violations.append("intraday close language")
        if not tape.get("breaks_below_recent_close_range") and "break" in combined and any(
            token in combined for token in (" below ", " lower ", " under ")
        ):
            violations.append("false downside range break")
        if not tape.get("breaks_above_recent_close_range") and "break" in combined and " above " in combined:
            violations.append("false upside range break")
        if not headline or not why or violations:
            last_violations = violations or ["empty output"]
            print(
                {
                    "stage": "anomaly_tape_explainer_rejected",
                    "ticker": payload["ticker"],
                    "content_attempt": content_attempt + 1,
                    "empty": not bool(headline and why),
                    "violations": violations,
                },
                flush=True,
            )
            continue
        supported = bool(parsed.get("supported"))
        if not supported:
            return _price_context_explanation(
                row=row,
                instrument=instrument,
                history=[],
            )
        explanation = {
            "cause_type": "price_action",
            "dominant_angle": str(parsed.get("dominant_angle") or "quiet_move"),
            "headline": headline,
            "why_it_matters": why,
            "confidence": str(parsed.get("confidence") or "low"),
            "searched_externally": True,
            "external_source": "internal_tape_after_source_search",
            "evidence": [],
        }
        return _sanitize_move_explanation(
            explanation,
            instrument=instrument,
            day_change_pct=day_change,
        )
    return None


def _is_final_explanation(row: dict[str, Any]) -> bool:
    """Source-backed reasons stay put; unresolved rows are retried next run."""
    explanation = row.get("move_explanation") if isinstance(row.get("move_explanation"), dict) else {}
    return (
        row.get("narrative_status") == "verified"
        and bool(explanation)
        and str(explanation.get("cause_type") or "").strip().lower()
        not in {"price_context", "no_verified_catalyst"}
    )


def _research_row(
    *,
    row: dict[str, Any],
    instrument: dict[str, Any],
    current_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    day_change = row.get("day_change_pct")
    if not isinstance(day_change, (int, float)):
        return None
    explanation = _llm_move_explanation(
        instrument=instrument,
        day_change_pct=float(day_change),
        articles=current_items,
    )
    if explanation:
        explanation["searched_externally"] = True
        explanation["external_source"] = "mover_research"
        return explanation
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Research reasons for the current daily mover snapshot")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--expected-price-session-phase", default=None)
    parser.add_argument("--require-web-revalidate", action="store_true")
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="Fail the lane when any selected mover lacks a source or AI tape explanation.",
    )
    parser.add_argument(
        "--price-context-only",
        action="store_true",
        help="Skip web acquisition and fill unresolved movers from retained price history only.",
    )
    parser.add_argument(
        "--only-unresolved",
        action="store_true",
        help="Research unresolved and provisional price-context rows; preserve source-backed evidence.",
    )
    parser.add_argument(
        "--only-price-context",
        action="store_true",
        help="Replace legacy price-context rows without touching source-backed explanations.",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    feed_ref = store.db.collection("tm_daily_anomalies").document(f"{args.market}__latest")
    snapshot = feed_ref.get()
    if not snapshot.exists:
        raise RuntimeError("No anomaly snapshot exists to research")
    payload = snapshot.to_dict() or {}
    snapshot_generated_at = str(payload.get("generated_at") or "")
    if not snapshot_generated_at:
        raise RuntimeError("Anomaly snapshot is missing generated_at")
    if args.expected_price_session_phase and payload.get("price_session_phase") != args.expected_price_session_phase:
        raise RuntimeError(
            "Refusing to research a different price session: "
            f"expected {args.expected_price_session_phase}, got {payload.get('price_session_phase') or 'missing'}"
        )
    rows = [deepcopy(row) for row in (payload.get("anomalies") or []) if isinstance(row, dict)]
    if not rows:
        print({"market": args.market, "researched": 0, "reasoned": 0})
        return
    reference = _parse_timestamp(payload.get("generated_at"))
    if reference is None:
        raise RuntimeError("Anomaly snapshot generated_at is invalid")

    research_rows = [
        row
        for row in rows
        if not (args.only_unresolved and _is_final_explanation(row))
        and not (
            args.only_price_context
            and str((row.get("move_explanation") or {}).get("cause_type") or "").strip().lower()
            != "price_context"
        )
    ]
    tickers = [str(row.get("ticker") or "").strip().upper() for row in research_rows]
    instruments = {
        str(item.get("ticker") or "").strip().upper(): item
        for item in store.list_instruments(args.market, [str(row.get("instrument_id") or "") for row in rows])
        if str(item.get("ticker") or "").strip()
    }
    intelligence = store.get_stock_intelligence_docs_batch(
        args.market, args.universe, [str(row.get("instrument_id") or "") for row in rows]
    )
    research_instruments = {
        ticker: instruments[ticker]
        for ticker in tickers
        if ticker in instruments
    }
    price_docs = store.get_latest_prices([str(row.get("instrument_id") or "") for row in rows])
    now_iso = datetime.now(timezone.utc).isoformat()
    rows_by_ticker: dict[str, dict[str, Any]] = {}
    preserved_count = 0
    for row in rows:
        if args.only_price_context and str((row.get("move_explanation") or {}).get("cause_type") or "").strip().lower() != "price_context":
            continue
        already_final = _is_final_explanation(row)
        if args.only_unresolved and already_final:
            preserved_count += 1
            continue
        row["narrative_status"] = "unverified"
        row["narrative_as_of"] = None
        row["move_explanation"] = None
        for key in (
            "headline",
            "thesis",
            "today_brief",
            "catalyst",
            "risk",
            "key_points",
            "visual_summary",
            "overall_verdict",
            "comparative_context",
        ):
            row[key] = [] if key == "key_points" else None
        ticker = str(row.get("ticker") or "").strip().upper()
        instrument = instruments.get(ticker)
        row_reference = _snapshot_reference(row, payload)
        if not ticker or not instrument or row_reference is None:
            continue
        rows_by_ticker[ticker] = row

    explanations: dict[str, dict[str, Any]] = {}
    source_reasoned: set[str] = set()
    web_reasoned: set[str] = set()
    tape_reasoned: set[str] = set()
    no_verified_reason: set[str] = set()

    if args.price_context_only:
        for ticker, row in rows_by_ticker.items():
            instrument = instruments[ticker]
            price_doc = price_docs.get(str(row.get("instrument_id") or "")) or {}
            explanations[ticker] = _price_context_explanation(
                row=row,
                instrument=instrument,
                history=list(price_doc.get("history_window") or []),
            )
    else:
        source_items = _source_items_by_ticker(
            list(rows_by_ticker),
            market=args.market,
            reference=reference,
        )
        evidence_by_ticker: dict[str, list[dict[str, Any]]] = {}
        for ticker, row in rows_by_ticker.items():
            row_reference = _snapshot_reference(row, payload) or reference
            instrument_id = str(row.get("instrument_id") or "")
            evidence_by_ticker[ticker] = _fresh_items(
                _timeline_items(intelligence.get(instrument_id), reference=row_reference)
                + source_items.get(ticker, []),
                reference=row_reference,
            )

        def explain_from_evidence(ticker: str) -> tuple[str, dict[str, Any] | None]:
            items = evidence_by_ticker.get(ticker) or []
            if not items:
                return ticker, None
            row = rows_by_ticker[ticker]
            explanation = _research_row(
                row=row,
                instrument=instruments[ticker],
                current_items=items,
            )
            if explanation:
                explanation = _sanitize_move_explanation(
                    explanation,
                    instrument=instruments[ticker],
                    day_change_pct=float(row.get("day_change_pct") or 0),
                )
            return ticker, explanation

        with ThreadPoolExecutor(max_workers=min(REASON_LLM_WORKERS, max(1, len(rows_by_ticker)))) as executor:
            futures = [
                executor.submit(explain_from_evidence, ticker)
                for ticker in rows_by_ticker
                if evidence_by_ticker.get(ticker)
            ]
            for future in as_completed(futures):
                ticker, explanation = future.result()
                if explanation:
                    explanations[ticker] = explanation
                    source_reasoned.add(ticker)

        unresolved = [ticker for ticker in rows_by_ticker if ticker not in explanations]
        web_items = _context_items_by_ticker(
            {
                ticker: research_instruments[ticker]
                for ticker in unresolved
                if ticker in research_instruments
            },
            market=args.market,
            reference=reference,
            moves={
                ticker: rows_by_ticker[ticker]
                for ticker in unresolved
                if ticker in rows_by_ticker
            },
        )
        for ticker, items in web_items.items():
            row = rows_by_ticker[ticker]
            row_reference = _snapshot_reference(row, payload) or reference
            evidence_by_ticker[ticker] = _fresh_items(
                (evidence_by_ticker.get(ticker) or []) + items,
                reference=row_reference,
            )

        with ThreadPoolExecutor(max_workers=min(REASON_LLM_WORKERS, max(1, len(unresolved)))) as executor:
            futures = [
                executor.submit(explain_from_evidence, ticker)
                for ticker in unresolved
                if evidence_by_ticker.get(ticker)
            ]
            for future in as_completed(futures):
                ticker, explanation = future.result()
                if explanation:
                    explanations[ticker] = explanation
                    web_reasoned.add(ticker)

        unresolved = [ticker for ticker in rows_by_ticker if ticker not in explanations]
        relative = _relative_tape_context(
            store,
            research_instruments,
            market=args.market,
        )

        def explain_from_tape(ticker: str) -> tuple[str, dict[str, Any] | None]:
            row = rows_by_ticker[ticker]
            instrument_id = str(row.get("instrument_id") or "")
            return ticker, _llm_tape_explanation(
                row=row,
                instrument=instruments[ticker],
                price_doc=price_docs.get(instrument_id) or {},
                intel_doc=intelligence.get(instrument_id),
                relative_context=relative.get(ticker) or {},
            )

        with ThreadPoolExecutor(max_workers=min(REASON_LLM_WORKERS, max(1, len(unresolved)))) as executor:
            futures = [executor.submit(explain_from_tape, ticker) for ticker in unresolved]
            for future in as_completed(futures):
                ticker, explanation = future.result()
                if explanation:
                    explanations[ticker] = explanation
                    if str(explanation.get("cause_type") or "") == "no_verified_catalyst":
                        no_verified_reason.add(ticker)
                    else:
                        tape_reasoned.add(ticker)
                else:
                    row = rows_by_ticker[ticker]
                    instrument_id = str(row.get("instrument_id") or "")
                    explanations[ticker] = _price_context_explanation(
                        row=row,
                        instrument=instruments[ticker],
                        history=list((price_docs.get(instrument_id) or {}).get("history_window") or []),
                    )
                    no_verified_reason.add(ticker)

    for ticker, row in rows_by_ticker.items():
        explanation = explanations.get(ticker)
        if not explanation:
            continue
        # The move this reason was written for. A midday rebuild that carries
        # the reason forward compares the later move against it.
        if isinstance(row.get("day_change_pct"), (int, float)):
            explanation["researched_day_change_pct"] = float(row["day_change_pct"])
        row["move_explanation"] = explanation
        row["narrative_status"] = "verified"
        row["narrative_as_of"] = now_iso

    reasoned = preserved_count + len(explanations)
    unresolved_count = max(0, len(rows) - reasoned)

    # A later price materialization wins. Never let a slow source lookup write
    # researched prose into a newer session's mover list.
    latest = feed_ref.get()
    latest_payload = latest.to_dict() if latest.exists else None
    if not isinstance(latest_payload, dict) or str(latest_payload.get("generated_at") or "") != snapshot_generated_at:
        raise RuntimeError("Anomaly snapshot changed while researching reasons; refusing stale write")
    updated = dict(payload)
    updated["anomalies"] = rows
    updated["reasoned_at"] = now_iso
    updated["reasoned_count"] = reasoned
    feed_ref.set(updated)
    _write_ticker_read_models(store, args.market, updated)
    # The dated archive behind the "why it moved" pages. Never fail the job over it.
    try:
        archived_new = archive_explained_day(store, args.market, updated)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] explained-move archive failed: {exc}")
        archived_new = []
    store.save_stage_watermark(
        market=args.market,
        stage_key="research_daily_anomaly_reasons",
        universe_id=args.universe,
        expected_count=len(rows),
        success_count=reasoned,
        error_count=max(0, len(rows) - reasoned),
        metadata={
            "snapshot_generated_at": snapshot_generated_at,
            "expected_price_session_phase": args.expected_price_session_phase,
            "source_reasoned_count": len(source_reasoned),
            "web_reasoned_count": len(web_reasoned),
            "tape_reasoned_count": len(tape_reasoned),
            "no_verified_reason_count": len(no_verified_reason),
            "unresolved_count": unresolved_count,
        },
    )
    revalidated = trigger_web_revalidate(ANOMALY_REVALIDATE_PATHS, force=True)
    if archived_new and args.market.upper() == "US":
        # New "why it moved" pages: refresh them and tell IndexNow. Best effort.
        day = str(updated.get("date") or "")[:10]
        try:
            trigger_web_revalidate(
                [f"/movers/{day}", "/movers", *[f"/stock/{ticker}/moves/{day}" for ticker in archived_new]],
                force=True,
                notify_indexnow=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] move page refresh failed: {exc}")
    if args.market.upper() == "US" and args.expected_price_session_phase == "post_close":
        # The last step of the evening chain (prices, then calls and briefs, then this):
        # tell IndexNow about every stock page rebuilt today. Market Daily, which also
        # does this, is paused. Best effort; never fails the job.
        session_day = str(updated.get("date") or updated.get("generated_at") or "")[:10]
        if session_day:
            notify_indexnow_families(["stocks"], changed_since=session_day)
    if args.require_web_revalidate and not revalidated:
        raise RuntimeError("anomaly reasons were saved, but the web refresh failed")
    result = {
        "market": args.market,
        "researched": len(rows),
        "reasoned": reasoned,
        "source_reasoned": len(source_reasoned),
        "web_reasoned": len(web_reasoned),
        "tape_reasoned": len(tape_reasoned),
        "no_verified_reason": len(no_verified_reason),
        "unresolved": unresolved_count,
    }
    print(result)
    if args.require_complete and unresolved_count:
        raise RuntimeError(
            f"Anomaly reasoning incomplete: {unresolved_count}/{len(rows)} movers unresolved"
        )


if __name__ == "__main__":
    main()
