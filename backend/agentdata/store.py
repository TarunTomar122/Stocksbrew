"""One small write path for the agent data jobs.

``DocStore.from_env()`` picks the backend:

* ``LOCALDB_PATH`` set: write straight to the SQLite document store (the VPS).
* otherwise ``LOCALDB_URL`` + ``LOCALDB_API_TOKEN``: talk to the LocalDB HTTP
  service. A laptop gets both from the ignored ``.env.vps.local`` file.

The token is never logged. Writes are additive: ``set_many`` replaces or merges
whole documents by path and there is deliberately no delete helper here.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

_ROOT = Path(__file__).resolve().parents[2]
_MAX_BATCH_DOCS = 200
_MAX_BATCH_BYTES = 6 * 1024 * 1024
# Straight to SQLite, one batch is one write transaction, and the web app's writes wait
# behind it (busy timeout 30s). Keep it to a few seconds of work: about 30 price histories.
_MAX_SQLITE_BATCH_BYTES = 2 * 1024 * 1024

# Collections the agent jobs may write. Anything else is refused so a typo can
# never land in user data or in a collection another pipeline owns.
WRITABLE_PREFIXES = (
    "tm_agent_",
    "tm_follow_",
    "tm_fund_",
    "tm_insider_",
    # Earnings calendar gap fill (earnings_calendar.py); it only touches events
    # dated 2026-08-14 or later.
    "tm_earnings_events",
    # Earnings day reports (earnings_day.py): one per stock per report.
    "tm_earnings_day",
    # Past report days from SEC 8-K item 2.02 filings (earnings_history.py): one per stock.
    "tm_earnings_history",
    "tm_strategy_",
    "tm_strategies",
    "tm_backtest_",
    "tm_price_history_daily",
    "tm_market_assets",
    "tm_markets_",
    "tm_prediction_",
    "tm_briefing_",
    "tm_practice_",
    "tm_idea_",
    # Screening snapshot (screener.py): one flat row per covered stock.
    "tm_screener_",
    # Point-in-time SEC fundamentals (sec_fundamentals.py) and the call engine's
    # own state and daily log (call_scores.py).
    "tm_fundamentals_pit",
    "tm_call_engine_",
    # Copy-trade backtests (copy_trades.py): one record per fund or House member, plus the hub.
    "tm_copy_trades",
    # Past dividend payments per stock (dividend_history.py), for the dividend planner.
    "tm_dividend_history",
    # ETF holdings from SEC N-PORT (etf_holdings.py): one per fund, its CUSIP map and a run summary.
    "tm_etf_",
    # Company logo tiles served by app/api/logo (stock_logos.py), plus a run summary.
    "tm_stock_logos",
    # What changed in each company's risk factors (scripts/run-filing-changes.ts writes it from TypeScript).
    "tm_filing_changes",
    # First-party analytics (lib/analytics/db.ts writes it from the web app): event chunks, daily rollups, the day's salt.
    "tm_analytics_",
    # After-hours and pre-market quotes (extended_hours.py): one per stock, the newest session's print.
    "tm_extended_quotes",
    # The stock page's serving docs (scripts/run-serve-docs.ts builds them; writers stamp parts stale, backend/serve_docs.py).
    "tm_serve_",
    # The nightly data-quality counts (data_quality.py) for the admin System tab.
    "tm_data_quality",
)


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _check_writable(path: str) -> None:
    collection = path.split("/", 1)[0]
    if not any(collection.startswith(prefix) for prefix in WRITABLE_PREFIXES):
        raise ValueError(f"refusing to write outside the agent collections: {collection}")


class DocStore:
    """Read and additive-write access to the document store."""

    def __init__(self, *, url: str = "", token: str = "", db_path: str = "") -> None:
        self._url = url.rstrip("/")
        self._token = token
        self._db = None
        if db_path:
            from backend.localdb.firestore import LocalFirestoreClient

            self._db = LocalFirestoreClient(db_path)
        elif not (self._url and self._token):
            raise ValueError("Set LOCALDB_PATH, or LOCALDB_URL and LOCALDB_API_TOKEN")

    @classmethod
    def from_env(cls) -> "DocStore":
        db_path = os.getenv("LOCALDB_PATH", "").strip()
        if db_path:
            return cls(db_path=db_path)
        _load_env_file(_ROOT / ".env.vps.local")
        return cls(
            url=os.getenv("LOCALDB_URL", "").strip(),
            token=os.getenv("LOCALDB_API_TOKEN", "").strip(),
        )

    @property
    def mode(self) -> str:
        return "sqlite" if self._db is not None else "http"

    # -- http plumbing -----------------------------------------------------

    def _request(self, method: str, path: str, body: Any | None = None) -> Any:
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        last_error: Exception | None = None
        for attempt in range(4):
            request = urllib.request.Request(
                f"{self._url}{path}",
                data=data,
                method=method,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Content-Type": "application/json",
                    "User-Agent": "stocksbrew-agentdata/1.0",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    return json.loads(response.read().decode("utf-8") or "{}")
            except urllib.error.HTTPError as error:
                if error.code == 404 and method == "GET":
                    return None
                if error.code < 500:
                    detail = error.read().decode("utf-8", "replace")[:300]
                    raise RuntimeError(f"LocalDB {method} {path.split('?')[0]} failed ({error.code}): {detail}") from None
                last_error = error
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = error
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"LocalDB {method} {path.split('?')[0]} failed after retries: {last_error}")

    # -- reads -------------------------------------------------------------

    def get(self, path: str) -> dict[str, Any] | None:
        if self._db is not None:
            snapshot = self._db.document(path).get()
            return snapshot.to_dict() if snapshot.exists else None
        payload = self._request("GET", f"/documents/{urllib.parse.quote(path, safe='')}")
        if not payload:
            return None
        document = payload.get("document", payload)
        return document.get("data") if isinstance(document, dict) else None

    def get_many(self, paths: list[str]) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        if self._db is not None:
            # One query per chunk instead of one connection per document.
            for start in range(0, len(paths), 400):
                chunk = paths[start : start + 400]
                snapshots = self._db.get_all([self._db.document(path) for path in chunk])
                for path, snapshot in zip(chunk, snapshots):
                    if snapshot.exists:
                        out[path] = snapshot.to_dict() or {}
            return out
        for start in range(0, len(paths), 400):
            chunk = paths[start : start + 400]
            payload = self._request("POST", "/documents:batchGet", {"paths": chunk}) or {}
            for document in payload.get("documents", []):
                if isinstance(document, dict) and isinstance(document.get("data"), dict):
                    out[document["path"]] = document["data"]
        return out

    def list(self, collection: str, limit: int = 1000) -> list[tuple[str, dict[str, Any]]]:
        """Documents directly inside a top-level collection, as (path, data)."""
        if self._db is not None:
            return [
                (f"{collection}/{snapshot.id}", snapshot.to_dict() or {})
                for snapshot in self._db.collection(collection).limit(limit).stream()
            ]
        query = urllib.parse.urlencode({"collection": collection, "limit": limit})
        payload = self._request("GET", f"/documents?{query}") or {}
        return [
            (document["path"], document.get("data") or {})
            for document in payload.get("documents", [])
            if isinstance(document, dict) and "path" in document
        ]

    # -- writes ------------------------------------------------------------

    def set_many(self, docs: Iterable[tuple[str, dict[str, Any]]], *, merge: bool = False) -> int:
        """Write documents by path. Returns how many were written."""
        written = 0
        batch: list[dict[str, Any]] = []
        batch_bytes = 0

        def flush() -> None:
            nonlocal batch, batch_bytes, written
            if not batch:
                return
            if self._db is not None:
                # One transaction for the batch: one connection, one lock, a warm page cache.
                writes = self._db.batch()
                for operation in batch:
                    writes.set(self._db.document(operation["path"]), operation["data"], merge=merge)
                writes.commit()
            else:
                self._request("POST", "/documents:batchWrite", {"operations": batch})
            written += len(batch)
            batch = []
            batch_bytes = 0

        max_bytes = _MAX_SQLITE_BATCH_BYTES if self._db is not None else _MAX_BATCH_BYTES
        for path, data in docs:
            _check_writable(path)
            if not isinstance(data, dict):
                raise ValueError(f"document data must be an object: {path}")
            size = len(json.dumps(data, separators=(",", ":")))
            if batch and (len(batch) >= _MAX_BATCH_DOCS or batch_bytes + size > max_bytes):
                flush()
            batch.append({"op": "set", "path": path, "data": data, "merge": merge})
            batch_bytes += size
        flush()
        return written

    def set(self, path: str, data: dict[str, Any], *, merge: bool = False) -> None:
        self.set_many([(path, data)], merge=merge)
