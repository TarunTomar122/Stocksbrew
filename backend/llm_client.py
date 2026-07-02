"""Shared chat-completions helpers for backend LLM calls."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from backend.env import load_backend_env

load_backend_env()

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_ENRICHMENT_MODEL = "qwen/qwen-2.5-7b-instruct"
LLM_BRIEF_SOURCE = "llm"


def llm_provider() -> str:
    explicit = os.getenv("LLM_PROVIDER", "").strip().lower()
    if explicit in {"cerebras", "openai"}:
        return explicit
    has_cerebras = bool(os.getenv("CEREBRAS_API_KEY", "").strip())
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    return "cerebras" if has_cerebras and not has_openai else "openai"


def llm_enrichment_provider() -> str:
    explicit = os.getenv("LLM_ENRICHMENT_PROVIDER", "").strip().lower()
    if explicit:
        return explicit
    if os.getenv("OPENROUTER_API_KEY", "").strip():
        return "openrouter"
    return llm_provider()


def is_llm_brief_source(source: str | None) -> bool:
    normalized = str(source or "").strip().lower()
    return normalized in {LLM_BRIEF_SOURCE, "mimo"}


def llm_api_key() -> str:
    """Return server-side LLM API key for brief/synthesis calls."""
    explicit = os.getenv("LLM_API_KEY", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_API_KEY", "").strip()
    return os.getenv("OPENAI_API_KEY", "").strip()


def llm_enrichment_api_key() -> str:
    explicit = os.getenv("LLM_ENRICHMENT_API_KEY", "").strip()
    if explicit:
        return explicit
    if llm_enrichment_provider() == "openrouter":
        return os.getenv("OPENROUTER_API_KEY", "").strip()
    return llm_api_key()


def llm_api_url() -> str:
    explicit = os.getenv("LLM_API_URL", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_API_URL", "").strip() or CEREBRAS_API_URL
    return OPENAI_API_URL


def llm_enrichment_api_url() -> str:
    explicit = os.getenv("LLM_ENRICHMENT_API_URL", "").strip()
    if explicit:
        return explicit
    if llm_enrichment_provider() == "openrouter":
        return os.getenv("OPENROUTER_API_URL", "").strip() or OPENROUTER_API_URL
    return llm_api_url()


def llm_model(default: str | None = None) -> str:
    """Return model name used for brief/synthesis cache keys and API calls."""
    explicit = os.getenv("LLM_MODEL", "").strip()
    if explicit:
        return explicit
    if llm_provider() == "cerebras":
        return os.getenv("CEREBRAS_MODEL", "").strip() or default or CEREBRAS_DEFAULT_MODEL
    return os.getenv("OPENAI_MODEL", "").strip() or default or DEFAULT_OPENAI_MODEL


def llm_enrichment_model(default: str | None = None) -> str:
    explicit = os.getenv("LLM_ENRICHMENT_MODEL", "").strip()
    if explicit:
        return explicit
    if llm_enrichment_provider() == "openrouter":
        return default or DEFAULT_ENRICHMENT_MODEL
    return llm_model(default)


def require_llm_api_key() -> str:
    api_key = llm_api_key()
    if not api_key:
        raise ValueError("LLM_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY is required")
    return api_key


def require_llm_enrichment_api_key() -> str:
    api_key = llm_enrichment_api_key()
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY or LLM_ENRICHMENT_API_KEY is required for article enrichment")
    return api_key


def llm_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def llm_enrichment_headers(api_key: str) -> dict[str, str]:
    headers = llm_headers(api_key)
    if llm_enrichment_provider() == "openrouter":
        headers["HTTP-Referer"] = os.getenv("OPENROUTER_HTTP_REFERER", "https://tikrr.app").strip() or "https://tikrr.app"
        headers["X-Title"] = os.getenv("OPENROUTER_APP_NAME", "tikrr-article-enrichment").strip() or "tikrr-article-enrichment"
    return headers


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


def log_llm_call(
    *,
    stage: str,
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    cache_hit: bool,
    cost_usd: float | None = None,
    extra: str = "",
) -> None:
    logger.info(
        "llm_call stage=%s provider=%s model=%s input_tokens=%s output_tokens=%s cache_hit=%s cost_usd=%s%s",
        stage,
        provider,
        model,
        input_tokens if input_tokens is not None else "",
        output_tokens if output_tokens is not None else "",
        cache_hit,
        cost_usd if cost_usd is not None else "",
        f" {extra}" if extra else "",
    )
