"""Pull institutional fund flows (FII/DII for IN) and persist daily snapshots."""
from __future__ import annotations

import argparse

from backend.flows_scraper import fetch_flows
from backend.storage import TraceMoneyStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync institutional flows")
    parser.add_argument("--market", choices=["IN"], default="IN")
    args = parser.parse_args()

    flows = fetch_flows(args.market)
    payload = flows.to_dict()
    store = TraceMoneyStore()
    store.save_institutional_flows(args.market, payload)
    for row in payload["flows"]:
        sign = "+" if row["net_cr"] >= 0 else ""
        print(f"  [{row['category']}] net ₹{sign}{row['net_cr']:.0f} Cr ({row['direction']})")
    print(f"Saved {args.market} flows for {payload['snapshot_date']}.")


if __name__ == "__main__":
    main()
