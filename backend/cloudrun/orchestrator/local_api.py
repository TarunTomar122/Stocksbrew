from __future__ import annotations

import subprocess
import sys
import threading
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class LocalJobsClient:
    def __init__(self) -> None:
        self._results: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def run_job(self, *, job_name: str, args: list[str], wait_for_execution_name: bool = True) -> str:
        execution = f"local/{job_name}/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
        proc = subprocess.run([sys.executable, *args], check=False)
        result = {
            "name": execution,
            "succeededCount": 1 if proc.returncode == 0 else 0,
            "failedCount": 0 if proc.returncode == 0 else 1,
            "cancelledCount": 0,
            "returnCode": proc.returncode,
        }
        with self._lock:
            self._results[execution] = result
        return execution

    def wait_execution(self, execution_resource_name: str) -> dict[str, Any]:
        with self._lock:
            result = self._results.get(execution_resource_name)
        if result is None:
            raise KeyError(f"Unknown local execution: {execution_resource_name}")
        return result
