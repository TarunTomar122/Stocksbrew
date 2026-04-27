"""Fetch CNN Fear & Greed (US) and Tickertape MMI (IN) and persist."""
from __future__ import annotations

import argparse

from backend.mood_scraper import fetch_mood
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync market mood index")
    parser.add_argument("--market", choices=["US", "IN", "ALL"], default="ALL")
    args = parser.parse_args()

    markets = ["US", "IN"] if args.market == "ALL" else [args.market]
    store = TraceMoneyStore()
    for market in markets:
        mood = fetch_mood(market)
        payload = mood.to_dict()
        store.save_market_mood(market, payload)
        print(
            f"[{market}] mood {payload['score']} ({payload['rating']}) "
            f"via {payload['source']} — prev_day={payload.get('previous_day')}, "
            f"prev_week={payload.get('previous_week')}"
        )


if __name__ == "__main__":
    main()
