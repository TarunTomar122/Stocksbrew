from __future__ import annotations

import json
import os
from typing import Any

import requests

from backend.env import load_backend_env

load_backend_env()

OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
DEFAULT_MODEL = os.getenv("TIKRR_PIPELINE_MODEL") or os.getenv("TRACE_MONEY_LLM_MODEL") or "gpt-4o-mini"


TIKRR_STOCK_JSON_SCHEMA: dict[str, Any] = {
    "name": "tikrr_stock_payload",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "lastUpdated": {"type": "string"},
            "runType": {"type": "string", "enum": ["pre_market", "market_open", "midday", "market_close"]},
            "price": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "current": {"type": ["number", "null"]},
                    "open": {"type": ["number", "null"]},
                    "high": {"type": ["number", "null"]},
                    "low": {"type": ["number", "null"]},
                    "previousClose": {"type": ["number", "null"]},
                    "change": {"type": ["number", "null"]},
                    "changePct": {"type": ["number", "null"]},
                    "volume": {"type": ["number", "null"]},
                    "avgVolume": {"type": ["number", "null"]},
                },
                "required": ["current", "open", "high", "low", "previousClose", "change", "changePct", "volume", "avgVolume"],
            },
            "sentiment": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall": {"type": ["number", "null"]},
                    "drivers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["overall", "drivers"],
            },
            "news": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "timestamp": {"type": ["string", "null"]},
                        "title": {"type": "string"},
                        "source": {"type": "string"},
                        "summary": {"type": "string"},
                        "sentiment": {"type": ["number", "null"]},
                        "category": {"type": "string"},
                    },
                    "required": ["timestamp", "title", "source", "summary", "sentiment", "category"],
                },
            },
            "highlights": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "positive": {"type": "array", "items": {"type": "string"}},
                    "negative": {"type": "array", "items": {"type": "string"}},
                    "neutral": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["positive", "negative", "neutral"],
            },
            "technicals": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "rsi14": {"type": ["number", "null"]},
                    "sma50": {"type": ["number", "null"]},
                    "sma200": {"type": ["number", "null"]},
                    "fiftyTwoWeekHigh": {"type": ["number", "null"]},
                    "fiftyTwoWeekLow": {"type": ["number", "null"]},
                    "fromHigh": {"type": ["string", "null"]},
                    "trend": {"type": "string"},
                },
                "required": ["rsi14", "sma50", "sma200", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "fromHigh", "trend"],
            },
            "analystConsensus": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "rating": {"type": "string"},
                    "targetPrice": {"type": ["number", "null"]},
                    "upside": {"type": ["number", "null"]},
                    "numAnalysts": {"type": ["number", "null"]},
                },
                "required": ["rating", "targetPrice", "upside", "numAnalysts"],
            },
            "catalysts": {"type": "array", "items": {"type": "string"}},
            "bottomLine": {"type": "string"},
        },
        "required": [
            "lastUpdated",
            "runType",
            "price",
            "sentiment",
            "news",
            "highlights",
            "technicals",
            "analystConsensus",
            "catalysts",
            "bottomLine",
        ],
    },
    "strict": True,
}

TIKRR_MARKET_JSON_SCHEMA: dict[str, Any] = {
    "name": "tikrr_market_payload",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "sentiment": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall": {"type": "number"},
                    "label": {"type": "string"},
                    "drivers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["overall", "label", "drivers"],
            },
            "keyHeadlines": {"type": "array", "items": {"type": "string"}},
            "bottomLine": {"type": "string"},
        },
        "required": ["sentiment", "keyHeadlines", "bottomLine"],
    },
    "strict": True,
}

TIKRR_SECTOR_JSON_SCHEMA: dict[str, Any] = {
    "name": "tikrr_sector_payload",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "sentiment": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall": {"type": "number"},
                    "label": {"type": "string"},
                    "drivers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["overall", "label", "drivers"],
            },
            "drivers": {"type": "array", "items": {"type": "string"}},
            "bottomLine": {"type": "string"},
        },
        "required": ["sentiment", "drivers", "bottomLine"],
    },
    "strict": True,
}


class OpenAIJSONClient:
    def __init__(self, api_key: str | None = None, model: str | None = None, timeout: int = 60) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is required")
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout

    def generate_stock_payload(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        return self._generate(system_prompt, user_prompt, TIKRR_STOCK_JSON_SCHEMA)

    def generate_market_payload(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        return self._generate(system_prompt, user_prompt, TIKRR_MARKET_JSON_SCHEMA)

    def generate_sector_payload(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        return self._generate(system_prompt, user_prompt, TIKRR_SECTOR_JSON_SCHEMA)

    def _generate(self, system_prompt: str, user_prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        response = requests.post(
            f"{OPENAI_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": schema,
                },
                "temperature": 0.2,
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        return json.loads(content)
