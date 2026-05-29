"""Aggregate enriched articles into stock intelligence docs."""
from __future__ import annotations

import argparse
import json

from backend.instrument_universe import list_instruments
from backend.models import Article
from backend.stock_intelligence import build_stock_intelligence_docs
from backend.storage import TraceMoneyStore


def _coerce_article(payload: dict) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Trace Money stock intelligence docs")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument(
        "--ticker",
        help=(
            "Optional comma-separated tickers to rebuild only those stocks. "
            "Uses an upsert (merge) write so the rest of the universe's docs "
            "are left untouched. Without it, the whole universe is rebuilt and "
            "the stock_intelligence subcollection is replaced."
        ),
    )
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = list_instruments(args.market, args.universe)
    only_tickers = {
        t.strip().upper() for t in (args.ticker or "").split(",") if t.strip()
    }
    if only_tickers:
        instruments = [
            inst for inst in instruments
            if str(inst.get("ticker", "")).upper() in only_tickers
        ]
        if not instruments:
            raise SystemExit(
                f"No instruments matched {sorted(only_tickers)} in {args.market}/{args.universe}."
            )
    articles = [_coerce_article(payload) for payload in store.list_article_enrichments(args.market, args.universe)]
    if only_tickers:
        # Scope articles to ones that actually mention the target tickers.
        # build_stock_intelligence_docs falls back to "all articles" when a
        # single instrument has no entity matches; without this filter that
        # fallback would graft unrelated stocks' news onto the target ticker.
        def _mentions_target(article) -> bool:
            for mention in getattr(article, "entity_mentions", []) or []:
                if mention.get("type") != "stock":
                    continue
                if str(mention.get("ticker", "")).upper().strip() in only_tickers:
                    return True
            return False

        articles = [a for a in articles if _mentions_target(a)]
    docs_payload = build_stock_intelligence_docs(args.market, args.universe, instruments, articles, store=store)
    if only_tickers:
        # Merge just these docs so we never wipe the rest of the universe.
        store.upsert_stock_intelligence_docs(args.market, args.universe, docs_payload)
    else:
        store.save_stock_intelligence_docs(args.market, args.universe, docs_payload)

    if args.print_json:
        print(json.dumps({
            "market": args.market,
            "universe_id": args.universe,
            "stock_count": len(docs_payload),
            "docs": docs_payload,
        }, indent=2))
    else:
        print(f"Saved {len(docs_payload)} stock intelligence docs for {args.market} / {args.universe}.")


if __name__ == "__main__":
    main()
