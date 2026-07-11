"""Shared chat-completions helpers for backend LLM calls."""
from __future__ import annotations

import fcntl
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import requests

from backend.env import load_backend_env

load_backend_env()

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "deepseek/deepseek-v4-flash"
CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_ENRICHMENT_MODEL = "qwen/qwen-2.5-7b-instruct"
DEFAULT_OPENROUTER_MODEL = DEFAULT_ENRICHMENT_MODEL
LLM_BRIEF_SOURCE = "llm"

RETRYABLE_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}


def _cerebras_throttle_state_path() -> Path:
    raw = os.getenv("CEREBRAS_THROTTLE_STATE_PATH", "").strip()
    if raw:
        return Path(raw)
    return Path("/tmp/tikrr_cerebras_throttle.json")


def _read_cerebras_throttle_state() -> tuple[list[float], list[list[float | int]]]:
    path = _cerebras_throttle_state_path()
    if not path.exists():
        return [], []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return [], []
    if not isinstance(payload, dict):
        return [], []
    req_times = payload.get("request_times")
    token_times = payload.get("token_times")
    if not isinstance(req_times, list) or not isinstance(token_times, list):
        return [], []
    clean_req = [float(value) for value in req_times if isinstance(value, (int, float))]
    clean_tokens: list[list[float | int]] = []
    for row in token_times:
        if (
            isinstance(row, list)
            and len(row) == 2
            and isinstance(row[0], (int, float))
            and isinstance(row[1], int)
        ):
            clean_tokens.append([float(row[0]), int(row[1])])
    return clean_req, clean_tokens


def _write_cerebras_throttle_state(
    request_times: list[float],
    token_times: list[tuple[float, int]],
) -> None:
    path = _cerebras_throttle_state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "request_times": request_times[-2000:],
        "token_times": [[ts, tokens] for ts, tokens in token_times[-2000:]],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def _prune_cerebras_state(
    request_times: list[float],
    token_times: list[tuple[float, int]],
    now: float,
) -> tuple[list[float], list[tuple[float, int]]]:
    req = [ts for ts in request_times if now - ts <= 60.0]
    tok = [(ts, tokens) for ts, tokens in token_times if now - ts <= 60.0]
    return req, tok


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def cerebras_rpm_limit() -> int:
    """Stay under Cerebras production RPM (default 800 of 1000)."""
    return _env_int("CEREBRAS_RPM_LIMIT", 800)


def cerebras_tpm_limit() -> int:
    """Stay under Cerebras production TPM (default 800k of 1M)."""
    return _env_int("CEREBRAS_TPM_LIMIT", 800_000)


def cerebras_min_interval_s() -> float:
    rpm = cerebras_rpm_limit()
    # Cerebras spreads RPM evenly (60 RPM → 1 req/sec). Match that spacing.
    return max(0.05, 60.0 / float(rpm))


