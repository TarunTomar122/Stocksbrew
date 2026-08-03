"""Shared chat-completions helpers for backend LLM calls."""
from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from typing import Any

import requests

from backend.env import load_backend_env

load_backend_env()

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"
DEFAULT_ENRICHMENT_MODEL = DEFAULT_OPENAI_MODEL
LLM_BRIEF_SOURCE = "llm"

RETRYABLE_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}


class LLMWallTimeout(TimeoutError):
    """Raised when a provider keeps a response open beyond the caller deadline."""


class _wall_timeout:
    def __init__(self, seconds: int):
        self.seconds = max(1, int(seconds))
        self.enabled = threading.current_thread() is threading.main_thread() and hasattr(signal, "setitimer")
        self.previous_handler: Any = None

    def __enter__(self) -> None:
        if not self.enabled:
            return
        self.previous_handler = signal.getsignal(signal.SIGALRM)

        def handle_timeout(_signum: int, _frame: Any) -> None:
            raise LLMWallTimeout(f"LLM request exceeded {self.seconds}s wall timeout")

        signal.signal(signal.SIGALRM, handle_timeout)
        signal.setitimer(signal.ITIMER_REAL, self.seconds)

    def __exit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        if not self.enabled:
            return
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, self.previous_handler)


def post_chat_completion(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    temperature: float = 0.2,
    reasoning_effort: str | None = None,
    response_format: dict[str, Any] | None = None,
    timeout: int = 45,
    stage: str = "chat",
    max_attempts: int = 6,
    provider: str | None = None,
) -> dict[str, Any]:
    """POST to direct OpenAI with retry handling for transient failures."""
    resolved_provider = _resolve_llm_provider(provider)
    api_key = require_llm_api_key(resolved_provider)
    url = llm_api_url(resolved_provider)
    resolved_model = _direct_openai_model(model or llm_model())
    payload: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
    }
    # Current GPT-5 models accept only their default temperature on the direct
    # OpenAI API. OpenRouter may quietly tolerate a custom value, so omit it
    # consistently when these models are routed directly.
    if not _uses_default_temperature(resolved_model):
        payload["temperature"] = temperature
    resolved_reasoning_effort = reasoning_effort or llm_reasoning_effort()
    if not resolved_reasoning_effort and "luna" in resolved_model.lower():
        resolved_reasoning_effort = "low"
    if resolved_reasoning_effort:
        payload["reasoning_effort"] = resolved_reasoning_effort
    if response_format is not None:
        payload["response_format"] = response_format

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with _wall_timeout(timeout):
                response = requests.post(
                    url,
                    headers=llm_headers(api_key, provider=resolved_provider),
                    json=payload,
                    timeout=timeout,
                )
            if response.status_code in RETRYABLE_STATUS_CODES:
                retry_after = response.headers.get("Retry-After")
                sleep_s = float(retry_after) if retry_after else min(2 ** attempt, 30)
                logger.warning(
                    "LLM HTTP retry stage=%s attempt=%s/%s status=%s sleep_s=%.1f model=%s",
                    stage,
                    attempt,
                    max_attempts,
                    response.status_code,
                    sleep_s,
                    resolved_model,
                )
                time.sleep(sleep_s)
                continue
            if response.status_code >= 400:
                logger.error(
                    "LLM HTTP error stage=%s status=%s model=%s body=%s",
                    stage,
                    response.status_code,
                    resolved_model,
                    str(response.text)[:1200],
                )
            response.raise_for_status()
            body = response.json()
            usage = body.get("usage") if isinstance(body, dict) else {}
            if isinstance(usage, dict):
                total_tokens = usage.get("total_tokens")
                if total_tokens is None:
                    prompt = usage.get("prompt_tokens") or 0
                    completion = usage.get("completion_tokens") or 0
                    total_tokens = int(prompt) + int(completion)
                log_llm_call(
                    stage=stage,
                    provider=resolved_provider,
                    model=resolved_model,
                    input_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    cache_hit=False,
                )
            return body
        except requests.RequestException as error:
            last_error = error
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status is not None and status not in RETRYABLE_STATUS_CODES:
                raise
            if attempt >= max_attempts:
                raise
            sleep_s = min(2 ** attempt, 30)
            logger.warning(
                "LLM request retry stage=%s attempt=%s/%s err=%s sleep_s=%.1f",
                stage,
                attempt,
                max_attempts,
                error,
                sleep_s,
            )
            time.sleep(sleep_s)
    if last_error is not None:
        raise last_error
    raise RuntimeError("LLM request failed without an error")


