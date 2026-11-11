from __future__ import annotations

import os
import sys

import requests


def _paths() -> list[str]:
    raw = os.getenv("WEB_REVALIDATE_PATHS", "/")
    paths = [part.strip() for part in raw.split(",") if part.strip()]
    return paths or ["/"]


def trigger_web_revalidate(
    paths: list[str] | None = None,
    *,
    force: bool = False,
    notify_indexnow: bool = False,
) -> bool:
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
        json={"paths": resolved, "force": force},
        timeout=20,
    )
    if resp.status_code >= 300:
        print(f"revalidate failed: {resp.status_code} {resp.text[:300]}")
        return False
    print(f"revalidate ok paths={','.join(resolved)} response={resp.text[:300]}")
    if notify_indexnow:
        indexable_paths = [
            path for path in resolved if not path.endswith((".xml", ".txt"))
        ]
        indexnow_resp = requests.post(
            f"{base}/api/seo/indexnow",
            headers={"x-revalidate-token": token},
            json={"urls": indexable_paths, "include_defaults": False},
            timeout=20,
        )
        if indexnow_resp.status_code >= 300:
            print(f"indexnow failed: {indexnow_resp.status_code} {indexnow_resp.text[:300]}")
            return False
        print(f"indexnow ok paths={','.join(indexable_paths)} response={indexnow_resp.text[:300]}")
    return True


def notify_indexnow_families(
    families: list[str],
    *,
    changed_since: str | None = None,
) -> bool:
    """Tell IndexNow about whole sitemap families (for example ``["stocks"]``).

    The web app builds the list from the same code as ``/sitemaps/<family>.xml``
    and, with ``changed_since`` (YYYY-MM-DD), keeps only pages whose ``lastmod``
    is that day or later, so unchanged pages are not resubmitted. It sends them
    in batches within IndexNow's 10,000-URL limit. Best effort: never raises.
    """
    base = os.getenv("WEB_REVALIDATE_BASE_URL", "").strip().rstrip("/")
    token = os.getenv("WEB_REVALIDATE_TOKEN", "").strip()
    if not base or not token:
        print("skip indexnow families: WEB_REVALIDATE_BASE_URL or WEB_REVALIDATE_TOKEN missing")
        return False
    body: dict[str, object] = {"families": families, "include_defaults": False}
    if changed_since:
        body["changed_since"] = changed_since
    try:
        resp = requests.post(
            f"{base}/api/seo/indexnow",
            headers={"x-revalidate-token": token},
            json=body,
            timeout=60,
        )
    except requests.RequestException as exc:
        print(f"indexnow families failed: {exc}")
        return False
    if resp.status_code >= 300:
        print(f"indexnow families failed: {resp.status_code} {resp.text[:300]}")
        return False
    # The route answers 200 with ok=false when IndexNow refused the list (a 429, say).
    try:
        accepted = bool(resp.json().get("ok"))
    except ValueError:
        accepted = False
    if not accepted:
        print(f"indexnow families refused: {resp.text[:300]}")
        return False
    print(f"indexnow families ok families={','.join(families)} since={changed_since or '-'} response={resp.text[:300]}")
    return True


def main() -> None:
    if not trigger_web_revalidate():
        if os.getenv("WEB_REVALIDATE_BASE_URL", "").strip() and os.getenv("WEB_REVALIDATE_TOKEN", "").strip():
            sys.exit(1)


if __name__ == "__main__":
    main()
