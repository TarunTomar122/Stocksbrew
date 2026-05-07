from __future__ import annotations

import os
import sys

import requests


def _paths() -> list[str]:
    raw = os.getenv("WEB_REVALIDATE_PATHS", "/")
    paths = [part.strip() for part in raw.split(",") if part.strip()]
    return paths or ["/"]


def main() -> None:
    base = os.getenv("WEB_REVALIDATE_BASE_URL", "").strip().rstrip("/")
    token = os.getenv("WEB_REVALIDATE_TOKEN", "").strip()
    if not base or not token:
        print("skip revalidate: WEB_REVALIDATE_BASE_URL or WEB_REVALIDATE_TOKEN missing")
        return
    url = f"{base}/api/revalidate"
    paths = _paths()
    resp = requests.post(
        url,
        headers={"x-revalidate-token": token},
        json={"paths": paths},
        timeout=20,
    )
    if resp.status_code >= 300:
        print(f"revalidate failed: {resp.status_code} {resp.text[:300]}")
        sys.exit(1)
    print(f"revalidate ok paths={','.join(paths)} response={resp.text[:300]}")


if __name__ == "__main__":
    main()
