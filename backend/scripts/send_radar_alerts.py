from __future__ import annotations

import argparse

from backend.env import load_backend_env
from backend.price_alerts import process_price_alerts
from backend.radar_alerts import process_automatic_radar_alerts
from backend.storage import TraceMoneyStore


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send Pro Radar price, zone, and earnings alerts")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    manual = process_price_alerts(store, dry_run=args.dry_run)
    automatic = process_automatic_radar_alerts(store, dry_run=args.dry_run)
    print({"manual": manual, "automatic": automatic})


if __name__ == "__main__":
    main()
