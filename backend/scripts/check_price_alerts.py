"""
Price alert checker — marks alerts triggered when price crosses a threshold
and sends a Radar-enriched email (see backend/price_alerts.py).
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.env import load_backend_env  # noqa: E402
from backend.price_alerts import process_price_alerts  # noqa: E402
from backend.storage import TraceMoneyStore  # noqa: E402


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Check active price alerts and send emails.")
    parser.add_argument("--dry-run", action="store_true", help="Log triggers without writing or sending.")
    args = parser.parse_args()

    store = TraceMoneyStore()
    stats = process_price_alerts(store, dry_run=args.dry_run)

    if stats["checked"] == 0:
        print("No active alerts to check")
        return

    print(
        f"Checked {stats['checked']} alerts — "
        f"triggered {stats['triggered']}, sent {stats['sent']}, "
        f"no price {stats['skipped_no_price']}, "
        f"not triggered {stats['skipped_not_triggered']}"
    )


if __name__ == "__main__":
    main()
