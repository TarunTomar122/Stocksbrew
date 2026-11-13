"""Shared plumbing for the event feed jobs (earnings, news, filings, insiders).

* ``Fetcher``: polite HTTP GET with a global rate limit, retries and an on-disk
  cache under ``backend/.cache/<name>/``.
* ``query``: a filtered read against the document store (HTTP or SQLite).
* ``load_universe``: the US instruments we cover, from ``tm_instruments``.
* ``WriteLedger``: remembers what a job already wrote so a refresh only sends
  documents that changed.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from .store import DocStore

CACHE_ROOT = Path(__file__).resolve().parents[1] / ".cache"

SEC_USER_AGENT = "stocksbrew.online research (tomartarun2001@gmail.com)"
# Some public endpoints (Nasdaq's calendar API) only answer browser-shaped clients.
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


# -- http ---------------------------------------------------------------------


class Fetcher:
    """GET with a shared rate limit, retries and a file cache.

    ``min_interval`` is the gap between any two requests made through this
    fetcher, across threads. ``ttl`` is how long a cached body is reused;
    ``None`` means forever (for immutable documents such as a filed Form 4).
    """

    def __init__(
        self,
        name: str,
        *,
        user_agent: str,
        min_interval: float = 0.2,
        ttl: float | None = 3600,
        headers: dict[str, str] | None = None,
        timeout: float = 30,
        attempts: int = 4,
    ) -> None:
        self.name = name
        self._dir = CACHE_ROOT / name
        self._headers = {"User-Agent": user_agent, "Accept-Encoding": "identity", **(headers or {})}
        self._min_interval = min_interval
        self._ttl = ttl
        self._timeout = timeout
        self._attempts = max(1, attempts)
        self._lock = threading.Lock()
        self._next_at = 0.0
        self.requests = 0
        self.cache_hits = 0
        self.failures: list[str] = []

    def _cache_path(self, url: str) -> Path:
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
        return self._dir / digest[:2] / f"{digest}.txt"

    def _wait_turn(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._next_at - now
            self._next_at = max(now, self._next_at) + self._min_interval
        if wait > 0:
            time.sleep(wait)

    def get(self, url: str, *, ttl: float | None | str = "default", use_cache: bool = True) -> str | None:
        """Body as text, or None when the resource is missing or keeps failing."""
        limit = self._ttl if ttl == "default" else ttl
        path = self._cache_path(url)
        if use_cache and path.exists():
            if limit is None or time.time() - path.stat().st_mtime < float(limit):
                self.cache_hits += 1
                return path.read_text(encoding="utf-8", errors="replace")

        last = ""
        for attempt in range(self._attempts):
            self._wait_turn()
            self.requests += 1
            request = urllib.request.Request(url, headers=self._headers)
            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as response:
                    body = response.read().decode("utf-8", errors="replace")
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp = path.with_suffix(f".{threading.get_ident()}.tmp")
                tmp.write_text(body, encoding="utf-8")
                tmp.replace(path)
                return body
            except urllib.error.HTTPError as error:
                last = f"http {error.code}"
                if error.code in (404, 410):
                    return None
                if error.code in (403, 429, 500, 502, 503, 504):
                    # Back off hard: a 403/429 here means we were going too fast.
                    time.sleep(2.0 * (attempt + 1) ** 2)
                    continue
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as error:
                last = type(error).__name__
                time.sleep(1.5 * (attempt + 1))
        self.failures.append(f"{url} ({last})")
        return None

    def get_json(self, url: str, **kwargs: Any) -> Any | None:
        body = self.get(url, **kwargs)
        if body is None:
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            self.failures.append(f"{url} (bad json)")
            return None


# -- document store reads -----------------------------------------------------


def query(
    store: DocStore,
    collection: str,
    *,
    filters: Iterable[tuple[str, str, Any]] = (),
    orders: Iterable[tuple[str, str]] = (),
    limit: int | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """Filtered read of a top-level collection as (path, data) pairs.

    ``store.py`` only exposes list/get, so this talks to the same two backends
    directly: the Firestore-shaped client on SQLite, or ``POST /query`` over HTTP
    (capped by the service at 10,000 documents).
    """
    db = getattr(store, "_db", None)
    if db is not None:
        ref = db.collection(collection)
        for field_name, op, value in filters:
            ref = ref.where(field_name, op, value)
        for field_name, direction in orders:
            ref = ref.order_by(field_name, direction)
        if limit is not None:
            ref = ref.limit(limit)
        return [(f"{collection}/{snap.id}", snap.to_dict() or {}) for snap in ref.stream()]

    body: dict[str, Any] = {
        "collection": collection,
        "filters": [{"field": f, "op": op, "value": value} for f, op, value in filters],
        "orders": [{"field": f, "direction": direction} for f, direction in orders],
    }
    if limit is not None:
        body["limit"] = limit
    payload = store._request("POST", "/query", body) or {}  # noqa: SLF001 - same package
    return [
        (document["path"], document.get("data") or {})
        for document in payload.get("documents", [])
        if isinstance(document, dict) and "path" in document
    ]


# -- universe -----------------------------------------------------------------


@dataclass(frozen=True)
class Instrument:
    ticker: str
    name: str
    aliases: tuple[str, ...] = ()
    exchange: str = ""
    sector: str = ""


def symbol_key(symbol: str) -> str:
    """BRK.B, BRK-B and BRK/B are the same listing on different sites."""
    return "".join(ch for ch in symbol.upper() if ch.isalnum())


def load_universe(store: DocStore) -> list[Instrument]:
    """Active US stocks in ``tm_instruments`` (no macro series, no retired listings)."""
    out: dict[str, Instrument] = {}
    for _path, data in query(store, "tm_instruments", filters=[("market", "==", "US")], limit=10000):
        if str(data.get("status") or "active").lower() != "active":
            continue
        if str(data.get("type") or "").lower() == "macro":
            continue
        ticker = str(data.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        aliases = tuple(str(a).strip() for a in (data.get("aliases") or []) if str(a).strip())
        out[ticker] = Instrument(
            ticker=ticker,
            name=str(data.get("name") or "").strip(),
            aliases=aliases,
            exchange=str(data.get("exchange") or "").strip(),
            sector=str(data.get("sector") or "").strip(),
        )
    return sorted(out.values(), key=lambda item: item.ticker)


# -- change-only writes -------------------------------------------------------


@dataclass
class WriteLedger:
    """Hashes of what a job last wrote, so a refresh skips unchanged documents.

    Volatile fields (``captured_at``) are left out of the hash. Losing the ledger
    file is harmless: the next run rewrites everything with the same ids.
    """

    name: str
    volatile: tuple[str, ...] = ("captured_at",)
    _hashes: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._path = CACHE_ROOT / "state" / f"{self.name}.json"
        if self._path.exists():
            try:
                self._hashes = json.loads(self._path.read_text())
            except json.JSONDecodeError:
                self._hashes = {}

    def _hash(self, data: dict[str, Any]) -> str:
        stable = {key: value for key, value in data.items() if key not in self.volatile}
        return hashlib.sha1(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def changed(self, docs: Iterable[tuple[str, dict[str, Any]]]) -> list[tuple[str, dict[str, Any]]]:
        return [(path, data) for path, data in docs if self._hashes.get(path) != self._hash(data)]

    def record(self, docs: Iterable[tuple[str, dict[str, Any]]]) -> None:
        for path, data in docs:
            self._hashes[path] = self._hash(data)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._hashes, separators=(",", ":")))


def write_changed(
    store: DocStore,
    ledger: WriteLedger,
    docs: list[tuple[str, dict[str, Any]]],
    *,
    merge: bool = False,
    chunk: int = 1000,
    around: Callable[[list[tuple[str, dict[str, Any]]]], None] | None = None,
) -> int:
    """Write only what differs from the last run. Returns how many were sent.

    ``around`` is called with each chunk just before it is written and again just after (the serving-doc stamps,
    backend/serve_docs.py), so it sees exactly what changed."""
    pending = ledger.changed(docs)
    for start in range(0, len(pending), chunk):
        part = pending[start : start + chunk]
        if around:
            around(part)
        try:
            store.set_many(part, merge=merge)
        finally:
            if around:
                around(part)
        ledger.record(part)
    return len(pending)
