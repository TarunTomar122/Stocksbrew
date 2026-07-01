import os
import unittest
from unittest.mock import patch

from backend.llm_client import CEREBRAS_API_URL, llm_api_key, llm_api_url, llm_model, llm_provider


class LlmClientProviderTest(unittest.TestCase):
    def test_cerebras_provider_uses_cerebras_env(self) -> None:
        env = {
            "LLM_PROVIDER": "cerebras",
            "CEREBRAS_API_KEY": "cerebras-key",
            "CEREBRAS_MODEL": "gpt-oss-120b",
            "OPENAI_API_KEY": "openai-key",
            "OPENAI_MODEL": "gpt-4.1-mini",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "cerebras")
            self.assertEqual(llm_api_key(), "cerebras-key")
            self.assertEqual(llm_api_url(), CEREBRAS_API_URL)
            self.assertEqual(llm_model(), "gpt-oss-120b")

    def test_explicit_llm_env_overrides_provider(self) -> None:
        env = {
            "LLM_PROVIDER": "cerebras",
            "LLM_API_KEY": "explicit-key",
            "LLM_API_URL": "https://example.test/v1/chat/completions",
            "LLM_MODEL": "custom-model",
            "CEREBRAS_API_KEY": "cerebras-key",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_api_key(), "explicit-key")
            self.assertEqual(llm_api_url(), "https://example.test/v1/chat/completions")
            self.assertEqual(llm_model(), "custom-model")

    def test_cerebras_key_auto_selects_cerebras_when_openai_key_absent(self) -> None:
        env = {
            "CEREBRAS_API_KEY": "cerebras-key",
            "CEREBRAS_MODEL": "gpt-oss-120b",
        }

        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(llm_provider(), "cerebras")
            self.assertEqual(llm_api_key(), "cerebras-key")
            self.assertEqual(llm_api_url(), CEREBRAS_API_URL)
            self.assertEqual(llm_model(), "gpt-oss-120b")


if __name__ == "__main__":
    unittest.main()
