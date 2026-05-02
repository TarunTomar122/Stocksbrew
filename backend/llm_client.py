"""Shared MiMo chat-completions helpers for backend LLM calls."""
from __future__ import annotations

import json
import os
from typing import Any

from backend.env import load_backend_env

load_backend_env()

MIMO_API_URL = os.getenv(
    "MIMO_API_URL",
    "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
)
DEFAULT_MIMO_MODEL = (
    os.getenv("MIMO_MODEL", "mimo-v2.5").strip()
    or "mimo-v2.5"
)


def llm_api_key() -> str:
    """Return the server-side MiMo API key."""
    return os.getenv("MIMO_API_KEY", "").strip()


def llm_model(default: str | None = None) -> str:
    """Return the MiMo model name used for cache keys and API calls."""
    return os.getenv("MIMO_MODEL", "").strip() or default or DEFAULT_MIMO_MODEL


def llm_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def json_response_format() -> dict[str, str]:
    # MiMo supports OpenAI-style JSON-object mode, not OpenAI json_schema mode.
    return {"type": "json_object"}


def schema_system_prompt(
    prompt: str,
    schema: dict[str, Any],
) -> str:
    """Append a schema contract to a system prompt for JSON-object mode."""
    return (
        f"{prompt}\n\n"
        "Return exactly one JSON object and no markdown. "
        "The JSON object must match this schema:\n"
        f"{json.dumps(schema, ensure_ascii=True)}"
    )


def parse_json_content(content: str) -> dict[str, Any]:
    """Parse model JSON, tolerating markdown fences or stray wrapper text."""
    raw = content.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(raw[start:end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("LLM response was not a JSON object")
    return parsed
