"""Per-stock AI pipeline - fetches per-ticker news, enriches, and builds a
brief for each instrument in the universe.

This is the stock-first successor to `build_news_intelligence.py`. The old
pipeline pooled all articles into a single 20-article budget, so popular
tickers drowned out quiet ones and most of the watchlist got zero AI
coverage on any given run. This script partitions the fetch by ticker so
every instrument in the AI-tier universe gets a fair slice of news articles
(plus a small broad bucket kept alive for market/sector briefs). Stocks with
no qualifying news stay uncovered by default so the frontend can hide AI UI
instead of showing filler.
"""
from __future__ import annotations

import argparse
from dataclasses import replace
import hashlib
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from backend.instrument_universe import get_coverage_universe_id, list_instruments
from backend.landing_metrics import build_stock_technical_doc
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.news_av import fetch_av_news_for_tickers
from backend.news_finnhub import fetch_finnhub_news_for_tickers
from backend.news_marketaux import fetch_marketaux_news_for_tickers
from backend.news_pipeline import collect_per_ticker_articles
from backend.pipeline_logging import configure_pipeline_logging
from backend.scripts.build_context_intelligence import main as build_context_intelligence_main
from backend.scripts.materialize_views import materialize_views
from backend.models import Article
from backend.stock_intelligence import build_no_news_intelligence_doc, build_stock_intelligence_docs
from backend.storage import TraceMoneyStore

from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _subscribed_tracked_ids(store: TraceMoneyStore, market: str) -> list[str]:
    """Collect paid-user tracked instrument ids for a market (deduped, stable order)."""
    seen: set[str] = set()
    out: list[str] = []
    prefix = f"{market.upper()}_"
    for user in store.list_subscribed_users():
        if not bool(user.get("is_subscribed")):
            continue
        tracked = user.get("tracked_stocks") or []
        if not isinstance(tracked, list):
            continue
        for raw_id in tracked:
            instrument_id = str(raw_id or "").strip().upper()
            if not instrument_id or not instrument_id.startswith(prefix):
                continue
            if instrument_id in seen:
                continue
            seen.add(instrument_id)
            out.append(instrument_id)
    return out


