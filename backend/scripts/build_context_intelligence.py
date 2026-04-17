"""Build market/sector context docs and contextualize stock docs."""
from __future__ import annotations

import argparse
import json

from backend.context_intelligence import (
    ContextBriefWriter,
    build_market_context_doc,
    build_sector_context_docs,
    contextualize_stock_docs,
)
from backend.instrument_universe import list_instruments
from backend.models import Article
from backend.storage import TraceMoneyStore


def _coerce_article(payload: dict) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build market and sector context docs")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    writer = ContextBriefWriter(store=store)
    instruments = list_instruments(args.market, args.universe)
    articles = [_coerce_article(payload) for payload in store.list_article_enrichments(args.market, args.universe)]
    stock_docs = store.list_stock_intelligence_docs(args.market, args.universe)

    sector_context_docs = build_sector_context_docs(args.market, args.universe, articles, writer=writer)
    market_context = build_market_context_doc(
        args.market, args.universe, articles, writer=writer,
        stock_docs=stock_docs, sector_docs=sector_context_docs, store=store,
    )
    contextual_stock_docs = contextualize_stock_docs(
        instruments,
        articles,
        stock_docs,
        market_context,
        sector_context_docs,
        writer=writer,
    )

    store.save_market_context_doc(args.market, args.universe, market_context)
    store.save_sector_context_docs(args.market, args.universe, sector_context_docs)
    store.save_stock_intelligence_docs(args.market, args.universe, contextual_stock_docs)

    if args.print_json:
        print(json.dumps({
            "market_context": market_context,
            "sector_context": sector_context_docs,
            "stock_docs": contextual_stock_docs,
        }, indent=2))
    else:
        print(
            f"Saved market context, {len(sector_context_docs)} sector docs, and "
            f"{len(contextual_stock_docs)} contextualized stock docs for {args.market} / {args.universe}."
        )


if __name__ == "__main__":
    main()
