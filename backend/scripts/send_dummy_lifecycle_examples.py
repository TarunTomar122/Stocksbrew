"""Send redesigned lifecycle email previews to a target inbox.

Usage:
  python -m backend.scripts.send_dummy_lifecycle_examples --to you@example.com
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.lifecycle_emailing import send_email  # noqa: E402

PREVIEWS_DIR = os.path.join(os.path.dirname(__file__), "..", "email_previews")

TEMPLATES = [
    ("01_track_blocked.html",      "Radar locked - Unlock Radar for NVDA"),
    ("02_checkout_abandoned.html", "Checkout pending - You were this close"),
    ("03_free_high_intent.html",   "Stop piecing it together yourself"),
    ("04_free_alert_teaser.html",  "Stop refreshing. Get alerted instead"),
    ("05_pro_welcome.html",        "Pro is active. Do these 3 things now"),
    ("06_pro_daily_digest.html",   "Your Radar today - May 6, 2026"),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--to", required=True)
    args = parser.parse_args()

    sent = 0
    for filename, subject in TEMPLATES:
        path = os.path.join(PREVIEWS_DIR, filename)
        with open(path, encoding="utf-8") as f:
            html = f.read()
        ok = send_email(args.to, subject, html)
        print(f"{'✓' if ok else '✗'} {filename}: {'sent' if ok else 'FAILED'}")
        if ok:
            sent += 1

    print(f"\nDone. {sent}/{len(TEMPLATES)} emails sent to {args.to}")


if __name__ == "__main__":
    main()
