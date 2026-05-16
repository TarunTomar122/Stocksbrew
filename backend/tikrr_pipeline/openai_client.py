from __future__ import annotations

import os
from typing import Any

import requests

from backend.env import load_backend_env
from backend.llm_client import (
    llm_api_url,
    json_response_format,
    llm_api_key,
    llm_headers,
    llm_model,
    parse_json_content,
    schema_system_prompt,
)

load_backend_env()

DEFAULT_MODEL = os.getenv("TIKRR_PIPELINE_MODEL") or llm_model()


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
        self.api_key = api_key or llm_api_key()
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY or MIMO_API_KEY is required")
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
            llm_api_url(),
            headers=llm_headers(self.api_key),
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": schema_system_prompt(system_prompt, schema)},
                    {"role": "user", "content": user_prompt},
                ],
                "response_format": json_response_format(),
                "temperature": 0.2,
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        return parse_json_content(content)
