"""Per-stock AI pipeline — fetches per-ticker news, enriches, and builds a
brief for each instrument in the universe.

This is the stock-first successor to `build_news_intelligence.py`. The old
pipeline pooled all articles into a single 20-article budget, so popular
tickers drowned out quiet ones and most of the watchlist got zero AI
coverage on any given run. This script partitions the fetch by ticker so
every instrument in the AI-tier universe gets a guaranteed slice of news
articles (plus a small broad bucket kept alive for market/sector briefs).
"""
from __future__ import annotations

import argparse

from backend.instrument_universe import list_instruments
from backend.landing_metrics import build_stock_technical_doc
from backend.llm_enrichment import OpenAIArticleEnricher
from backend.news_pipeline import collect_per_ticker_articles
from backend.scripts.build_context_intelligence import main as build_context_intelligence_main
from backend.scripts.materialize_views import main as materialize_views_main
from backend.stock_intelligence import build_no_news_intelligence_doc, build_stock_intelligence_docs
from backend.storage import TraceMoneyStore

from datetime import datetime, timezone


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Build per-stock AI intelligence for an AI-tier universe")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True, help="AI-tier universe id, e.g. us_ai_launch")
    parser.add_argument("--per-stock-cap", type=int, default=5, help="Max articles fetched per ticker (default 5)")
    parser.add_argument("--broad-cap", type=int, default=12, help="Max broad-lane articles kept for market/sector briefs (default 12)")
    parser.add_argument("--skip-context", action="store_true", help="Skip market/sector context brief build")
    parser.add_argument("--skip-materialize", action="store_true", help="Skip dashboard/instrument view materialization")
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = list_instruments(args.market, args.universe)
    if not instruments:
        raise ValueError(f"No instruments found for {args.market} / {args.universe}")

    print(f"[per-stock] fetching per-ticker articles for {len(instruments)} instruments "
          f"(cap {args.per_stock_cap}/ticker, broad cap {args.broad_cap})")
    raw_articles, source_health = collect_per_ticker_articles(
        market=args.market,
        universe_id=args.universe,
        per_stock_cap=args.per_stock_cap,
        broad_cap=args.broad_cap,
    )
    print(f"[per-stock] fetched {len(raw_articles)} articles across "
          f"{sum(1 for s in source_health if s['ok'])} healthy sources")

    raw_payload = [article.to_dict() for article in raw_articles]
    store.save_news_articles(args.market, args.universe, raw_payload, source_health=source_health)

    if not raw_articles:
        print("[per-stock] no articles after partitioned fetch — skipping enrichment and synthesis")
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

    if uncovered:
        uncovered_ids = [i["instrument_id"] for i in uncovered]
        latest_prices = store.get_latest_prices(uncovered_ids)
        intel_pro_by_id: dict[str, dict] = {}
        try:
            for doc in store.list_stock_intel_pro(args.market, args.universe):
                if isinstance(doc, dict) and doc.get("instrument_id"):
                    intel_pro_by_id[doc["instrument_id"]] = doc
        except Exception as exc:
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


if __name__ == "__main__":
    main()
