"""Consistent logging for pipeline scripts and workers (CI, cron, manual runs).

Call ``configure_pipeline_logging()`` once near the start of ``main()`` in any
entrypoint so failures are timestamped and searchable in GitHub Actions / logs.

Env:
  TRACE_MONEY_LOG_LEVEL — DEBUG, INFO (default), WARNING, ERROR
"""
from __future__ import annotations

import logging
import os
import sys
import time
from typing import Final

_LOG_FORMAT: Final = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
_DATE_FMT: Final = "%Y-%m-%dT%H:%M:%SZ"


class _UtcFormatter(logging.Formatter):
    """Format ``record.created`` as UTC (matches serverless / CI timestamps)."""

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:  # noqa: N802
        return time.strftime(_DATE_FMT, time.gmtime(record.created))


def configure_pipeline_logging() -> None:
    """Attach a stderr handler with UTC timestamps; safe to call from multiple scripts."""
    level_name = (os.getenv("TRACE_MONEY_LOG_LEVEL") or "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(_UtcFormatter(_LOG_FORMAT, datefmt=_DATE_FMT))

    # Replace existing handlers so subprocess runs get predictable formatting.
    root.handlers.clear()
    root.addHandler(handler)