def cerebras_rps_limit() -> int:
    """Max requests in any 1-second window (Cerebras short-interval enforcement)."""
    return max(1, (cerebras_rpm_limit() + 59) // 60)


def _estimate_tokens(payload: dict[str, Any]) -> int:
    try:
        return max(1, len(json.dumps(payload, ensure_ascii=True)) // 4)
    except Exception:
        return 1


def _throttle_cerebras(estimated_tokens: int) -> None:
    if llm_provider() != "cerebras":
        return
    rpm = cerebras_rpm_limit()
    tpm = cerebras_tpm_limit()
    rps = cerebras_rps_limit()
    min_interval = cerebras_min_interval_s()
    state_path = _cerebras_throttle_state_path()
    state_path.parent.mkdir(parents=True, exist_ok=True)

    while True:
        now = time.monotonic()
        with open(state_path, "a+", encoding="utf-8") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                req_times, token_rows = _read_cerebras_throttle_state()
                token_times = [(float(ts), int(tokens)) for ts, tokens in token_rows]
                req_times, token_times = _prune_cerebras_state(req_times, token_times, now)

                req_count = len(req_times)
                sec_count = len([ts for ts in req_times if now - ts <= 1.0])
                token_count = sum(tokens for _, tokens in token_times)
                last_at = req_times[-1] if req_times else 0.0
                interval_ok = (now - last_at) >= min_interval
                rpm_ok = req_count < rpm
                rps_ok = sec_count < rps
                tpm_ok = (token_count + estimated_tokens) <= tpm

                if interval_ok and rpm_ok and rps_ok and tpm_ok:
                    req_times.append(now)
                    token_times.append((now, estimated_tokens))
                    _write_cerebras_throttle_state(req_times, token_times)
                    return

                sleep_s = min_interval
                if not interval_ok:
                    sleep_s = max(sleep_s, min_interval - (now - last_at))
                if not rpm_ok and req_times:
                    sleep_s = max(sleep_s, 60.0 - (now - req_times[0]) + 0.05)
                if not rps_ok and req_times:
                    recent = [ts for ts in req_times if now - ts <= 1.0]
                    if recent:
                        sleep_s = max(sleep_s, 1.0 - (now - recent[0]) + 0.05)
                if not tpm_ok and token_times:
                    sleep_s = max(sleep_s, 60.0 - (now - token_times[0][0]) + 0.05)
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        time.sleep(min(max(sleep_s, 0.05), 5.0))


def _record_cerebras_usage(actual_tokens: int) -> None:
    if llm_provider() != "cerebras" or actual_tokens <= 0:
        return
    now = time.monotonic()
    state_path = _cerebras_throttle_state_path()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with open(state_path, "a+", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            req_times, token_rows = _read_cerebras_throttle_state()
            token_times = [(float(ts), int(tokens)) for ts, tokens in token_rows]
            req_times, token_times = _prune_cerebras_state(req_times, token_times, now)
            if token_times:
                ts, est = token_times[-1]
                if now - ts < 1.0:
                    token_times[-1] = (ts, max(est, actual_tokens))
                else:
                    token_times.append((now, actual_tokens))
            else:
                token_times.append((now, actual_tokens))
            _write_cerebras_throttle_state(req_times, token_times)
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def post_chat_completion(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    temperature: float = 0.2,
    response_format: dict[str, str] | None = None,
    timeout: int = 45,
    stage: str = "chat",
    max_attempts: int = 6,
) -> dict[str, Any]:
    """POST to the configured brief/synthesis LLM with Cerebras throttle + 429 retry."""
    api_key = require_llm_api_key()
    url = llm_api_url()
    resolved_model = model or llm_model()
    payload: dict[str, Any] = {
        "model": resolved_model,
        "temperature": temperature,
        "messages": messages,
    }
    if response_format is not None:
        payload["response_format"] = response_format

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        _throttle_cerebras(_estimate_tokens(payload))
        try:
            response = requests.post(
                url,
                headers=llm_headers(api_key),
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
            response.raise_for_status()
            body = response.json()
            usage = body.get("usage") if isinstance(body, dict) else {}
            if isinstance(usage, dict):
                total_tokens = usage.get("total_tokens")
                if total_tokens is None:
                    prompt = usage.get("prompt_tokens") or 0
                    completion = usage.get("completion_tokens") or 0
                    total_tokens = int(prompt) + int(completion)
                _record_cerebras_usage(int(total_tokens or 0))
                log_llm_call(
                    stage=stage,
                    provider=llm_provider(),
                    model=resolved_model,
                    input_tokens=usage.get("prompt_tokens"),
                    output_tokens=usage.get("completion_tokens"),
                    cache_hit=False,
                )
            return body
        except requests.RequestException as error:
            last_error = error
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status not in RETRYABLE_STATUS_CODES and attempt >= max_attempts:
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


def llm_provider() -> str:
    explicit = os.getenv("LLM_PROVIDER", "").strip().lower()
    if explicit in {"cerebras", "openai", "openrouter"}:
        return explicit
    has_cerebras = bool(os.getenv("CEREBRAS_API_KEY", "").strip())
    has_openai = bool(os.getenv("OPENAI_API_KEY", "").strip())
    has_openrouter = bool(os.getenv("OPENROUTER_API_KEY", "").strip())
    if has_cerebras and not has_openai:
        return "cerebras"
    if has_openrouter and not has_openai:
        return "openrouter"
    return "openai"


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
    if llm_provider() == "openrouter":
        return os.getenv("OPENROUTER_API_KEY", "").strip()
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
    if llm_provider() == "openrouter":
        return os.getenv("OPENROUTER_API_URL", "").strip() or OPENROUTER_API_URL
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
    if llm_provider() == "openrouter":
        return os.getenv("OPENROUTER_MODEL", "").strip() or default or DEFAULT_OPENROUTER_MODEL
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
        raise ValueError("LLM_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY is required")
    return api_key


def require_llm_enrichment_api_key() -> str:
    api_key = llm_enrichment_api_key()
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY or LLM_ENRICHMENT_API_KEY is required for article enrichment")
    return api_key


def llm_headers(api_key: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if llm_provider() == "openrouter":
        headers["HTTP-Referer"] = os.getenv("OPENROUTER_HTTP_REFERER", "https://tikrr.app").strip() or "https://tikrr.app"
        headers["X-Title"] = os.getenv("OPENROUTER_APP_NAME", "tikrr-stock-briefs").strip() or "tikrr-stock-briefs"
    return headers


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
