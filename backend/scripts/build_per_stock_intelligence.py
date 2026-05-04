"""Per-stock AI pipeline — fetches per-ticker news, enriches, and builds a
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
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from backend.instrument_universe import list_instruments
from backend.landing_metrics import build_stock_technical_doc
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.news_pipeline import collect_per_ticker_articles
from backend.pipeline_logging import configure_pipeline_logging
from backend.scripts.build_context_intelligence import main as build_context_intelligence_main
from backend.scripts.materialize_views import main as materialize_views_main
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


def _fetch_chunk(
    market: str,
    universe_id: str,
    *,
    chunk_index: int,
    instruments: list[dict[str, Any]],
    per_stock_cap: int,
) -> tuple[int, list[Any], list[dict[str, object]], float]:
    started = time.time()
    articles, source_health = collect_per_ticker_articles(
        market=market,
        universe_id=universe_id,
        per_stock_cap=per_stock_cap,
        broad_cap=0,
        instruments_override=instruments,
    )
    return chunk_index, articles, source_health, time.time() - started


def main() -> None:
    parser = argparse.ArgumentParser(description="Build per-stock AI intelligence for an AI-tier universe")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True, help="AI-tier universe id, e.g. us_ai_launch")
    parser.add_argument("--per-stock-cap", type=int, default=5, help="Max articles fetched per ticker (default 5)")
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
    args = parser.parse_args()
    configure_pipeline_logging()
    logger.info(
        "per_stock_intelligence start market=%s universe=%s per_stock_cap=%s broad_cap=%s skip_context=%s skip_materialize=%s include_no_news=%s",
        args.market,
        args.universe,
        args.per_stock_cap,
        args.broad_cap,
        args.skip_context,
        args.skip_materialize,
        args.include_no_news,
    )

    store = TraceMoneyStore()
    base_instruments = list_instruments(args.market, args.universe)
    instruments, paid_tracked_count, paid_extra_count = _merge_with_paid_tracked(
        store,
        args.market,
        base_instruments,
    )
    if not instruments:
        raise ValueError(f"No instruments found for {args.market} / {args.universe}")
    logger.info(
        "per_stock_intelligence instrument_union market=%s universe=%s base_count=%s paid_tracked_count=%s paid_extra_count=%s total_count=%s",
        args.market,
        args.universe,
        len(base_instruments),
        paid_tracked_count,
        paid_extra_count,
        len(instruments),
    )

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
                universe_id=args.universe,
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
                    args.universe,
                    chunk_index=index,
                    instruments=chunk,
                    per_stock_cap=args.per_stock_cap,
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
            universe_id=args.universe,
            per_stock_cap=args.per_stock_cap,
            broad_cap=args.broad_cap,
            instruments_override=instruments,
        )
    print(
        f"[per-stock] fetched {len(raw_articles)} articles across "
        f"{sum(1 for s in source_health if s['ok'])} healthy sources"
    )

    raw_payload = [article.to_dict() for article in raw_articles]
    store.save_news_articles(args.market, args.universe, raw_payload, source_health=source_health)

    if not raw_articles:
        print("[per-stock] no articles after partitioned fetch — skipping enrichment and synthesis")
        logger.info(
            "per_stock_intelligence early_exit reason=no_articles market=%s universe=%s instruments=%s",
            args.market,
            args.universe,
            len(instruments),
        )
        return

    enricher = OpenAIArticleEnricher(store=store)
    enriched_articles = enricher.enrich_articles(raw_articles)
    enriched_payload = [article.to_dict() for article in enriched_articles]
    store.save_article_enrichments(args.market, args.universe, enriched_payload)
    print(f"[per-stock] enriched {len(enriched_articles)} articles")

    docs = build_stock_intelligence_docs(
        args.market,
        args.universe,
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
            for doc in store.list_stock_intel_pro(args.market, args.universe):
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
                universe_id=args.universe,
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

    store.save_stock_intelligence_docs(args.market, args.universe, docs)

    if not args.skip_context:
        import sys
        sys.argv = ["build_context_intelligence", "--market", args.market, "--universe", args.universe]
        build_context_intelligence_main()

    if not args.skip_materialize:
        import sys
        sys.argv = ["materialize_views", "--market", args.market, "--universe", args.universe]
        materialize_views_main()

    logger.info(
        "per_stock_intelligence complete market=%s universe=%s briefs=%s instruments=%s",
        args.market,
        args.universe,
        len(docs),
        len(instruments),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("per_stock_intelligence failed")
        raise
