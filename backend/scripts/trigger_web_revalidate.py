"""Tell the web app that the pipeline wrote new data, so its cached pages are refreshed.

Two ways in:
  - ``trigger_web_revalidate(paths)``: explicit page paths (the pre-market lane).
  - ``revalidate_after_write(kinds, symbols=...)``: the kinds of data a job just
    wrote ("prices", "briefs", "news", "earnings", "filings", ...). The web app
    maps them to its pages (lib/revalidate-targets.ts), refreshes its own cached
    copies on every instance and drops the matching HTML from Varnish
    (app/api/revalidate/route.ts). Batched (one call per job, tickers in chunks),
    rate-limited per kind across processes, and best effort: it never raises,
    so a job's own result never depends on it.

Needs WEB_REVALIDATE_BASE_URL and WEB_REVALIDATE_TOKEN (backend/vps/run-dispatch.sh
and run-agentdata.sh load the token from /etc/tikrr/web-revalidate-token).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Iterable

import requests

# The kinds lib/revalidate-targets.ts knows. Anything else is dropped here, so a typo shows up in the job log.
KNOWN_KINDS = ("prices", "briefs", "news", "earnings", "filings", "signals", "calendar", "themes", "premarket")
# Tickers per request: the route refreshes each one on every instance.
SYMBOL_CHUNK = 200
# The route forwards to every instance (10 s each at most) and then bans: allow for both.
REQUEST_TIMEOUT_SECONDS = 30


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


def _stamp_path(kinds: list[str]) -> Path:
    lock_dir = Path(os.getenv("TIKRR_LOCK_DIR", "/tmp/tikrr-locks"))
    return lock_dir / f"web-revalidate-{'-'.join(kinds)}.stamp"


def _recently_sent(kinds: list[str], min_interval_seconds: float) -> bool:
    """Whether the same kinds were sent less than ``min_interval_seconds`` ago, by any process on this box."""

    if min_interval_seconds <= 0:
        return False
    try:
        return time.time() - _stamp_path(kinds).stat().st_mtime < min_interval_seconds
    except OSError:
        return False


def _mark_sent(kinds: list[str]) -> None:
    try:
        path = _stamp_path(kinds)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    except OSError:
        pass


def revalidate_after_write(
    kinds: Iterable[str],
    *,
    symbols: Iterable[str] | None = None,
    min_interval_seconds: float = 0,
    force: bool = False,
) -> bool:
    """Refresh the web pages that show ``kinds`` of data (and the stock pages of ``symbols``). Never raises.

    Returns True when the app accepted every request. Skipped (False, nothing
    sent) without the base URL or token, or when the same kinds were sent less
    than ``min_interval_seconds`` ago.
    """

    try:
        wanted = sorted({str(kind).strip() for kind in kinds if str(kind).strip() in KNOWN_KINDS})
        tickers = sorted({str(symbol).strip().upper() for symbol in (symbols or []) if str(symbol).strip()})
        if not wanted and not tickers:
            return False
        base = os.getenv("WEB_REVALIDATE_BASE_URL", "").strip().rstrip("/")
        token = os.getenv("WEB_REVALIDATE_TOKEN", "").strip()
        if not base or not token:
            print("skip revalidate: WEB_REVALIDATE_BASE_URL or WEB_REVALIDATE_TOKEN missing")
            return False
        key = wanted or ["symbols"]
        if not force and _recently_sent(key, min_interval_seconds):
            print(f"skip revalidate kinds={','.join(key)}: sent less than {int(min_interval_seconds)}s ago")
            return False
        # The kinds go once, with the first chunk of tickers; later chunks carry tickers only.
        chunks = [tickers[start : start + SYMBOL_CHUNK] for start in range(0, len(tickers), SYMBOL_CHUNK)] or [[]]
        ok = True
        for index, chunk in enumerate(chunks):
            body: dict[str, object] = {"force": force}
            if index == 0 and wanted:
                body["kinds"] = wanted
            if chunk:
                body["symbols"] = chunk
            try:
                resp = requests.post(
                    f"{base}/api/revalidate",
                    headers={"x-revalidate-token": token},
                    json=body,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            except requests.RequestException as exc:
                print(f"revalidate kinds={','.join(wanted)} failed: {exc}")
                ok = False
                continue
            if resp.status_code >= 300:
                print(f"revalidate kinds={','.join(wanted)} failed: {resp.status_code} {resp.text[:300]}")
                ok = False
                continue
            print(f"revalidate ok kinds={','.join(wanted)} symbols={len(chunk)} response={resp.text[:300]}")
        if ok:
            _mark_sent(key)
        return ok
    except Exception as exc:  # best effort: a job never fails because of this
        print(f"revalidate failed: {exc}")
        return False


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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="refresh the web app's cached pages")
    parser.add_argument("--kinds", default="", help="comma-separated data kinds just written (best effort, exit 0)")
    parser.add_argument("--min-interval", type=float, default=0, help="skip when the same kinds were sent this recently (s)")
    args = parser.parse_args(argv)
    if args.kinds:
        revalidate_after_write(args.kinds.split(","), min_interval_seconds=args.min_interval)
        return
    if not trigger_web_revalidate():
        if os.getenv("WEB_REVALIDATE_BASE_URL", "").strip() and os.getenv("WEB_REVALIDATE_TOKEN", "").strip():
            sys.exit(1)


if __name__ == "__main__":
    main()
