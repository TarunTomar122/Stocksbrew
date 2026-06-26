from __future__ import annotations

import os
import sys

import requests


def _paths() -> list[str]:
    raw = os.getenv("WEB_REVALIDATE_PATHS", "/")
    paths = [part.strip() for part in raw.split(",") if part.strip()]
    return paths or ["/"]


def trigger_web_revalidate(paths: list[str] | None = None) -> bool:
    base = os.getenv("WEB_REVALIDATE_BASE_URL", "").strip().rstrip("/")
    token = os.getenv("WEB_REVALIDATE_TOKEN", "").strip()
    if not base or not token:
        print("skip revalidate: WEB_REVALIDATE_BASE_URL or WEB_REVALIDATE_TOKEN missing")
        return False
    url = f"{base}/api/revalidate"
    resolved = paths or _paths()
    resp = requests.post(
        url,
        headers={"x-revalidate-token": token},
        json={"paths": resolved},
        timeout=20,
    )
    if resp.status_code >= 300:
        print(f"revalidate failed: {resp.status_code} {resp.text[:300]}")
        return False
    print(f"revalidate ok paths={','.join(resolved)} response={resp.text[:300]}")
    return True


def main() -> None:
    if not trigger_web_revalidate():
        if os.getenv("WEB_REVALIDATE_BASE_URL", "").strip() and os.getenv("WEB_REVALIDATE_TOKEN", "").strip():
            sys.exit(1)


if __name__ == "__main__":
    main()
