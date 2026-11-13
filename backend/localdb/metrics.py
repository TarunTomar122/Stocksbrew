"""What the store is asked for: per-collection and per-endpoint read metrics.

Every request the HTTP server answers is recorded as one sample per
collection it touched: the endpoint, the collection (document ids replaced by
``*``, so ``users/<uid>/watchlist`` is ``users/*/watchlist`` and no user id is
ever kept), how many documents came back, how many response bytes they took
and how long the request ran. Samples live in memory for a rolling window
(``LOCALDB_METRICS_WINDOW_SECONDS``, default 15 minutes, at most
``MAX_SAMPLES``) and are summarised on demand: ``GET /metrics`` and a compact
log line every ``LOCALDB_METRICS_LOG_SECONDS`` (default 300; 0 turns it off).

The point is to see which collections a page view costs, not to bill: counts
are exact, percentiles are nearest-rank over the window.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from typing import Any, Callable, Iterable

DEFAULT_WINDOW_SECONDS = 900
MAX_SAMPLES = 50_000


def collection_label(path: str) -> str:
    """``tm_stock_intel_pro/AAPL/stocks/x`` -> ``tm_stock_intel_pro/*/stocks``; a collection path stays as it is."""

    parts = [part for part in str(path or "").split("/") if part]
    if not parts:
        return "?"
    # Even positions are collection ids, odd ones document ids (dropped, so no
    # user id or ticker ends up in the metrics).
    return "/*/".join(parts[0::2])


def _percentile(sorted_values: list[float], fraction: float) -> float:
    if not sorted_values:
        return 0.0
    rank = max(1, math.ceil(fraction * len(sorted_values)))
    return sorted_values[min(rank, len(sorted_values)) - 1]


def _bucket() -> dict[str, Any]:
    return {"count": 0, "docs": 0, "bytes": 0, "ms": []}


def _finish(bucket: dict[str, Any]) -> dict[str, Any]:
    latencies = sorted(bucket.pop("ms"))
    bucket["p50_ms"] = round(_percentile(latencies, 0.50), 1)
    bucket["p95_ms"] = round(_percentile(latencies, 0.95), 1)
    bucket["max_ms"] = round(latencies[-1], 1) if latencies else 0.0
    return bucket


class StoreMetrics:
    """Thread-safe rolling window of request samples."""

    def __init__(
        self,
        window_seconds: float = DEFAULT_WINDOW_SECONDS,
        max_samples: int = MAX_SAMPLES,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.window_seconds = float(window_seconds)
        self._clock = clock
        self._lock = threading.Lock()
        # (time, endpoint, collection, docs, bytes, ms)
        self._samples: deque[tuple[float, str, str, int, int, float]] = deque(maxlen=max_samples)
        self.started_at = clock()
        self.dropped = 0

    def record(self, endpoint: str, per_collection: dict[str, tuple[int, int]], ms: float) -> None:
        """One request: ``per_collection`` maps a collection label to (docs, bytes)."""

        now = self._clock()
        rows = per_collection or {"-": (0, 0)}
        with self._lock:
            for collection, (docs, size) in rows.items():
                if len(self._samples) == self._samples.maxlen:
                    self.dropped += 1
                self._samples.append((now, endpoint, collection, int(docs), int(size), float(ms)))
            self._prune(now)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_seconds
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

    def snapshot(self, window_seconds: float | None = None) -> dict[str, Any]:
        """Totals, per endpoint and per collection (with its endpoints), largest byte count first."""

        now = self._clock()
        window = min(self.window_seconds, float(window_seconds)) if window_seconds else self.window_seconds
        cutoff = now - window
        with self._lock:
            self._prune(now)
            samples = [sample for sample in self._samples if sample[0] >= cutoff]
        totals = _bucket()
        endpoints: dict[str, dict[str, Any]] = {}
        collections: dict[str, dict[str, Any]] = {}
        per_collection_endpoint: dict[str, dict[str, dict[str, Any]]] = {}
        for _, endpoint, collection, docs, size, ms in samples:
            for bucket in (
                totals,
                endpoints.setdefault(endpoint, _bucket()),
                collections.setdefault(collection, _bucket()),
                per_collection_endpoint.setdefault(collection, {}).setdefault(endpoint, _bucket()),
            ):
                bucket["count"] += 1
                bucket["docs"] += docs
                bucket["bytes"] += size
                bucket["ms"].append(ms)
        finished_collections = {}
        for name, bucket in sorted(collections.items(), key=lambda item: -item[1]["bytes"]):
            row = _finish(bucket)
            row["endpoints"] = {
                endpoint: _finish(inner)
                for endpoint, inner in sorted(per_collection_endpoint[name].items(), key=lambda item: -item[1]["bytes"])
            }
            finished_collections[name] = row
        return {
            "window_seconds": window,
            "uptime_seconds": round(now - self.started_at),
            "samples": len(samples),
            "dropped": self.dropped,
            "totals": _finish(totals),
            "endpoints": {
                name: _finish(bucket)
                for name, bucket in sorted(endpoints.items(), key=lambda item: -item[1]["bytes"])
            },
            "collections": finished_collections,
        }

    def summary_line(self, window_seconds: float | None = None, top: int = 8) -> str:
        """One compact log line: totals, then the top collections by bytes."""

        snap = self.snapshot(window_seconds)
        totals = snap["totals"]
        head = (
            f"localdb metrics window={int(snap['window_seconds'])}s reqs={totals['count']} docs={totals['docs']} "
            f"mb={totals['bytes'] / 1_000_000:.1f} p50={totals['p50_ms']}ms p95={totals['p95_ms']}ms"
        )
        parts = [
            f"{name} n={row['count']} docs={row['docs']} mb={row['bytes'] / 1_000_000:.2f} p95={row['p95_ms']}ms"
            for name, row in list(snap["collections"].items())[:top]
        ]
        return head + (" | " + "; ".join(parts) if parts else "")


def per_collection_sizes(documents: Iterable[dict[str, Any]], sizes: Iterable[int]) -> dict[str, tuple[int, int]]:
    """Fold (document, encoded size) pairs into {collection label: (docs, bytes)}."""

    out: dict[str, list[int]] = {}
    for document, size in zip(documents, sizes):
        label = collection_label(str(document.get("path", "")))
        row = out.setdefault(label, [0, 0])
        row[0] += 1
        row[1] += size
    return {label: (docs, size) for label, (docs, size) in out.items()}


def start_summary_logger(
    metrics: StoreMetrics,
    interval_seconds: float,
    emit: Callable[[str], None] = lambda line: print(line, flush=True),
) -> threading.Thread | None:
    """Log ``summary_line`` every ``interval_seconds`` over that same interval (a daemon thread)."""

    if interval_seconds <= 0:
        return None

    def loop() -> None:
        while True:
            time.sleep(interval_seconds)
            try:
                emit(metrics.summary_line(window_seconds=interval_seconds))
            except Exception as error:  # never let logging take the server down
                emit(f"localdb metrics summary failed: {error}")

    thread = threading.Thread(target=loop, name="localdb-metrics-log", daemon=True)
    thread.start()
    return thread
