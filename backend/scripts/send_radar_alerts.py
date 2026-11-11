from __future__ import annotations

import os
import argparse

from backend.env import load_backend_env
from backend.price_alerts import process_price_alerts
from backend.radar_alerts import process_automatic_radar_alerts
from backend.storage import TraceMoneyStore


def main() -> None:
    load_backend_env()
    # The owner turned the old-design alert emails off with the switch to backend/mail (Nov 11):
    # with MAIL_V2_ACTIVE=1 this job stops before sending. LEGACY_ALERTS=1 brings it back.
    if os.environ.get("MAIL_V2_ACTIVE") == "1" and os.environ.get("LEGACY_ALERTS") != "1":
        print("[legacy alerts] MAIL_V2_ACTIVE=1: old-design alert emails are off; skipping")
        return
    parser = argparse.ArgumentParser(description="Send Pro Radar price, zone, and earnings alerts")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    store = TraceMoneyStore()
    manual = process_price_alerts(store, dry_run=args.dry_run)
    automatic = process_automatic_radar_alerts(store, dry_run=args.dry_run)
    print({"manual": manual, "automatic": automatic})


if __name__ == "__main__":
    main()
