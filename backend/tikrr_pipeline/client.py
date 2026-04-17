from __future__ import annotations

import os
from typing import Any

import requests

from backend.env import load_backend_env

load_backend_env()


DEFAULT_TIKRR_API_BASE = os.getenv("TIKRR_API_BASE_URL", "https://www.tikrr.online/api/tikrr").rstrip("/")
DEFAULT_TIKRR_API_KEY = os.getenv("TIKRR_API_KEY") or os.getenv("TIKRR_SECRET_KEY") or "openclaw"


class TikrrAPIClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: int = 30) -> None:
        self.base_url = (base_url or DEFAULT_TIKRR_API_BASE).rstrip("/")
        self.api_key = api_key or DEFAULT_TIKRR_API_KEY
        self.timeout = timeout

    def push_stock(self, market: str, symbol: str, data: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self.base_url}/stock",
            json={
                "apiKey": self.api_key,
                "market": market.upper(),
                "symbol": symbol.upper(),
                "data": data,
            },
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def push_market(self, market: str, data: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self.base_url}/market",
            json={
                "apiKey": self.api_key,
                "market": market.upper(),
                "data": data,
            },
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def push_sector(self, sector_id: str, data: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{self.base_url}/sector",
            json={
                "apiKey": self.api_key,
                "sectorId": sector_id,
                "data": data,
            },
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def push_run_status(
        self,
        *,
        market: str,
        run_type: str,
        status: str,
        started_at: str,
        completed_at: str | None,
        stocks_updated: int,
        sectors_updated: int,
        markets_updated: int = 1,
        errors: list[str] | None = None,
    ) -> dict[str, Any]:
        response = requests.post(
            f"{self.base_url}/run-status",
            json={
                "apiKey": self.api_key,
                "market": market.upper(),
                "status": status,
                "runType": run_type,
                "startedAt": started_at,
                "completedAt": completed_at,
                "stocksUpdated": stocks_updated,
                "sectorsUpdated": sectors_updated,
                "marketsUpdated": markets_updated,
                "errors": errors or [],
            },
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()
