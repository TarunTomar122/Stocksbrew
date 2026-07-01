"""Shared chat-completions helpers for backend LLM calls."""
from __future__ import annotations

import json
import os
from typing import Any

from backend.env import load_backend_env

load_backend_env()

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b"
LLM_BRIEF_SOURCE = "llm"


def llm_provider() -> str:
    explicit = os.getenv("LLM_PROVIDER", "").strip().lower()
    if explicit in {"cerebras", "openai"}:
        return explicit
    has_cerebras = bool(os.getenv("CEREBRAS_API_KEY", "").strip())
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    return "cerebras" if has_cerebras and not has_openai else "openai"


def is_llm_brief_source(source: str | None) -> bool:
    normalized = str(source or "").strip().lower()
    return normalized in {LLM_BRIEF_SOURCE, "mimo"}


def llm_api_key() -> str:
    """Return server-side LLM API key for the configured provider."""
    explicit = os.getenv("LLM_API_KEY", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_API_KEY", "").strip()
    return os.getenv("OPENAI_API_KEY", "").strip()


def llm_api_url() -> str:
    explicit = os.getenv("LLM_API_URL", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_API_URL", "").strip() or CEREBRAS_API_URL
    return OPENAI_API_URL


def llm_model(default: str | None = None) -> str:
    """Return model name used for cache keys and API calls."""
    explicit = os.getenv("LLM_MODEL", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_MODEL", "").strip() or default or CEREBRAS_DEFAULT_MODEL
    return os.getenv("OPENAI_MODEL", "").strip() or default or DEFAULT_OPENAI_MODEL


def require_llm_api_key() -> str:
    api_key = llm_api_key()
    if not api_key:
        raise ValueError("LLM_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY is required")
    return api_key


def llm_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def json_response_format() -> dict[str, str]:
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
    raw = (content or "").strip()
    if not raw:
        raise ValueError("LLM returned empty JSON content")
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    if not raw:
        raise ValueError("LLM returned empty JSON content")

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
