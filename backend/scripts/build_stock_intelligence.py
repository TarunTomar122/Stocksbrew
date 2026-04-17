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
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = list_instruments(args.market, args.universe)
    articles = [_coerce_article(payload) for payload in store.list_article_enrichments(args.market, args.universe)]
    docs_payload = build_stock_intelligence_docs(args.market, args.universe, instruments, articles, store=store)
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
