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
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from backend.instrument_universe import list_instruments
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


def _prepare_grouped_stock_articles(
    raw_articles: list[Article],
    instruments: list[dict[str, Any]],
) -> list[Article]:
    """Project raw fetched articles into stock-scoped evidence rows.

    For paid-only refreshes we don't need article-level LLM enrichment. Instead,
    build one stock-targeted evidence row per (article, stock) match so the
    downstream brief synthesizer can run one LLM call per stock.
    """
    instruments_by_ticker = {
        str(instrument.get("ticker") or "").strip().upper(): instrument
        for instrument in instruments
        if str(instrument.get("ticker") or "").strip()
    }
    if not instruments_by_ticker:
        return []

    ticker_patterns = {
        ticker: re.compile(rf"\b{re.escape(ticker)}\b", re.IGNORECASE)
        for ticker in instruments_by_ticker.keys()
    }
    projected: list[Article] = []
    seen_pairs: set[tuple[str, str]] = set()

    for article in raw_articles:
        targets: set[str] = set()
        focus_ticker = str(getattr(article, "focus_ticker", "") or "").strip().upper()
        if focus_ticker in instruments_by_ticker:
            targets.add(focus_ticker)

        for ticker in getattr(article, "stock_tickers", []) or []:
            t = str(ticker or "").strip().upper()
            if t in instruments_by_ticker:
                targets.add(t)

        if not targets:
            text = f"{article.title} {article.summary} {article.body_text}"
            for ticker, pattern in ticker_patterns.items():
                if pattern.search(text):
                    targets.add(ticker)

        if not targets:
            continue

        article_key = (
            str(getattr(article, "id", "") or "").strip()
            or str(getattr(article, "url", "") or "").strip()
        )
        if not article_key:
            continue

        for ticker in targets:
            instrument = instruments_by_ticker.get(ticker)
            if not instrument:
                continue
            instrument_id = str(instrument.get("instrument_id") or "").strip()
            if not instrument_id:
                continue
            pair_key = (article_key, instrument_id)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            score = float(getattr(article, "sentiment_score", 0.0) or 0.0)
            label = (
                str(getattr(article, "sentiment_label", "") or "").strip().lower()
                or _sentiment_label_from_score(score)
            )
            overview = (
                str(getattr(article, "article_overview", "") or "").strip()
                or str(getattr(article, "summary", "") or "").strip()
                or str(getattr(article, "title", "") or "").strip()
            )
            points = [
                str(point).strip()
                for point in (getattr(article, "article_key_points", []) or [])
                if str(point).strip()
            ]
            if not points:
                summary = str(getattr(article, "summary", "") or "").strip()
                title = str(getattr(article, "title", "") or "").strip()
                if summary:
                    points.append(summary)
                if title and title not in points:
                    points.append(title)

            projected.append(
                replace(
                    article,
                    stock_tickers=[ticker],
                    sentiment_score=score,
                    sentiment_label=label,
                    article_overview=overview,
                    article_key_points=points[:4],
                    entity_mentions=[
                        {
                            "type": "stock",
                            "canonical_name": str(instrument.get("name") or ticker),
                            "ticker": ticker,
                            "sector_id": "",
                            "market_id": "",
                            "sentiment_score": score,
                            "confidence": 0.9,
                            "relevance": 0.95,
                            "mention_role": "primary",
                            "what_happened": overview[:240] or "unknown",
                            "why_it_matters": (points[0] if points else "unknown")[:240],
                            "bullish_points": [],
                            "risk_points": [],
                            "entity_overview": overview[:240] or "unknown",
                            "entity_key_points": points[:3],
                        }
                    ],
                    enrichment_source="grouped_stock_llm",
                )
            )

    return projected


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
    parser.add_argument("--paid-only", action="store_true", help="Refresh only subscribed users' tracked stocks")
    parser.add_argument("--upsert", action="store_true", help="Upsert articles/enrichments/briefs instead of replacing subcollections")
    parser.add_argument(
        "--grouped-stock-llm",
        action="store_true",
        help="Skip article-level LLM enrichment and build stock-grouped evidence (one LLM call per stock).",
    )
    parser.add_argument("--enrich-only", action="store_true", help="Fetch + enrich news only, skip brief synthesis")
    parser.add_argument("--synthesis-only", action="store_true", help="Build briefs from existing enrichments only")
    parser.add_argument("--skip-av", action="store_true", help="Skip Alpha Vantage news augmentation (fall back to RSS only)")
    parser.add_argument(
        "--synthesis-lookback-hours",
        type=int,
        default=24,
        help="When --synthesis-only, include only enrichments newer than this many hours (default 24). Set 0 to disable.",
    )
    args = parser.parse_args()
    if args.enrich_only and args.synthesis_only:
        raise ValueError("--enrich-only and --synthesis-only cannot be combined")
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
    use_grouped_stock_llm = bool(
        (args.grouped_stock_llm or args.paid_only)
        and not args.synthesis_only
        and not args.enrich_only
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
        max_docs = max(200, len(instruments) * max(1, args.per_stock_cap) * 4)
        enriched_payloads = store.list_article_enrichments(args.market, universe_id, limit=max_docs)
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

        raw_payload = [article.to_dict() for article in raw_articles]
        if args.upsert or args.paid_only or requested_ids is not None:
            store.upsert_news_articles(args.market, universe_id, raw_payload, source_health=source_health)
        else:
            store.save_news_articles(args.market, universe_id, raw_payload, source_health=source_health)

        if not raw_articles:
            print("[per-stock] no articles after partitioned fetch - skipping enrichment and synthesis")
            logger.info(
                "per_stock_intelligence early_exit reason=no_articles market=%s universe=%s instruments=%s",
                args.market,
                universe_id,
                len(instruments),
            )
            return

        if use_grouped_stock_llm:
            enriched_articles = _prepare_grouped_stock_articles(raw_articles, instruments)
            enriched_payload = [article.to_dict() for article in enriched_articles]
            if args.upsert or args.paid_only or requested_ids is not None:
                store.upsert_article_enrichments(args.market, universe_id, enriched_payload)
            else:
                store.save_article_enrichments(args.market, universe_id, enriched_payload)
            print(
                f"[per-stock] grouped evidence rows {len(enriched_articles)} "
                f"across {len(instruments)} stocks (article-level LLM enrichment skipped)"
            )
        else:
            enricher = OpenAIArticleEnricher(store=store)
            enriched_articles = enricher.enrich_articles(raw_articles)
            enriched_payload = [article.to_dict() for article in enriched_articles]
            if args.upsert or args.paid_only or requested_ids is not None:
                store.upsert_article_enrichments(args.market, universe_id, enriched_payload)
            else:
                store.save_article_enrichments(args.market, universe_id, enriched_payload)
            print(f"[per-stock] enriched {len(enriched_articles)} articles")

        if args.enrich_only:
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
    if not args.synthesis_only and args.market == "US":
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
    if not args.synthesis_only:
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

    docs = build_stock_intelligence_docs(
        args.market,
        universe_id,
        instruments,
        enriched_articles,
        store=store,
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
            )
            if doc is None:
                skipped += 1
                continue
            docs.append(doc)
            no_news_docs += 1
        print(f"[per-stock] no-news briefs: {no_news_docs} built, {skipped} skipped (missing price/LLM)")

    if args.upsert or args.paid_only or requested_ids is not None:
        store.upsert_stock_intelligence_docs(args.market, universe_id, docs)
    else:
        store.save_stock_intelligence_docs(args.market, universe_id, docs)

    if not args.skip_context:
        import sys
        sys.argv = ["build_context_intelligence", "--market", args.market, "--universe", universe_id]
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
