"""Score the currently live stock briefs with the Jev shadow gate.

Run on the VPS:
  set -a && source /etc/tikrr/backend.env && set +a
  python3 -m backend.scripts.jev_brief_qa_report --market US --limit 100

Read-only: prints how many live briefs the gate would hold and why.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor

from backend.jev_qa import gate_brief
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Jev QA report over live briefs")
    parser.add_argument("--market", default="US", choices=["US", "IN"])
    parser.add_argument("--universe", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    store = TraceMoneyStore()
    market = args.market.upper()
    universe = args.universe or store.get_active_price_universe(market)
    if not universe:
        raise SystemExit(f"No active price universe for {market}")

    docs = store.list_stock_intelligence_docs(market, universe)
    if args.limit > 0:
        docs = docs[: args.limit]
    if not docs:
        print({"status": "no_briefs"})
        return

    def run(doc: dict) -> dict | None:
        result = gate_brief(doc)
        return result

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(run, docs))

    scored = [r for r in results if r]
    held = [r for r in scored if r["decision"] == "hold"]
    rows = [
        {
            "ticker": doc.get("ticker") or (doc.get("instrument_id") or "").split("_")[-1],
            **{key: result[key] for key in ("decision", "correct_company", "prices_sane", "evidence_supported")},
        }
        for doc, result in zip(docs, results)
        if result
    ]
    print(
        {
            "briefs": len(docs),
            "scored": len(scored),
            "held": len(held),
            "holds": [
                {"ticker": row["ticker"], **{k: row[k] for k in ("correct_company", "prices_sane", "evidence_supported")}}
                for row in rows
                if row["decision"] == "hold"
            ][:20],
        }
    )


if __name__ == "__main__":
    main()
