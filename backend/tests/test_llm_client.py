import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

from backend.llm_client import (
    OPENROUTER_API_URL,
    llm_api_key,
    llm_api_url,
    llm_headers,
    llm_model,
    llm_provider,
    post_chat_completion,
)


class LlmClientProviderTest(unittest.TestCase):
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

    def test_legacy_cerebras_provider_is_migrated_to_openrouter(self) -> None:
        with patch.dict(os.environ, {"LLM_PROVIDER": "cerebras"}, clear=True):
            self.assertEqual(llm_provider(), "openrouter")
            self.assertEqual(llm_api_url(), OPENROUTER_API_URL)

    def test_explicit_llm_env_overrides_provider(self) -> None:
        env = {
            "LLM_PROVIDER": "openrouter",
            "LLM_API_KEY": "explicit-key",
            "LLM_API_URL": "https://example.test/v1/chat/completions",
            "LLM_MODEL": "custom-model",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_api_key(), "explicit-key")
            self.assertEqual(llm_api_url(), "https://example.test/v1/chat/completions")
            self.assertEqual(llm_model(), "custom-model")

    def test_openrouter_provider_uses_openrouter_env(self) -> None:
        env = {
            "LLM_PROVIDER": "openrouter",
            "OPENROUTER_API_KEY": "openrouter-key",
            "OPENROUTER_MODEL": "openrouter/model",
            "OPENROUTER_API_URL": "https://openrouter.test/api/v1/chat/completions",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "openrouter")
            self.assertEqual(llm_api_key(), "openrouter-key")
            self.assertEqual(llm_api_url(), "https://openrouter.test/api/v1/chat/completions")
            self.assertEqual(llm_model(), "openrouter/model")
            self.assertIn("HTTP-Referer", llm_headers("openrouter-key"))

    def test_openrouter_key_auto_selects_openrouter(self) -> None:
        env = {"OPENROUTER_API_KEY": "openrouter-key"}

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "openrouter")
            self.assertEqual(llm_api_key(), "openrouter-key")
            self.assertEqual(llm_api_url(), OPENROUTER_API_URL)
            self.assertEqual(llm_model(), "deepseek/deepseek-v4-flash")

    def test_no_provider_env_defaults_to_openrouter(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(llm_provider(), "openrouter")
            self.assertEqual(llm_api_url(), OPENROUTER_API_URL)
            self.assertEqual(llm_model(), "deepseek/deepseek-v4-flash")

    def test_non_retryable_error_fails_immediately(self) -> None:
        response = Mock()
        response.status_code = 402
        response.headers = {}
        response.raise_for_status.side_effect = requests.HTTPError(response=response)

        with patch.dict(
            os.environ,
            {"LLM_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "test-key"},
            clear=True,
        ), patch("backend.llm_client.requests.post", return_value=response) as post:
            with self.assertRaises(requests.HTTPError):
                post_chat_completion(messages=[{"role": "user", "content": "test"}])

        post.assert_called_once()


if __name__ == "__main__":
    unittest.main()