def _merge_with_paid_tracked(
    store: TraceMoneyStore,
    market: str,
    base_instruments: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    """Union(base universe, paid tracked) while preserving deterministic order."""
    tracked_ids = _subscribed_tracked_ids(store, market)
    base_ids = {
        str(instrument.get("instrument_id") or "").strip().upper()
        for instrument in base_instruments
    }
    extra_ids = [instrument_id for instrument_id in tracked_ids if instrument_id and instrument_id not in base_ids]
    if not extra_ids:
        return base_instruments, len(tracked_ids), 0

    extra_rows = store.list_instruments(market, extra_ids)
    extra_by_id = {
        str(row.get("instrument_id") or "").strip().upper(): row
        for row in extra_rows
        if isinstance(row, dict)
    }
    ordered_extra: list[dict[str, Any]] = []
    missing: list[str] = []
    for instrument_id in extra_ids:
        row = extra_by_id.get(instrument_id)
        if row:
            ordered_extra.append(row)
        else:
            missing.append(instrument_id)
    if missing:
        logger.warning(
            "per_stock_intelligence missing instrument metadata for paid tracked ids market=%s missing=%s",
            market,
            ",".join(missing),
        )
    return base_instruments + ordered_extra, len(tracked_ids), len(ordered_extra)


def _avg_volume_from_history(history_points: list[dict]) -> float | None:
    volumes: list[float] = []
    for row in history_points:
        quote = row.get("quote") or {}
        raw = quote.get("volume")
        if raw in (None, "", "null"):
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            volumes.append(value)
    if not volumes:
        return None
    return sum(volumes) / len(volumes)


def _intel_quality_score(doc: dict[str, Any] | None) -> float:
    if not isinstance(doc, dict):
        return 0.0
    overall = doc.get("overall") or {}
    try:
        overall_score = float(overall.get("score") or 0) if isinstance(overall, dict) else 0.0
    except (TypeError, ValueError):
        overall_score = 0.0
    pillars = doc.get("pillars") or {}
    if not isinstance(pillars, dict):
        return overall_score
    scored_pillars = 0
    scored_metrics = 0
    for pillar in pillars.values():
        if not isinstance(pillar, dict):
            continue
        try:
            if float(pillar.get("score") or 0) > 0:
                scored_pillars += 1
        except (TypeError, ValueError):
            pass
        metrics = pillar.get("metrics") or []
        if isinstance(metrics, list):
            scored_metrics += sum(
                1
                for metric in metrics
                if isinstance(metric, dict) and isinstance(metric.get("score"), (int, float))
            )
    return scored_pillars * 1000 + scored_metrics * 10 + overall_score


def _prefer_better_intel_doc(current: dict[str, Any] | None, candidate: dict[str, Any] | None) -> dict[str, Any] | None:
    if _intel_quality_score(candidate) > _intel_quality_score(current):
        return candidate
    return current


def _chunked(values: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    if size <= 0:
        return [values]
    return [values[index:index + size] for index in range(0, len(values), size)]


def _dedupe_articles(raw_articles: list[Any]) -> list[Any]:
    by_key: dict[str, Any] = {}
    ordered: list[Any] = []
    for article in raw_articles:
        article_id = str(getattr(article, "id", "") or "").strip()
        article_url = str(getattr(article, "url", "") or "").strip()
        key = article_id or article_url
        if not key or key in by_key:
            continue
        by_key[key] = article
        ordered.append(article)
    return ordered


def _parse_instrument_ids(value: str | None) -> list[str] | None:
    if not value:
        return None
    ids = [item.strip().upper() for item in value.split(",") if item.strip()]
    return ids or None


def _coerce_article(payload: dict[str, Any]) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def _article_timestamp(payload: dict[str, Any]) -> datetime | None:
    for key in ("published_at", "enriched_at", "updated_at"):
        raw = str(payload.get(key) or "").strip()
        if not raw:
            continue
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def _sentiment_label_from_score(score: float) -> str:
    if score >= 0.2:
        return "bullish"
    if score <= -0.2:
        return "bearish"
    return "neutral"



def _article_targets(
    article: Article,
    instruments_by_ticker: dict[str, dict[str, Any]],
    ticker_patterns: dict[str, re.Pattern[str]],
) -> set[str]:
    targets: set[str] = set()
    focus_ticker = str(getattr(article, "focus_ticker", "") or "").strip().upper()
    if focus_ticker in instruments_by_ticker:
        targets.add(focus_ticker)
    for ticker in getattr(article, "stock_tickers", []) or []:
        normalized = str(ticker or "").strip().upper()
        if normalized in instruments_by_ticker:
            targets.add(normalized)
    if targets:
        return targets
    text = f"{article.title} {article.summary} {article.body_text}"
    for ticker, pattern in ticker_patterns.items():
        if pattern.search(text):
            targets.add(ticker)
    return targets


def _map_articles_to_instruments(
    raw_articles: list[Article],
    instruments: list[dict[str, Any]],
) -> dict[str, list[Article]]:
    instruments_by_ticker = {
        str(instrument.get("ticker") or "").strip().upper(): instrument
        for instrument in instruments
        if str(instrument.get("ticker") or "").strip()
    }
    ticker_patterns = {
        ticker: re.compile(rf"\b{re.escape(ticker)}\b", re.IGNORECASE)
        for ticker in instruments_by_ticker
    }
    by_instrument: dict[str, list[Article]] = {}
    seen_pairs: set[tuple[str, str]] = set()
    for article in raw_articles:
        article_key = (
            str(getattr(article, "id", "") or "").strip()
            or str(getattr(article, "url", "") or "").strip()
        )
        if not article_key:
            continue
        for ticker in _article_targets(article, instruments_by_ticker, ticker_patterns):
            instrument = instruments_by_ticker.get(ticker)
            instrument_id = str(instrument.get("instrument_id") or "").strip().upper() if instrument else ""
            if not instrument_id:
                continue
            pair = (article_key, instrument_id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            by_instrument.setdefault(instrument_id, []).append(article)
    return by_instrument


def _filter_articles_for_instruments(
    raw_articles: list[Article],
    instruments: list[dict[str, Any]],
) -> list[Article]:
    by_instrument = _map_articles_to_instruments(raw_articles, instruments)
    allowed_article_ids = {
        _article_identity(article)
        for articles in by_instrument.values()
        for article in articles
        if _article_identity(article)
    }
    return [
        article
        for article in raw_articles
        if _article_identity(article) in allowed_article_ids
    ]


def _article_identity(article: Article) -> str:
    return (
        str(getattr(article, "id", "") or "").strip()
        or str(getattr(article, "url", "") or "").strip()
    )


def _article_fingerprint(articles: list[Article]) -> str:
    payload = [
        {
            "id": _article_identity(article),
            "published_at": str(getattr(article, "published_at", "") or ""),
            "title": str(getattr(article, "title", "") or ""),
            "sentiment_label": str(getattr(article, "sentiment_label", "") or ""),
            "sentiment_score": float(getattr(article, "sentiment_score", 0.0) or 0.0),
        }
        for article in sorted(
            articles,
            key=lambda item: (
                str(getattr(item, "published_at", "") or ""),
                _article_identity(item),
            ),
            reverse=True,
        )
    ]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _needs_incremental_brief_refresh(
    *,
    article_fingerprint: str,
    previous_fingerprint: str,
    existing_stock_intelligence_doc: dict[str, Any] | None,
) -> tuple[bool, bool]:
    missing_brief = not bool(existing_stock_intelligence_doc)
    return article_fingerprint != previous_fingerprint or missing_brief, missing_brief


def _latest_article_at(articles: list[Article]) -> str:
    timestamps = [
        str(getattr(article, "published_at", "") or "").strip()
        for article in articles
        if str(getattr(article, "published_at", "") or "").strip()
    ]
    return max(timestamps) if timestamps else ""


def _fetch_chunk(
    market: str,
    universe_id: str,
    *,
    chunk_index: int,
    instruments: list[dict[str, Any]],
    per_stock_cap: int,
    per_stock_lookback_hours: int,
) -> tuple[int, list[Any], list[dict[str, object]], float]:
    started = time.time()
    articles, source_health = collect_per_ticker_articles(
        market=market,
        universe_id=universe_id,
        per_stock_cap=per_stock_cap,
        broad_cap=0,
        instruments_override=instruments,
        per_stock_lookback_hours=per_stock_lookback_hours,
    )
    return chunk_index, articles, source_health, time.time() - started


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _material_price_signal(latest_price: dict[str, Any], *, phase: str) -> dict[str, Any] | None:
    """Return a stable, factual signal when tape data merits a new AI brief.

    A normal daily tick only refreshes the quote. We ask the brief model again
    when the current move is material on its own or materially changes the
    five-session setup. The resulting payload is facts only; the model must
    not turn a five-day aggregate into a false company-news explanation.
    """
    quote = latest_price.get("quote") if isinstance(latest_price.get("quote"), dict) else {}
    current = _finite(quote.get("current"))
    day_change = _finite(quote.get("day_change_pct"))
    captured_at = str(quote.get("captured_at") or latest_price.get("captured_at") or "")
    if current is None or current <= 0 or day_change is None or not captured_at:
        return None

    current_day = captured_at[:10]
    # Use provider daily bars, not our rolling fetch history. The latter can
    # skip days when a stock was outside an older cohort and must never be
    # interpreted as consecutive market sessions.
    by_day: dict[str, float] = {}
    for point in latest_price.get("recent_sessions") or []:
        if not isinstance(point, dict):
            continue
        price = _finite(point.get("close"))
        day = str(point.get("date") or "")[:10]
        if day and price is not None and price > 0:
            by_day[day] = price
    by_day[current_day] = current
    ordered = [(day, by_day[day]) for day in sorted(by_day)]
    prior = [price for day, price in ordered if day != current_day][-5:]
    if len(prior) < 2:
        return None

    prior_change = ((prior[-1] - prior[0]) / prior[0]) * 100 if prior[0] else 0.0
    five_session_change = ((current - prior[0]) / prior[0]) * 100 if prior[0] else 0.0
    reversal = abs(day_change) >= 3 and abs(prior_change) >= 8 and day_change * prior_change < 0
    continuation = abs(day_change) >= 3 and abs(five_session_change) >= 10 and day_change * five_session_change > 0
    breakout = current >= max(prior) * 1.03 or current <= min(prior) * 0.97
    material = abs(day_change) >= 5 or reversal or continuation or (abs(day_change) >= 3 and breakout)
    if not material:
        return None

    signal = {
        "captured_day": current_day,
        "phase": phase,
        "day_change_pct": round(day_change, 2),
        "prior_five_session_change_pct": round(prior_change, 2),
        "five_session_change_pct": round(five_session_change, 2),
        "reversal": reversal,
        "continuation": continuation,
        "breakout": breakout,
    }
    # `phase` is provenance, not content. Open and close must not become two
    # different AI inputs merely because the same tape was observed twice.
    fingerprint_payload = {key: value for key, value in signal.items() if key != "phase"}
    signal["fingerprint"] = hashlib.sha256(
        json.dumps(fingerprint_payload, sort_keys=True).encode()
    ).hexdigest()
    return signal


def _price_signal_changed_materially(
    signal: dict[str, Any],
    previous_freshness: dict[str, Any],
) -> bool:
    """Decide whether a tape-only brief deserves another model call.

    Exact quote percentages naturally drift between the open and close. That
    is not enough to rewrite prose. Refresh only when the tape meaning changes
    or the move grows/shrinks enough to alter an investor's read.
    """
    previous_signal = previous_freshness.get("price_brief_signal")
    if not isinstance(previous_signal, dict) or not previous_signal:
        return signal.get("fingerprint") != previous_freshness.get(
            "price_brief_input_fingerprint"
        )

    if signal.get("captured_day") != previous_signal.get("captured_day"):
        return True

    for key in ("reversal", "continuation", "breakout"):
        if bool(signal.get(key)) != bool(previous_signal.get(key)):
            return True

    current_day_move = _finite(signal.get("day_change_pct"))
    previous_day_move = _finite(previous_signal.get("day_change_pct"))
    if current_day_move is None or previous_day_move is None:
        return True
    if current_day_move * previous_day_move < 0:
        return True
    if abs(current_day_move - previous_day_move) >= 2.0:
        return True

    current_five = _finite(signal.get("five_session_change_pct"))
    previous_five = _finite(previous_signal.get("five_session_change_pct"))
    if current_five is None or previous_five is None:
        return True
    if current_five * previous_five < 0:
        return True
    if abs(current_five - previous_five) >= 3.0:
        return True

    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Build per-stock AI intelligence for an AI-tier universe")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", default=None, help="AI-tier universe id, e.g. us_ai_launch")
    parser.add_argument("--per-stock-cap", type=int, default=5, help="Max articles fetched per ticker (default 5)")
    parser.add_argument("--per-stock-lookback-hours", type=int, default=72, help="Lookback window for per-stock fetch (default 72h)")
    parser.add_argument("--broad-cap", type=int, default=12, help="Max broad-lane articles kept for market/sector briefs (default 12)")
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=10,
        help="Stocks per fetch chunk (default 10). Set 0 to disable chunking.",
    )
    parser.add_argument(
        "--chunk-workers",
        type=int,
        default=4,
        help="Parallel chunk workers for article fetch (default 4).",
    )
    parser.add_argument("--include-no-news", action="store_true", help="Generate fallback briefs for stocks with no qualifying news")
    parser.add_argument("--skip-context", action="store_true", help="Skip market/sector context brief build")
    parser.add_argument("--skip-materialize", action="store_true", help="Skip dashboard/instrument view materialization")
    parser.add_argument("--instrument-ids", default=None, help="Comma-separated instrument ids to refresh")
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="Use per-instrument freshness state and rebuild only changed tickers",
    )
    parser.add_argument(
        "--emit-changed-instrument-ids-path",
        default="",
        help="Optional file path to write changed instrument ids as JSON",
    )
    parser.add_argument("--paid-only", action="store_true", help="Refresh only subscribed users' tracked stocks")
    parser.add_argument("--upsert", action="store_true", help="Upsert articles/enrichments/briefs instead of replacing subcollections")
    parser.add_argument("--enrich-only", action="store_true", help="Fetch + enrich news only, skip brief synthesis")
    parser.add_argument("--synthesis-only", action="store_true", help="Build briefs from existing enrichments only")
    parser.add_argument("--discovery-only", action="store_true", help="Fetch raw articles, detect changed tickers, and stop before enrichment")
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="Fail before publishing freshness state unless every selected instrument produced a brief.",
    )
    parser.add_argument("--skip-av", action="store_true", help="Skip Alpha Vantage news augmentation (fall back to RSS only)")
    parser.add_argument("--skip-finnhub", action="store_true", help="Skip Finnhub news augmentation")
    parser.add_argument("--skip-marketaux", action="store_true", help="Skip Marketaux news augmentation")
    parser.add_argument(
        "--synthesis-lookback-hours",
        type=int,
        default=24,
        help="When --synthesis-only, include only enrichments newer than this many hours (default 24). Set 0 to disable.",
    )
    parser.add_argument(
        "--price-trigger-phase",
        default="scheduled",
        help="Session label used to dedupe material price-triggered briefs.",
    )
    args = parser.parse_args()
    if args.enrich_only and args.synthesis_only:
        raise ValueError("--enrich-only and --synthesis-only cannot be combined")
    if args.discovery_only and (args.enrich_only or args.synthesis_only):
        raise ValueError("--discovery-only cannot be combined with --enrich-only or --synthesis-only")
    configure_pipeline_logging()
    store = TraceMoneyStore()
    universe_id = str(args.universe or store.get_active_ai_universe(args.market) or "").strip()
    if not universe_id:
        raise ValueError(
            f"No active AI universe configured for {args.market}. "
            "Set tm_config/active_universes.US_universe (US) or pass --universe."
        )
    logger.info(
        "per_stock_intelligence start market=%s universe=%s per_stock_cap=%s broad_cap=%s skip_context=%s skip_materialize=%s include_no_news=%s",
        args.market,
        universe_id,
        args.per_stock_cap,
        args.broad_cap,
        args.skip_context,
        args.skip_materialize,
        args.include_no_news,
    )
    requested_ids = _parse_instrument_ids(args.instrument_ids)
    base_instruments = [] if args.paid_only else list_instruments(args.market, universe_id)
    instruments, paid_tracked_count, paid_extra_count = _merge_with_paid_tracked(store, args.market, base_instruments)
    if args.paid_only:
        paid_ids = _subscribed_tracked_ids(store, args.market)
        instruments = store.list_instruments(args.market, paid_ids) if paid_ids else []
        paid_extra_count = len(instruments)
    if requested_ids is not None:
        allowed = set(requested_ids)
        instruments = [
            instrument for instrument in instruments
            if str(instrument.get("instrument_id") or "").strip().upper() in allowed
        ]
        # Earnings reporters (and other explicit refreshes) may sit OUTSIDE the
        # active AI universe and the paid-tracked set - e.g. a stock nobody is
        # watching that just reported. The union above won't contain them, so
        # load their instrument metadata directly and add them in. Without this
        # a requested id outside the universe silently produces no brief.
        present = {
            str(instrument.get("instrument_id") or "").strip().upper()
            for instrument in instruments
        }
        missing_ids = [rid for rid in requested_ids if rid not in present]
        if missing_ids:
            extra_rows = store.list_instruments(args.market, missing_ids)
            extra_by_id = {
                str(row.get("instrument_id") or "").strip().upper(): row
                for row in extra_rows
                if isinstance(row, dict)
            }
            for rid in missing_ids:
                row = extra_by_id.get(rid)
                if row:
                    instruments.append(row)
                else:
                    logger.warning(
                        "per_stock_intelligence requested id has no instrument metadata market=%s id=%s",
                        args.market,
                        rid,
                    )
    if not instruments:
        print(f"[per-stock] no instruments selected for {args.market} / {universe_id}; exiting")
        return
    selected_instrument_ids = [
        str(instrument.get("instrument_id") or "").strip().upper()
        for instrument in instruments
        if str(instrument.get("instrument_id") or "").strip()
    ]
    prior_freshness = (
        store.get_news_freshness_docs(args.market, selected_instrument_ids)
        if args.incremental
        else {}
    )
    existing_stock_intelligence = (
        store.get_stock_intelligence_docs_batch(args.market, universe_id, selected_instrument_ids)
        if args.incremental
        else {}
    )
    changed_instrument_ids: list[str] = []
    changed_instrument_set: set[str] = set()
    price_signals: dict[str, dict[str, Any]] = {}
    freshness_payloads: dict[str, dict[str, Any]] = {}
    logger.info(
        "per_stock_intelligence instrument_union market=%s universe=%s base_count=%s paid_tracked_count=%s paid_extra_count=%s total_count=%s",
        args.market,
        universe_id,
        len(base_instruments),
        paid_tracked_count,
        paid_extra_count,
        len(instruments),
    )

    enriched_articles: list[Article]
    if args.synthesis_only:
        if args.incremental:
            changed_instrument_set = {
                instrument_id
                for instrument_id, payload in prior_freshness.items()
                if bool(payload.get("needs_brief_refresh"))
            }
            latest_prices = store.get_latest_prices(selected_instrument_ids)
            for instrument_id, latest_price in latest_prices.items():
                signal = _material_price_signal(latest_price, phase=str(args.price_trigger_phase))
                if not signal:
                    continue
                previous = prior_freshness.get(instrument_id) or {}
                if not _price_signal_changed_materially(signal, previous):
                    continue
                price_signals[instrument_id] = signal
                changed_instrument_set.add(instrument_id)
            changed_instrument_ids = sorted(changed_instrument_set)
            changed_instrument_set = set(changed_instrument_ids)
            if changed_instrument_ids:
                instruments = [
                    instrument
                    for instrument in instruments
                    if str(instrument.get("instrument_id") or "").strip().upper() in changed_instrument_set
                ]
                print(
                    f"[per-stock] synthesis-only incremental narrowed to {len(instruments)} changed instruments"
                )
            else:
                if args.emit_changed_instrument_ids_path:
                    with open(args.emit_changed_instrument_ids_path, "w", encoding="utf-8") as handle:
                        json.dump([], handle)
                print("[per-stock] synthesis-only incremental found no changed instruments; exiting")
                return
        selected_tickers = [
            str(instrument.get("ticker") or "").strip().upper()
            for instrument in instruments
            if str(instrument.get("ticker") or "").strip()
        ]
        if hasattr(store, "list_article_enrichments_for_tickers"):
            enriched_payloads = store.list_article_enrichments_for_tickers(
                args.market,
                universe_id,
                selected_tickers,
            )
        else:
            max_docs = max(800, len(instruments) * max(1, args.per_stock_cap) * 8)
            enriched_payloads = store.list_article_enrichments(
                args.market,
                universe_id,
                limit=max_docs,
            )
        selected_ids = {
            str(instrument.get("instrument_id") or "").strip().upper()
            for instrument in instruments
        }
        lookback_hours = max(0, int(args.synthesis_lookback_hours))
        cutoff = None
        if lookback_hours > 0:
            cutoff = datetime.now(timezone.utc).timestamp() - (lookback_hours * 3600)
        filtered_payloads: list[dict[str, Any]] = []
        for payload in enriched_payloads:
            instrument_id = str(payload.get("instrument_id") or "").strip().upper()
            if instrument_id and instrument_id not in selected_ids:
                continue
            if cutoff is not None:
                ts = _article_timestamp(payload)
                if ts is None or ts.timestamp() < cutoff:
                    continue
            filtered_payloads.append(payload)
        enriched_payloads = filtered_payloads
        enriched_articles = [_coerce_article(payload) for payload in enriched_payloads]
        print(f"[per-stock] synthesis-only loaded {len(enriched_articles)} enriched articles from {universe_id}")
    else:
        print(
            f"[per-stock] fetching per-ticker articles for {len(instruments)} instruments "
            f"(cap {args.per_stock_cap}/ticker, broad cap {args.broad_cap})"
        )
        chunk_size = max(0, int(args.chunk_size))
        chunk_workers = max(1, int(args.chunk_workers))
        if chunk_size > 0 and len(instruments) > chunk_size:
            chunks = _chunked(instruments, chunk_size)
            logger.info(
                "per_stock_intelligence chunk_fetch enabled chunks=%s chunk_size=%s workers=%s",
                len(chunks),
                chunk_size,
                chunk_workers,
            )
            broad_articles: list[Any] = []
            broad_health: list[dict[str, object]] = []
            if args.broad_cap > 0:
                broad_started = time.time()
                broad_articles, broad_health = collect_per_ticker_articles(
                    market=args.market,
                    universe_id=universe_id,
                    per_stock_cap=0,
                    broad_cap=args.broad_cap,
                    instruments_override=[],
                )
                logger.info(
                    "per_stock_intelligence broad_bucket fetched articles=%s elapsed_s=%.2f",
                    len(broad_articles),
                    time.time() - broad_started,
                )

            chunk_results: list[tuple[int, list[Any], list[dict[str, object]], float]] = []
            with ThreadPoolExecutor(max_workers=min(chunk_workers, len(chunks))) as executor:
                futures = [
                    executor.submit(
                        _fetch_chunk,
                        args.market,
                        universe_id,
                        chunk_index=index,
                        instruments=chunk,
                        per_stock_cap=args.per_stock_cap,
                        per_stock_lookback_hours=args.per_stock_lookback_hours,
                    )
                    for index, chunk in enumerate(chunks)
                ]
                for future in as_completed(futures):
                    chunk_results.append(future.result())
            chunk_results.sort(key=lambda item: item[0])
            for chunk_index, chunk_articles, _chunk_health, elapsed_s in chunk_results:
                logger.info(
                    "per_stock_intelligence chunk fetched idx=%s articles=%s elapsed_s=%.2f",
                    chunk_index,
                    len(chunk_articles),
                    elapsed_s,
                )

            raw_articles = _dedupe_articles(
                broad_articles + [article for _idx, articles, _health, _elapsed in chunk_results for article in articles]
            )
            source_health = broad_health + [
                row
                for _idx, _articles, health_rows, _elapsed in chunk_results
                for row in health_rows
            ]
        else:
            raw_articles, source_health = collect_per_ticker_articles(
                market=args.market,
                universe_id=universe_id,
                per_stock_cap=args.per_stock_cap,
                broad_cap=args.broad_cap,
                instruments_override=instruments,
                per_stock_lookback_hours=args.per_stock_lookback_hours,
            )
        print(
            f"[per-stock] fetched {len(raw_articles)} articles across "
            f"{sum(1 for s in source_health if s['ok'])} healthy sources"
        )

        if args.incremental:
            articles_by_instrument = _map_articles_to_instruments(raw_articles, instruments)
            now_iso = datetime.now(timezone.utc).isoformat()
            for instrument in instruments:
                instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
                if not instrument_id:
                    continue
                instrument_articles = articles_by_instrument.get(instrument_id, [])
                article_fingerprint = _article_fingerprint(instrument_articles)
                previous = prior_freshness.get(instrument_id) or {}
                previous_fingerprint = str(previous.get("article_fingerprint") or "")
                changed, missing_brief = _needs_incremental_brief_refresh(
                    article_fingerprint=article_fingerprint,
                    previous_fingerprint=previous_fingerprint,
                    existing_stock_intelligence_doc=existing_stock_intelligence.get(instrument_id),
                )
                if changed:
                    changed_instrument_set.add(instrument_id)
                freshness_payloads[instrument_id] = {
                    "market": args.market.upper(),
                    "universe_id": universe_id,
                    "instrument_id": instrument_id,
                    "ticker": str(instrument.get("ticker") or "").strip().upper(),
                    "priority_tier": "tracked",
                    "last_discovery_at": now_iso,
                    "pending_latest_article_at": _latest_article_at(instrument_articles),
                    "pending_article_fingerprint": article_fingerprint,
                    "pending_article_count": len(instrument_articles),
                    "new_article_count": max(
                        0,
                        len(instrument_articles) - int(previous.get("article_count") or 0),
                    ),
                    "needs_brief_refresh": changed,
                    "missing_stock_intelligence": missing_brief,
                }
            changed_instrument_ids = sorted(changed_instrument_set)
            print(
                f"[per-stock] incremental discovery found {len(changed_instrument_ids)} changed instruments "
                f"out of {len(selected_instrument_ids)}"
            )

        raw_payload = [article.to_dict() for article in raw_articles]
        if args.upsert or args.paid_only or requested_ids is not None:
            store.upsert_news_articles(args.market, universe_id, raw_payload, source_health=source_health)
        else:
            store.save_news_articles(args.market, universe_id, raw_payload, source_health=source_health)

        if not raw_articles and not args.include_no_news:
            if freshness_payloads:
                store.save_news_freshness_docs(list(freshness_payloads.values()))
            print("[per-stock] no articles after partitioned fetch - skipping enrichment and synthesis")
            logger.info(
                "per_stock_intelligence early_exit reason=no_articles market=%s universe=%s instruments=%s",
                args.market,
                universe_id,
                len(instruments),
            )
            return

        if not raw_articles and args.include_no_news:
            enriched_articles = []
            print("[per-stock] no articles after partitioned fetch - continuing with no-news fallback briefs")

        if args.incremental and not changed_instrument_ids:
            if freshness_payloads:
                store.save_news_freshness_docs(list(freshness_payloads.values()))
            if args.emit_changed_instrument_ids_path:
                with open(args.emit_changed_instrument_ids_path, "w", encoding="utf-8") as handle:
                    json.dump([], handle)
            print("[per-stock] incremental mode found no changed instruments; enrichment and synthesis skipped")
            return

        if args.discovery_only:
            if freshness_payloads:
                store.save_news_freshness_docs(list(freshness_payloads.values()))
            if args.emit_changed_instrument_ids_path:
                with open(args.emit_changed_instrument_ids_path, "w", encoding="utf-8") as handle:
                    json.dump(sorted(changed_instrument_ids), handle)
            print("[per-stock] discovery-only mode complete (enrichment and synthesis skipped)")
            return

        refresh_instruments = instruments
        refresh_raw_articles = raw_articles
        if args.incremental and changed_instrument_ids:
            changed_instrument_set = set(changed_instrument_ids)
            refresh_instruments = [
                instrument
                for instrument in instruments
                if str(instrument.get("instrument_id") or "").strip().upper() in changed_instrument_set
            ]
            refresh_raw_articles = _filter_articles_for_instruments(raw_articles, refresh_instruments)

        enricher = OpenAIArticleEnricher(store=store)
        enriched_articles = enricher.enrich_articles(refresh_raw_articles)
        enriched_payload = [article.to_dict() for article in enriched_articles]
        if args.upsert or args.paid_only or requested_ids is not None:
            store.upsert_article_enrichments(args.market, universe_id, enriched_payload)
        else:
            store.save_article_enrichments(args.market, universe_id, enriched_payload)
        print(f"[per-stock] enriched {len(enriched_articles)} articles")

        if args.enrich_only:
            if freshness_payloads:
                now_iso = datetime.now(timezone.utc).isoformat()
                for instrument_id in changed_instrument_ids:
                    payload = dict(freshness_payloads.get(instrument_id) or {})
                    payload["latest_enrichment_at"] = now_iso
                    payload["needs_brief_refresh"] = True
                    freshness_payloads[instrument_id] = payload
                store.save_news_freshness_docs(list(freshness_payloads.values()))
            if args.emit_changed_instrument_ids_path:
                with open(args.emit_changed_instrument_ids_path, "w", encoding="utf-8") as handle:
                    json.dump(sorted(changed_instrument_ids), handle)
            logger.info(
                "per_stock_intelligence enrich_only complete market=%s universe=%s enriched=%s",
                args.market,
                universe_id,
                len(enriched_articles),
            )
            print("[per-stock] enrich-only mode complete (brief synthesis skipped)")
            return

    # ---------------------------------------------------------------------------
    # Alpha Vantage augmentation (additive — never replaces RSS articles)
    # AV articles have pre-computed per-ticker sentiment in entity_mentions and
    # skip LLM enrichment. If AV fails for any reason, enriched_articles is
    # unchanged and the pipeline continues with RSS-only coverage.
    # ---------------------------------------------------------------------------
    if not args.synthesis_only and not getattr(args, "skip_av", False):
        us_tickers = [
            str(inst.get("ticker") or "").strip().upper()
            for inst in instruments
            if str(inst.get("ticker") or "").strip()
        ]
        try:
            av_articles = fetch_av_news_for_tickers(
                us_tickers,
                market=args.market,
                min_relevance=0.3,
            )
            if av_articles:
                before = len(enriched_articles)
                existing_urls = {
                    str(getattr(a, "url", "") or "").strip()
                    for a in enriched_articles
                }
                new_av = [a for a in av_articles if a.url not in existing_urls]
                enriched_articles = enriched_articles + new_av
                print(
                    f"[per-stock] av augmentation added {len(new_av)} articles "
                    f"({len(av_articles) - len(new_av)} dupes dropped, "
                    f"total {len(enriched_articles)} was {before})"
                )
                logger.info(
                    "per_stock_intelligence av_augmentation added=%s dupes=%s total=%s",
                    len(new_av),
                    len(av_articles) - len(new_av),
                    len(enriched_articles),
                )
            else:
                print("[per-stock] av augmentation returned no articles (quota/rate-limit?) — continuing with RSS only")
        except Exception as av_exc:
            print(f"[per-stock] av augmentation failed ({av_exc}) — continuing with RSS only")
            logger.warning("per_stock_intelligence av_augmentation_failed error=%s", av_exc)

    # ---------------------------------------------------------------------------
    # Finnhub augmentation (per-ticker, additive)
    # One API call per tracked ticker (60 req/min free).  Only runs for US market
    # and only for the tracked-stocks subset so call count stays manageable.
    # Falls back gracefully — never blocks the pipeline.
    # ---------------------------------------------------------------------------
    if not args.synthesis_only and args.market == "US" and not args.skip_finnhub:
        tracked_tickers = [
            str(inst.get("ticker") or "").strip().upper()
            for inst in instruments
            if str(inst.get("ticker") or "").strip()
        ]
        try:
            fh_articles = fetch_finnhub_news_for_tickers(tracked_tickers, market=args.market)
            if fh_articles:
                existing_urls = {str(getattr(a, "url", "") or "").strip() for a in enriched_articles}
                new_fh = [a for a in fh_articles if a.url not in existing_urls]
                enriched_articles = enriched_articles + new_fh
                print(f"[per-stock] finnhub augmentation added {len(new_fh)} articles ({len(fh_articles)-len(new_fh)} dupes dropped)")
            else:
                print("[per-stock] finnhub augmentation returned no articles — continuing without")
        except Exception as fh_exc:
            print(f"[per-stock] finnhub augmentation failed ({fh_exc}) — continuing without")
            logger.warning("per_stock_intelligence finnhub_augmentation_failed error=%s", fh_exc)

    # ---------------------------------------------------------------------------
    # Marketaux augmentation (batched, additive)
    # 100 req/day free.  Batches all tickers in a few calls.  Entity-tagged
    # articles with per-ticker sentiment — same pattern as AV.
    # ---------------------------------------------------------------------------
    if not args.synthesis_only and not args.skip_marketaux:
        all_tickers = [
            str(inst.get("ticker") or "").strip().upper()
            for inst in instruments
            if str(inst.get("ticker") or "").strip()
        ]
        try:
            mx_articles = fetch_marketaux_news_for_tickers(all_tickers, market=args.market)
            if mx_articles:
                existing_urls = {str(getattr(a, "url", "") or "").strip() for a in enriched_articles}
                new_mx = [a for a in mx_articles if a.url not in existing_urls]
                enriched_articles = enriched_articles + new_mx
                print(f"[per-stock] marketaux augmentation added {len(new_mx)} articles ({len(mx_articles)-len(new_mx)} dupes dropped)")
            else:
                print("[per-stock] marketaux augmentation returned no articles — continuing without")
        except Exception as mx_exc:
            print(f"[per-stock] marketaux augmentation failed ({mx_exc}) — continuing without")
            logger.warning("per_stock_intelligence marketaux_augmentation_failed error=%s", mx_exc)

    if args.incremental and changed_instrument_ids and not args.synthesis_only:
        changed_instrument_set = set(changed_instrument_ids)
        existing_payloads = store.list_article_enrichments(
            args.market,
            universe_id,
            limit=max(400, len(changed_instrument_ids) * max(1, args.per_stock_cap) * 6),
        )
        existing_articles = [_coerce_article(payload) for payload in existing_payloads]
        existing_articles = _filter_articles_for_instruments(
            existing_articles,
            [
                instrument
                for instrument in instruments
                if str(instrument.get("instrument_id") or "").strip().upper() in changed_instrument_set
            ],
        )
        merged_by_id: dict[str, Article] = {}
        for article in existing_articles + enriched_articles:
            article_id = _article_identity(article)
            if article_id:
                merged_by_id[article_id] = article
        enriched_articles = list(merged_by_id.values())

    if args.incremental and changed_instrument_ids:
        instruments = [
            instrument
            for instrument in instruments
            if str(instrument.get("instrument_id") or "").strip().upper() in set(changed_instrument_ids)
        ]
    docs = build_stock_intelligence_docs(
        args.market,
        universe_id,
        instruments,
        enriched_articles,
        store=store,
        include_options_digest=True,
        include_no_news=args.include_no_news,
        no_news_instrument_ids=set(price_signals),
        no_news_tape_events=price_signals,
    )

    covered_ids = {doc["instrument_id"] for doc in docs if doc.get("instrument_id")}
    uncovered = [i for i in instruments if i["instrument_id"] not in covered_ids]
    print(f"[per-stock] built {len(docs)} stock briefs, {len(uncovered)} instruments uncovered")

    if uncovered and not args.include_no_news:
        print("[per-stock] no-news briefs skipped; UI will hide AI sections for uncovered instruments")

    if uncovered and args.include_no_news:
        uncovered_ids = [i["instrument_id"] for i in uncovered]
        latest_prices = store.get_latest_prices(uncovered_ids)
        intel_pro_by_id: dict[str, dict] = {}
        try:
            for doc in store.list_stock_intel_pro(args.market, universe_id):
                if isinstance(doc, dict) and doc.get("instrument_id"):
                    intel_pro_by_id[doc["instrument_id"]] = doc
        except Exception as exc:
            logger.warning("per_stock_intelligence could not load stock_intel_pro: %s", exc)
            print(f"[per-stock] warn: could not load stock_intel_pro docs: {exc}")
        coverage_universe_id = get_coverage_universe_id(args.market)
        if coverage_universe_id and coverage_universe_id != universe_id:
            try:
                for doc in store.list_stock_intel_pro(args.market, coverage_universe_id):
                    if not isinstance(doc, dict) or not doc.get("instrument_id"):
                        continue
                    instrument_id = str(doc["instrument_id"]).strip().upper()
                    intel_pro_by_id[instrument_id] = _prefer_better_intel_doc(
                        intel_pro_by_id.get(instrument_id),
                        doc,
                    )
            except Exception as exc:
                logger.warning("per_stock_intelligence could not load coverage stock_intel_pro: %s", exc)

        as_of_date = datetime.now(timezone.utc).date().isoformat()
        no_news_docs = 0
        skipped = 0
        for instrument in uncovered:
            instrument_id = instrument["instrument_id"]
            latest_price = latest_prices.get(instrument_id)
            if not latest_price:
                skipped += 1
                continue
            history = store.get_price_history(instrument_id, limit=260)
            technical_doc = build_stock_technical_doc(
                instrument=instrument,
                latest_price=latest_price,
                history_points=history,
                as_of_date=as_of_date,
            )
            avg_volume = _avg_volume_from_history(history)
            doc = build_no_news_intelligence_doc(
                instrument=instrument,
                market=args.market,
                universe_id=universe_id,
                latest_price_doc=latest_price,
                technical_doc=technical_doc,
                intel_pro_doc=intel_pro_by_id.get(instrument_id),
                avg_volume=avg_volume,
                store=store,
                history_points=history,
            )
            if doc is None:
                skipped += 1
                continue
            docs.append(doc)
            no_news_docs += 1
        print(f"[per-stock] no-news briefs: {no_news_docs} built, {skipped} skipped (missing price/LLM)")

    final_covered_ids = {
        str(doc.get("instrument_id") or "").strip().upper()
        for doc in docs
        if str(doc.get("instrument_id") or "").strip()
    }
    incomplete_ids = [
        str(instrument.get("instrument_id") or "").strip().upper()
        for instrument in instruments
        if str(instrument.get("instrument_id") or "").strip().upper() not in final_covered_ids
    ]
    if args.require_complete and incomplete_ids:
        raise RuntimeError(
            "Brief synthesis incomplete for "
            f"{len(incomplete_ids)}/{len(instruments)} instruments: "
            + ",".join(incomplete_ids[:20])
        )

    if args.upsert or args.paid_only or requested_ids is not None:
        store.upsert_stock_intelligence_docs(args.market, universe_id, docs)
    else:
        store.save_stock_intelligence_docs(args.market, universe_id, docs)

    if args.incremental:
        now_iso = datetime.now(timezone.utc).isoformat()
        docs_by_id = {
            str(doc.get("instrument_id") or "").strip().upper(): doc
            for doc in docs
            if str(doc.get("instrument_id") or "").strip()
        }
        for instrument in instruments:
            instrument_id = str(instrument.get("instrument_id") or "").strip().upper()
            if not instrument_id:
                continue
            payload = dict(freshness_payloads.get(instrument_id) or prior_freshness.get(instrument_id) or {})
            if instrument_id not in final_covered_ids:
                payload["needs_brief_refresh"] = True
                payload["last_brief_error"] = "no_brief_built"
                freshness_payloads[instrument_id] = payload
                continue
            payload.update(
                {
                    "market": args.market.upper(),
                    "universe_id": universe_id,
                    "instrument_id": instrument_id,
                    "ticker": str(instrument.get("ticker") or "").strip().upper(),
                    "latest_article_at": payload.get("pending_latest_article_at") or payload.get("latest_article_at") or "",
                    "article_fingerprint": payload.get("pending_article_fingerprint") or payload.get("article_fingerprint") or "",
                    "article_count": int(payload.get("pending_article_count") or payload.get("article_count") or 0),
                    "pending_latest_article_at": "",
                    "pending_article_fingerprint": "",
                    "pending_article_count": 0,
                    "latest_brief_at": now_iso,
                    "needs_brief_refresh": False,
                    "last_brief_error": "",
                    "brief_input_fingerprint": hashlib.sha256(
                        json.dumps(docs_by_id.get(instrument_id) or {}, sort_keys=True).encode("utf-8")
                    ).hexdigest(),
                    "price_brief_input_fingerprint": (
                        price_signals.get(instrument_id, {}).get("fingerprint")
                        or payload.get("price_brief_input_fingerprint")
                        or ""
                    ),
                    "price_brief_signal": (
                        price_signals.get(instrument_id)
                        or payload.get("price_brief_signal")
                        or {}
                    ),
                }
            )
            freshness_payloads[instrument_id] = payload
        if freshness_payloads:
            store.save_news_freshness_docs(list(freshness_payloads.values()))
        if args.emit_changed_instrument_ids_path:
            with open(args.emit_changed_instrument_ids_path, "w", encoding="utf-8") as handle:
                json.dump(sorted(changed_instrument_ids), handle)

    if not args.skip_context:
        import sys
        argv = ["build_context_intelligence", "--market", args.market, "--universe", universe_id]
        if args.instrument_ids:
            argv.extend(["--instrument-ids", args.instrument_ids])
        sys.argv = argv
        build_context_intelligence_main()

    if not args.skip_materialize:
        materialize_views(
            market=args.market,
            universe_id=universe_id,
            instrument_ids=[instrument["instrument_id"] for instrument in instruments],
            allow_missing_context=True,
            skip_sector_scrape=True,
            store=store,
        )

    logger.info(
        "per_stock_intelligence complete market=%s universe=%s briefs=%s instruments=%s",
        args.market,
        universe_id,
        len(docs),
        len(instruments),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("per_stock_intelligence failed")
        raise
