from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from backend.llm_client import schema_system_prompt
from backend.stock_intelligence import (
    STOCK_BRIEF_SCHEMA,
    _clean_sentence,
    _llm_synthesize_brief,
    _validate_stock_brief_payload,
    stock_brief_model,
)


def _valid_brief() -> dict:
    return {
        "headline": "IBM revenue miss resets the setup",
        "body": "IBM's preliminary revenue missed expectations. The spending shift toward AI infrastructure now raises execution risk.",
        "key_findings": ["Preliminary revenue missed expectations."],
        "catalyst": "Evidence that AI infrastructure demand offsets weakness",
        "risk": "Further revenue execution misses",
        "thesis": "Execution risk now outweighs valuation support",
        "setup_state": "exhaustion",
        "drivers": [
            {
                "label": "AI infrastructure demand",
                "detail": "Enterprise spending continues shifting toward AI infrastructure.",
                "direction": "mixed",
                "strength": 3,
                "horizon": "quarter",
            }
        ],
        "catalyst_cards": [],
        "risk_cards": [
            {
                "risk": "Revenue execution",
                "detail": "Preliminary revenue missed analyst expectations.",
                "trigger": "another estimate reduction",
                "severity": 5,
            }
        ],
    }


class _Store:
    def __init__(self, cached_payload: dict | None = None) -> None:
        self.cached_payload = cached_payload
        self.saved: list[tuple[str, dict]] = []

    def get_llm_enrichment(self, _cache_key: str) -> dict | None:
        if self.cached_payload is None:
            return None
        return {"payload": self.cached_payload}

    def save_llm_enrichment(self, cache_key: str, row: dict) -> None:
        self.saved.append((cache_key, row))


class StockBriefContractTest(unittest.TestCase):
    def test_stock_brief_uses_shared_deepseek_model_by_default(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(stock_brief_model(), "deepseek/deepseek-v4-flash")
        with patch.dict(
            "os.environ",
            {
                "LLM_PROVIDER": "openrouter",
                "OPENROUTER_MODEL": "deepseek/deepseek-v4-flash",
            },
            clear=True,
        ):
            self.assertEqual(stock_brief_model(), "deepseek/deepseek-v4-flash")

    def test_sentence_cleaner_preserves_hyphenated_finance_terms(self) -> None:
        self.assertEqual(_clean_sentence("Valuation re-rating"), "Valuation re-rating")
        self.assertEqual(
            _clean_sentence("Adobe's discount is driving a re-rating."),
            "Adobe's discount is driving a re-rating",
        )
        self.assertEqual(_clean_sentence("Risk-off pressure is building"), "Risk-off pressure is building")

    def test_sentence_cleaner_still_removes_title_source_attribution(self) -> None:
        self.assertEqual(_clean_sentence("Adobe falls after guidance - Reuters"), "Adobe falls after guidance")

    def test_schema_prompt_uses_inner_schema_not_response_envelope(self) -> None:
        prompt = schema_system_prompt("Build a brief.", STOCK_BRIEF_SCHEMA)

        self.assertIn('"headline"', prompt)
        self.assertNotIn('"name": "stock_brief"', prompt)
        self.assertIn("never return or repeat the schema definition", prompt)

    def test_validator_rejects_ibm_style_schema_echo(self) -> None:
        schema_echo = {
            "name": "stock_brief",
            "strict": True,
            "schema": STOCK_BRIEF_SCHEMA["schema"],
        }

        with self.assertRaisesRegex(ValueError, "echoed the schema envelope"):
            _validate_stock_brief_payload(schema_echo)

    def test_schema_excludes_legacy_directive_and_dead_card_fields(self) -> None:
        properties = STOCK_BRIEF_SCHEMA["schema"]["properties"]

        self.assertNotIn("directive", properties)
        self.assertNotIn("expected_impact", properties["catalyst_cards"]["items"]["properties"])
        self.assertNotIn("probability", properties["risk_cards"]["items"]["properties"])

    def test_validator_normalizes_harmless_enum_aliases(self) -> None:
        payload = _valid_brief()
        payload["drivers"][0]["horizon"] = "next quarter"
        payload["catalyst_cards"] = [{
            "event": "Estimate reset",
            "detail": "Lower estimates could create a cleaner base for the next quarter.",
            "window": "quarter",
            "priced_in": "medium",
        }]

        result = _validate_stock_brief_payload(payload)

        self.assertEqual(result["drivers"][0]["horizon"], "quarter")
        self.assertEqual(result["catalyst_cards"][0]["priced_in"], "med")

    def test_invalid_cached_and_first_model_payload_are_retried_and_never_cached(self) -> None:
        schema_echo = {
            "name": "stock_brief",
            "strict": True,
            "schema": STOCK_BRIEF_SCHEMA["schema"],
        }
        valid = _valid_brief()
        store = _Store(cached_payload=schema_echo)
        responses = [
            {"choices": [{"message": {"content": json.dumps(schema_echo)}}]},
            {"choices": [{"message": {"content": json.dumps(valid)}}]},
        ]

        with patch("backend.stock_intelligence.llm_api_key", return_value="test-key"), patch(
            "backend.stock_intelligence.stock_brief_model", return_value="test-model"
        ), patch(
            "backend.stock_intelligence.post_chat_completion", side_effect=responses
        ) as post:
            result = _llm_synthesize_brief(
                ticker="IBM",
                name="International Business Machines",
                key_points=["Preliminary revenue missed expectations."],
                article_titles=["IBM sinks after revenue miss"],
                sentiment_label="bearish",
                sentiment_score=20,
                article_count=4,
                source_count=3,
                catalyst="AI infrastructure spending",
                risk="Revenue execution",
                store=store,
            )

        self.assertEqual(result, valid)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(len(store.saved), 1)
        self.assertEqual(store.saved[0][1]["payload"], valid)


if __name__ == "__main__":
    unittest.main()
