"""Send one Pro welcome email preview to a single inbox."""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.email import send_email  # noqa: E402
from backend.env import load_backend_env  # noqa: E402
from backend.emails.welcome_pro import build_welcome_pro_email  # noqa: E402

DEFAULT_EMAIL = "tomartarun2001@gmail.com"


def main() -> None:
    load_backend_env()
    parser = argparse.ArgumentParser(description="Send a Pro welcome email preview.")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--name", default="Tarun", help="Display name to personalize the greeting")
    args = parser.parse_args()

    subject, html_doc = build_welcome_pro_email(email=args.email, display_name=args.name)
    ok = send_email(args.email, subject, html_doc)
    print(json.dumps({"to": args.email, "subject": subject, "sent": ok}, indent=2))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
