import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

from backend.llm_client import (
    OPENAI_API_URL,
    begin_llm_usage_collection,
    end_llm_usage_collection,
    estimate_llm_cost_usd,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    llm_provider,
    post_chat_completion,
    summarize_llm_usage,
)


class LlmClientProviderTest(unittest.TestCase):
    def test_luna_cost_estimate_uses_official_cached_and_output_rates(self) -> None:
        self.assertEqual(
            estimate_llm_cost_usd(
                model="gpt-5.6-luna",
                input_tokens=1_000_000,
                cached_input_tokens=250_000,
                output_tokens=100_000,
            ),
            0.275,
        )
        self.assertIsNone(
            estimate_llm_cost_usd(
                model="unknown-model",
                input_tokens=1_000,
                output_tokens=100,
            )
        )

    def test_request_usage_is_collectable_per_worker(self) -> None:
        response = Mock()
        response.status_code = 200
        response.headers = {}
        response.json.return_value = {
            "choices": [{"message": {"content": '{"ok":true}'}}],
            "usage": {
                "prompt_tokens": 1_000,
                "completion_tokens": 200,
                "prompt_tokens_details": {"cached_tokens": 500},
            },
        }
        response.raise_for_status.return_value = None
        records, token = begin_llm_usage_collection()
        try:
            with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}, clear=True), patch(
                "backend.llm_client.requests.post", return_value=response
            ):
                post_chat_completion(messages=[{"role": "user", "content": "test"}])
        finally:
            end_llm_usage_collection(token)

        summary = summarize_llm_usage(records)
        self.assertEqual(summary["calls"], 1)
        self.assertEqual(summary["cached_input_tokens"], 500)
        self.assertTrue(summary["cost_complete"])
        self.assertGreater(summary["estimated_cost_usd"], 0)

    def test_backend_does_not_pin_gpt4_models(self) -> None:
        backend_root = Path(__file__).parents[1]
        forbidden = "gpt" + "-4o"
        offenders: list[str] = []
        for path in backend_root.rglob("*"):
            if not path.is_file() or path.suffix not in {
                ".json",
                ".md",
                ".py",
                ".sh",
                ".yaml",
                ".yml",
            }:
                continue
            if "tests" in path.parts:
                continue
            if forbidden in path.read_text(encoding="utf-8", errors="ignore").lower():
                offenders.append(str(path.relative_to(backend_root)))
        self.assertEqual(offenders, [])

    def test_legacy_cerebras_provider_is_migrated_to_openai(self) -> None:
        with patch.dict(os.environ, {"LLM_PROVIDER": "cerebras"}, clear=True):
            self.assertEqual(llm_provider(), "openai")
            self.assertEqual(llm_api_url(), OPENAI_API_URL)

    def test_legacy_generic_router_env_cannot_override_openai(self) -> None:
        env = {
            "LLM_PROVIDER": "openrouter",
            "LLM_API_KEY": "explicit-key",
            "LLM_API_URL": "https://example.test/v1/chat/completions",
            "LLM_MODEL": "qwen/qwen-2.5-7b-instruct",
            "OPENAI_API_KEY": "openai-key",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "openai")
            self.assertEqual(llm_api_key(), "openai-key")
            self.assertEqual(llm_api_url(), OPENAI_API_URL)
            self.assertEqual(llm_model(), "gpt-5.6-luna")

    def test_openrouter_env_is_ignored(self) -> None:
        env = {
            "LLM_PROVIDER": "openrouter",
            "OPENROUTER_API_KEY": "openrouter-key",
            "OPENROUTER_MODEL": "qwen/qwen-2.5-7b-instruct",
            "OPENROUTER_API_URL": "https://openrouter.test/api/v1/chat/completions",
            "OPENAI_API_KEY": "openai-key",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "openai")
            self.assertEqual(llm_api_key(), "openai-key")
            self.assertEqual(llm_api_url(), OPENAI_API_URL)
            self.assertEqual(llm_model(), "gpt-5.6-luna")
            self.assertNotIn("HTTP-Referer", llm_headers("openai-key"))

    def test_openrouter_key_does_not_auto_select_openrouter(self) -> None:
        env = {"OPENROUTER_API_KEY": "openrouter-key"}

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "openai")
            self.assertEqual(llm_api_key(), "")
            self.assertEqual(llm_api_url(), OPENAI_API_URL)
            self.assertEqual(llm_model(), "gpt-5.6-luna")

    def test_no_provider_env_defaults_to_openai_luna(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(llm_provider(), "openai")
            self.assertEqual(llm_api_url(), OPENAI_API_URL)
            self.assertEqual(llm_model(), "gpt-5.6-luna")

    def test_non_retryable_error_fails_immediately(self) -> None:
        response = Mock()
        response.status_code = 402
        response.headers = {}
        response.raise_for_status.side_effect = requests.HTTPError(response=response)

        with patch.dict(
            os.environ,
            {"LLM_PROVIDER": "openrouter", "OPENAI_API_KEY": "test-key"},
            clear=True,
        ), patch("backend.llm_client.requests.post", return_value=response) as post:
            with self.assertRaises(requests.HTTPError):
                post_chat_completion(messages=[{"role": "user", "content": "test"}])

        post.assert_called_once()

    def test_luna_omits_temperature_and_sends_low_reasoning(self) -> None:
        response = Mock()
        response.status_code = 200
        response.headers = {}
        response.json.return_value = {
            "choices": [{"message": {"content": '{"ok":true}'}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 2},
        }
        response.raise_for_status.return_value = None

        env = {
            "LLM_PROVIDER": "openai",
            "OPENAI_API_KEY": "test-key",
            "OPENAI_MODEL": "gpt-5.6-luna",
            "LLM_REASONING_EFFORT": "low",
        }
        with patch.dict(os.environ, env, clear=True), patch(
            "backend.llm_client.requests.post", return_value=response
        ) as post:
            post_chat_completion(messages=[{"role": "user", "content": "test"}])

        request_payload = post.call_args.kwargs["json"]
        self.assertNotIn("temperature", request_payload)
        self.assertEqual(request_payload["reasoning_effort"], "low")

    def test_non_luna_keeps_temperature(self) -> None:
        response = Mock()
        response.status_code = 200
        response.headers = {}
        response.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        response.raise_for_status.return_value = None

        with patch.dict(
            os.environ,
            {
                "LLM_PROVIDER": "openai",
                "OPENAI_API_KEY": "test-key",
                "OPENAI_MODEL": "gpt-4.1-mini",
            },
            clear=True,
        ), patch("backend.llm_client.requests.post", return_value=response) as post:
            post_chat_completion(
                messages=[{"role": "user", "content": "test"}], temperature=0.3
            )

        self.assertEqual(post.call_args.kwargs["json"]["temperature"], 0.3)

    def test_request_can_route_directly_to_openai_without_changing_global_provider(self) -> None:
        response = Mock()
        response.status_code = 200
        response.headers = {}
        response.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        response.raise_for_status.return_value = None

        env = {"LLM_PROVIDER": "openrouter", "OPENAI_API_KEY": "openai-key"}
        with patch.dict(os.environ, env, clear=True), patch(
            "backend.llm_client.requests.post", return_value=response
        ) as post:
            post_chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="gpt-5.6-luna",
                provider="openai",
                reasoning_effort="low",
            )

        self.assertEqual(post.call_args.args[0], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer openai-key")
        self.assertNotIn("HTTP-Referer", post.call_args.kwargs["headers"])


if __name__ == "__main__":
    unittest.main()
