"""Save promoted tickers for a market."""
from __future__ import annotations

import argparse

from backend.market_strategy import normalize_ticker_entry
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Set promoted tickers for a market")
    parser.add_argument("--market", choices=["IN", "US"], required=True)
    parser.add_argument("--tickers", default="", help="Comma-separated tickers")
    args = parser.parse_args()

    entries = []
    for ticker in [item.strip().upper() for item in args.tickers.split(",") if item.strip()]:
        entries.append(normalize_ticker_entry({"ticker": ticker}, lane="promoted"))

    store = TraceMoneyStore()
    store.save_promoted_tickers(args.market, entries)
    print(f"Saved {len(entries)} promoted tickers for {args.market}.")


if __name__ == "__main__":
    main()