def _uses_default_temperature(model: str) -> bool:
    return model.strip().lower().split("/")[-1].startswith("gpt-5")


def _direct_openai_model(model: str) -> str:
    """Normalize stale router model names before calling OpenAI directly."""
    normalized = model.strip()
    if normalized.lower().startswith("openai/"):
        return normalized.split("/", 1)[1]
    if "/" in normalized or normalized.lower().startswith("gpt-oss"):
        logger.warning("Ignoring legacy third-party model %s; using %s", normalized, DEFAULT_OPENAI_MODEL)
        return DEFAULT_OPENAI_MODEL
    return normalized or DEFAULT_OPENAI_MODEL


def llm_reasoning_effort() -> str | None:
    raw = os.getenv("LLM_REASONING_EFFORT", "").strip().lower()
    if not raw:
        return None
    valid = {"none", "minimal", "low", "medium", "high", "xhigh"}
    if raw not in valid:
        raise ValueError(
            f"Unsupported LLM_REASONING_EFFORT={raw!r}; expected one of {sorted(valid)}"
        )
    return raw


def _resolve_llm_provider(provider: str | None = None) -> str:
    explicit = (provider or os.getenv("LLM_PROVIDER", "")).strip().lower()
    if explicit and explicit != "openai":
        logger.warning("Ignoring legacy LLM provider %s; using direct OpenAI", explicit)
    return "openai"


def llm_provider() -> str:
    return _resolve_llm_provider()


def llm_enrichment_provider() -> str:
    explicit = os.getenv("LLM_ENRICHMENT_PROVIDER", "").strip().lower()
    if explicit and explicit != "openai":
        logger.warning("Ignoring legacy enrichment provider %s; using direct OpenAI", explicit)
    return "openai"


def is_llm_brief_source(source: str | None) -> bool:
    normalized = str(source or "").strip().lower()
    return normalized in {LLM_BRIEF_SOURCE, "mimo"}


def llm_api_key(provider: str | None = None) -> str:
    """Return server-side LLM API key for brief/synthesis calls."""
    _resolve_llm_provider(provider)
    return os.getenv("OPENAI_API_KEY", "").strip()


def llm_enrichment_api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def llm_api_url(provider: str | None = None) -> str:
    _resolve_llm_provider(provider)
    return OPENAI_API_URL


def llm_enrichment_api_url() -> str:
    return OPENAI_API_URL


def llm_model(default: str | None = None) -> str:
    """Return model name used for brief/synthesis cache keys and API calls."""
    explicit = os.getenv("LLM_MODEL", "").strip()
    if explicit:
        return _direct_openai_model(explicit)
    return _direct_openai_model(os.getenv("OPENAI_MODEL", "").strip() or default or DEFAULT_OPENAI_MODEL)


def llm_enrichment_model(default: str | None = None) -> str:
    explicit = os.getenv("LLM_ENRICHMENT_MODEL", "").strip()
    if explicit:
        return _direct_openai_model(explicit)
    return _direct_openai_model(default or DEFAULT_ENRICHMENT_MODEL)


def require_llm_api_key(provider: str | None = None) -> str:
    api_key = llm_api_key(provider)
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required")
    return api_key


def require_llm_enrichment_api_key() -> str:
    api_key = llm_enrichment_api_key()
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for article enrichment")
    return api_key


def llm_headers(api_key: str, *, provider: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    _resolve_llm_provider(provider)
    return headers


def llm_enrichment_headers(api_key: str) -> dict[str, str]:
    return llm_headers(api_key, provider="openai")


def json_response_format() -> dict[str, str]:
    return {"type": "json_object"}


def schema_system_prompt(
    prompt: str,
    schema: dict[str, Any],
) -> str:
    """Append the output-object schema to a prompt used with JSON-object mode.

    Callers commonly pass an OpenAI-style response-format envelope containing
    ``name``, ``strict``, and ``schema``.  That envelope is not itself the
    output schema; showing it as one can make a model return the envelope
    verbatim instead of an instance of the requested object.
    """
    output_schema = schema
    if "type" not in schema and isinstance(schema.get("schema"), dict):
        output_schema = schema["schema"]
    return (
        f"{prompt}\n\n"
        "Return exactly one JSON object and no markdown. "
        "Return an instance containing the requested data; never return or repeat the schema definition. "
        "The JSON object must match this output schema:\n"
        f"{json.dumps(output_schema, ensure_ascii=True)}"
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
