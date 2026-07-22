"""Materialize the public opening-sentiment report for the pre-market page."""
from __future__ import annotations

import argparse
import json

from backend.premarket_sentiment import build_opening_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build US market opening-sentiment report")
    parser.add_argument("--market", choices=["US"], default="US")
    parser.add_argument("--phase", choices=["early", "premarket"], default="premarket")
    parser.add_argument("--require-web-revalidate", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run:
        print(json.dumps({"dry_run": True, "market": args.market, "phase": args.phase}))
        return

    from backend.storage import TraceMoneyStore

    report = build_opening_report(
        TraceMoneyStore(),
        market=args.market,
        phase=args.phase,
        require_web_revalidate=args.require_web_revalidate,
    )
    print(json.dumps({
        "status": "success",
        "market": report["market"],
        "phase": report["phase"],
        "score": report["score"],
        "label": report["label"],
        "global_cues": len(report["global_cues"]),
        "premarket_available": report["premarket"]["available"],
    }))


if __name__ == "__main__":
    main()
