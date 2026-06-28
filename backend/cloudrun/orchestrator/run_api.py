from __future__ import annotations

import time
from typing import Any

import google.auth
from google.auth.transport.requests import Request
import requests


class RunJobsClient:
    def __init__(self, *, project: str, region: str) -> None:
        self.project = project
        self.region = region
        self.base = f"https://run.googleapis.com/v2/projects/{project}/locations/{region}"
        self.creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        self._http = Request()

    def _headers(self) -> dict[str, str]:
        self.creds.refresh(self._http)
        token = self.creds.token
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def run_job(self, *, job_name: str, args: list[str], wait_for_execution_name: bool = True) -> str:
        url = f"{self.base}/jobs/{job_name}:run"
        body = {
            "overrides": {
                "containerOverrides": [
                    {
                        "args": args,
                    }
                ]
            }
        }
        response = requests.post(url, headers=self._headers(), json=body, timeout=30)
        response.raise_for_status()
        payload = response.json()
        # jobs.run returns a long-running operation resource. Resolve it to
        # the actual execution resource before returning.
        op_name = str(payload.get("name") or "")
        if not op_name:
            raise ValueError("jobs.run returned empty operation name")
        if not wait_for_execution_name:
            return op_name
        return self._wait_operation_for_execution(op_name)

    def _get_operation(self, operation_name: str) -> dict[str, Any]:
        if operation_name.startswith("projects/"):
            url = f"https://run.googleapis.com/v2/{operation_name}"
        else:
            url = f"{self.base}/{operation_name}"
        response = requests.get(url, headers=self._headers(), timeout=30)
        response.raise_for_status()
        return response.json()

    def _wait_operation_for_execution(
        self,
        operation_name: str,
        *,
        timeout_s: int = 900,
        poll_s: int = 5,
    ) -> str:
        deadline = time.time() + timeout_s
        last: dict[str, Any] = {}
        while time.time() < deadline:
            last = self._get_operation(operation_name)
            if bool(last.get("done")):
                error = last.get("error")
                if error:
                    raise RuntimeError(f"jobs.run operation failed: {error}")
                response = last.get("response") or {}
                execution_name = str(response.get("name") or "")
                if not execution_name:
                    raise RuntimeError(f"jobs.run operation missing execution name: {operation_name}")
                return execution_name
            time.sleep(max(1, poll_s))
        raise TimeoutError(f"Timed out waiting for jobs.run operation: {operation_name}")

    def get_execution(self, execution_resource_name: str) -> dict[str, Any]:
        # execution_resource_name may be full resource or short "{job}/executions/{name}".
        if execution_resource_name.startswith("projects/"):
            url = f"https://run.googleapis.com/v2/{execution_resource_name}"
        else:
            url = f"{self.base}/{execution_resource_name}"
        response = requests.get(url, headers=self._headers(), timeout=30)
        response.raise_for_status()
        return response.json()

    def wait_execution(
        self,
        execution_resource_name: str,
        *,
        timeout_s: int = 900,
        poll_s: int = 5,
    ) -> dict[str, Any]:
        deadline = time.time() + timeout_s
        last: dict[str, Any] = {}
        while time.time() < deadline:
            last = self.get_execution(execution_resource_name)
            done = bool(last.get("completionTime"))
            if done:
                return last
            time.sleep(max(1, poll_s))
        raise TimeoutError(f"Timed out waiting for execution: {execution_resource_name}")
