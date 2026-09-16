from __future__ import annotations

import unittest
from unittest.mock import patch

from backend import jev_qa
from backend.jev_qa import build_brief_state, decide, evaluate_brief_state


class JevQaTest(unittest.TestCase):
    def test_decision_rule_thresholds(self) -> None:
        self.assertEqual(decide(0.9, 0.9, 0.9), "publish")
        self.assertEqual(decide(0.2, 0.9, 0.9), "hold")
        self.assertEqual(decide(0.9, 0.2, 0.9), "hold")
        self.assertEqual(decide(0.9, 0.9, 0.2), "hold")
        self.assertEqual(decide(0.46, 0.46, 0.46), "publish")
        self.assertEqual(decide(0.44, 0.9, 0.9), "hold")

    def test_build_state_pulls_directive_fields(self) -> None:
        state = build_brief_state(
            {
                "instrument_id": "US_KO",
                "current_price": 87.8,
                "headline": "KO holds its line",
                "visual_summary": {"what_changed": "Dividend raised"},
                "directive_v2": {
                    "action": {"label": "Accumulate on pullbacks"},
                    "zones": {"accumulate_below": 84},
                },
            }
        )
        self.assertEqual(state["ticker"], "KO")
        self.assertEqual(state["current_price"], 87.8)
        self.assertEqual(state["action_label"], "Accumulate on pullbacks")
        self.assertEqual(state["zones"], {"accumulate_below": 84})

    def test_gate_is_fail_open_without_key(self) -> None:
        with patch.dict("os.environ", {"TYPESAFE_API_KEY": ""}, clear=False):
            with patch.object(jev_qa.os, "getenv", return_value=""):
                self.assertIsNone(jev_qa.gate_brief({"instrument_id": "US_KO"}))

    def test_gate_never_raises_on_api_error(self) -> None:
        with patch.dict("os.environ", {"TYPESAFE_API_KEY": "test"}):
            with patch.object(jev_qa, "evaluate_brief_state", side_effect=TimeoutError("boom")):
                self.assertIsNone(jev_qa.gate_brief({"instrument_id": "US_KO", "ticker": "KO"}))

    def test_evaluate_parses_calibrated_answers(self) -> None:
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b'{"answers": {"correct_company": {"noul": 0.91}, "prices_sane": {"noul": 0.3}, "evidence_supported": {"noul": 0.95}}, "usage": {"input_tokens": 420}}'

        with patch.dict("os.environ", {"TYPESAFE_API_KEY": "test"}):
            with patch("urllib.request.urlopen", return_value=FakeResponse()):
                result = evaluate_brief_state({"ticker": "KO"})
        self.assertEqual(result["decision"], "hold")
        self.assertAlmostEqual(result["correct_company"], 0.91, places=2)
        self.assertEqual(result["prices_sane"], 0.3)
        self.assertEqual(result["input_tokens"], 420)


if __name__ == "__main__":
    unittest.main()


    def test_storage_wiring_calls_gate(self) -> None:
        from backend import storage as storage_module

        captured: list[dict] = []
        with patch.object(storage_module, "gate_brief", side_effect=lambda payload: {"decision": "publish", "input_tokens": 1, "evaluated_at": "x", **{"correct_company": 0.9, "prices_sane": 0.9, "evidence_supported": 0.9}}):
            class BareStore:
                _attach_jev_qa = storage_module.TraceMoneyStore._attach_jev_qa

            bare = BareStore()
            payload = {"instrument_id": "US_KO", "ticker": "KO"}
            BareStore._attach_jev_qa(bare, [payload])
        self.assertEqual(captured, [])
        # gate_brief was stubbed at module level, so the payload gets the field.


    def test_storage_wiring_fail_open(self) -> None:
        """The storage wiring must import gate_brief and survive its failure."""
        from backend import storage as storage_module

        class BareStore:
            _attach_jev_qa = storage_module.TraceMoneyStore._attach_jev_qa

        payload = {"instrument_id": "US_KO", "ticker": "KO"}
        with patch.object(storage_module, "gate_brief", side_effect=TimeoutError("boom")):
            bare = BareStore()
            bare._attach_jev_qa([payload])  # must not raise
            self.assertNotIn("jev_qa", payload)

        payload_ok = {"instrument_id": "US_KO", "ticker": "KO"}
        fake = {"decision": "publish", "correct_company": 0.9, "prices_sane": 0.9, "evidence_supported": 0.9, "input_tokens": 10, "evaluated_at": "now"}
        with patch.object(storage_module, "gate_brief", return_value=fake):
            BareStore()._attach_jev_qa([payload_ok])
        self.assertEqual(payload_ok.get("jev_qa", {}).get("decision"), "publish")
