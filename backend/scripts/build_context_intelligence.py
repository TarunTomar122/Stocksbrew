"""Build market/sector context docs and contextualize stock docs."""
from __future__ import annotations

import argparse
import json

from backend.context_intelligence import (
    ContextBriefWriter,
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

    price_by_id: dict[str, dict] = {}
    analyst_by_id: dict[str, dict] = {}
    for inst in instruments:
        iid = inst["instrument_id"]
        price_doc = store.db.collection("tm_latest_prices").document(iid).get()
        if price_doc.exists:
            price_by_id[iid] = price_doc.to_dict() or {}
        view_doc = store.db.collection("tm_views_instrument").document(f"{iid}__{args.universe}").get()
        if view_doc.exists:
            data = view_doc.to_dict() or {}
            if data.get("analyst_consensus"):
                analyst_by_id[iid] = data["analyst_consensus"]

    sector_context_docs = build_sector_context_docs(args.market, args.universe, instruments, articles, writer=writer)
    # Market-level brief is now handled by sync_market_brief (signal-based, not
    # news-based). Pass an empty context so contextualize_stock_docs doesn't
    # pull in stale market text but still works without changes.
    contextual_stock_docs = contextualize_stock_docs(
        instruments,
        articles,
        stock_docs,
        {},  # market_context — intentionally empty
        sector_context_docs,
        writer=writer,
        price_by_id=price_by_id,
        analyst_by_id=analyst_by_id,
    )

    store.save_sector_context_docs(args.market, args.universe, sector_context_docs)
    store.save_stock_intelligence_docs(args.market, args.universe, contextual_stock_docs)

    if args.print_json:
        print(json.dumps({
            "sector_context": sector_context_docs,
            "stock_docs": contextual_stock_docs,
        }, indent=2))
    else:
        print(
            f"Saved {len(sector_context_docs)} sector docs and "
            f"{len(contextual_stock_docs)} contextualized stock docs for {args.market} / {args.universe}."
        )


if __name__ == "__main__":
    main()
