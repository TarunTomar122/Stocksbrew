from __future__ import annotations

import os
import sys

import requests


def main() -> None:
    base = os.getenv("WEB_REVALIDATE_BASE_URL", "").strip().rstrip("/")
    token = os.getenv("WEB_REVALIDATE_TOKEN", "").strip()
    if not base or not token:
        print("skip revalidate: WEB_REVALIDATE_BASE_URL or WEB_REVALIDATE_TOKEN missing")
        return
    url = f"{base}/api/revalidate"
    resp = requests.post(url, headers={"x-revalidate-token": token}, timeout=20)
    if resp.status_code >= 300:
        print(f"revalidate failed: {resp.status_code} {resp.text[:300]}")
        sys.exit(1)
    print("revalidate ok")


if __name__ == "__main__":
    main()

