"""The stock-specific reason under a published call (backend/call_reason.py)."""

from __future__ import annotations

import copy
import json
import os
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.call_reason import (
    attach_call_reason,
    bucket_for,
    call_reason_text,
    compose_fallback_reason,
    rejection_reason,
    short_name,
    validated_model_reasons,
)
from backend.directive_v2 import build_directive_v2
from backend.stock_intelligence import (
    NO_NEWS_BRIEF_SYSTEM_PROMPT,
    STOCK_BRIEF_ENGINE_SYSTEM_PROMPT,
    STOCK_BRIEF_SYSTEM_PROMPT,
    _llm_synthesize_brief,
    _validate_stock_brief_payload,
    build_no_news_intelligence_doc,
)

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "call_reason_briefs.json").read_text())

# Every template the old directive wrote; each one was identical across stocks.
OLD_TEMPLATES = [
    "The setup is attractive at the current price; use pullbacks to add rather than waiting for a perfect entry.",
    "The setup is constructive, but the cleaner entry is a pullback into support.",
    "Still constructive, but price is up 14% from its recent low, so the first pullback is the better entry.",
    "Still constructive, but price is up 8% in a handful of sessions, so wait for the move to settle.",
    "Wait for price confirmation before adding; the evidence is not strong enough for an add-now call.",
    "Risk/reward has weakened; avoid adding and use any bounce to reduce exposure.",
    "The setup is not paying enough for the risk right now.",
    "Upside and downside look balanced; keep the position but do not force a new add.",
]

NVDA_INPUT = {
    "ticker": "NVDA",
    "company_name": "NVIDIA Corporation",
    "today": "2026-11-10",
    "earnings": {"status": "upcoming", "event_date": "2026-11-17", "days_until": 7},
    "price_context": {"returns": {"week_1_pct": -6.2}},
    "recent_news": [{"date": "2026-11-10", "title": "Nvidia board faces investigation over Huang disclosures"}],
}


def _check(text: str, bucket: str = "hold", evidence: dict | None = None) -> str | None:
    return rejection_reason(
        text,
        bucket=bucket,
        name="NVIDIA Corporation",
        ticker="NVDA",
        evidence_text=json.dumps(evidence or NVDA_INPUT),
    )


def _brief(**extra) -> dict:
    out = {
        "headline": "Nvidia faces a board investigation before earnings",
        "body": "Nvidia's board is under investigation. Earnings on Nov 17 will test demand.",
        "key_findings": ["Earnings land on Nov 17."],
        "catalyst": "Nov 17 earnings",
        "risk": "Board investigation widens",
        "thesis": "Earnings will test demand",
        "setup_state": "trend",
        "drivers": [{"label": "Data-center demand", "detail": "Data-center demand keeps growing.", "direction": "up", "strength": 4, "horizon": "quarter"}],
        "catalyst_cards": [],
        "risk_cards": [{"risk": "Board investigation", "detail": "A wider probe could hurt trust.", "trigger": "new findings", "severity": 3}],
    }
    out.update(extra)
    return out


class ValidationTest(unittest.TestCase):
    def test_every_old_template_is_rejected_for_every_call(self) -> None:
        for template in OLD_TEMPLATES:
            for bucket in ("add", "hold", "trim"):
                self.assertIsNotNone(_check(template, bucket), template)

    def test_old_templates_with_the_name_glued_on_are_still_rejected(self) -> None:
        self.assertIsNotNone(_check("For NVIDIA, upside and downside look balanced; keep the position but do not force a new add."))
        self.assertIsNotNone(_check("NVDA: risk/reward has weakened, so we would not add here.", "trim"))

    def test_target_style_reasons_pass(self) -> None:
        self.assertIsNone(_check(
            "Nvidia is down 6% this week on the board investigation, and earnings on Nov 17 will show whether demand is holding, so we'd hold rather than add now."
        ))
        self.assertIsNone(_check("Nvidia reports on Nov 17 after a 6% drop, so we'd wait for the report before buying more.", "trim"))

    def test_numbers_must_come_from_the_input(self) -> None:
        self.assertEqual(_check("Nvidia is down 11% this week on the board investigation, so we'd hold rather than add now."), "number not in the input")
        # Rounding is fine: 6.2 -> 6.
        self.assertIsNone(_check("Nvidia is down 6% this week on the board investigation, so we'd hold rather than add now."))

    def test_must_name_the_stock_or_its_news(self) -> None:
        self.assertEqual(_check("The company is down this week on the probe, so we'd hold rather than add now."), "does not name the stock or its news")
        # A specific name from the news counts.
        self.assertIsNone(_check("The probe into Huang's disclosures is still open, so we'd hold rather than add now."))

    def test_length_and_sentence_shape(self) -> None:
        self.assertEqual(_check("Nvidia: hold."), "too short")
        self.assertEqual(_check("Nvidia " + "keeps growing and " * 20 + "so we'd hold."), "too long")
        self.assertEqual(_check("Nvidia is down this week on the board investigation so we'd hold rather than add"), "not a full sentence")
        self.assertEqual(
            _check("Nvidia fell. The board is under investigation. Earnings are on Nov 17. We'd hold rather than add."),
            "more than two sentences",
        )

    def test_share_prices_are_rejected_but_deal_sizes_are_fine(self) -> None:
        evidence = dict(NVDA_INPUT, current_price=168.79, deal="$26 billion")
        self.assertEqual(_check("Nvidia is at $168.79 after the board investigation, so we'd hold rather than add now.", evidence=evidence), "names a share price")
        self.assertIsNone(_check("Nvidia just put $26 billion into a big customer, so we'd hold rather than add before earnings.", evidence=evidence))

    def test_reason_cannot_argue_the_opposite_call(self) -> None:
        self.assertEqual(_check("Nvidia is down 6% on the board investigation, so we'd add more here.", "trim"), "contradicts the call")
        self.assertEqual(_check("Nvidia is down 6% on the board investigation, so we'd sell some.", "add"), "contradicts the call")
        self.assertEqual(_check("Nvidia is down 6% on the board investigation, so we'd trim it.", "hold"), "contradicts the call")

    def test_model_reasons_keep_only_valid_buckets(self) -> None:
        raw = {
            "add": "Nvidia's sales keep growing faster than other chip makers, so we'd buy more.",
            "hold": "Upside and downside look balanced; keep the position but do not force a new add.",
            "trim": "Nvidia is down 40% this month, so we wouldn't buy more and would sell some on a bounce.",
            "extra": "ignored",
        }
        out = validated_model_reasons(raw, name="NVIDIA Corporation", ticker="NVDA", model_input=NVDA_INPUT)
        self.assertEqual(set(out), {"add"})
        self.assertEqual(validated_model_reasons("not a dict", name="NVIDIA", ticker="NVDA", model_input=NVDA_INPUT), {})

    def test_buckets_and_names(self) -> None:
        self.assertEqual([bucket_for(s) for s in ("accumulate", "hold", "watch", "trim", "avoid", None)], ["add", "hold", "hold", "trim", "trim", None])
        self.assertEqual(short_name("NVIDIA Corporation", "NVDA"), "NVIDIA")
        self.assertEqual(short_name("Micron Technology, Inc.", "MU"), "Micron")
        self.assertEqual(short_name("Bank of America Corporation", "BAC"), "Bank of America")
        self.assertEqual(short_name("", "aaoi"), "AAOI")


class BriefOutputTest(unittest.TestCase):
    def test_prompts_ask_for_call_reasons(self) -> None:
        for prompt in (STOCK_BRIEF_SYSTEM_PROMPT, NO_NEWS_BRIEF_SYSTEM_PROMPT, STOCK_BRIEF_ENGINE_SYSTEM_PROMPT):
            self.assertIn("`call_reasons`", prompt)
            self.assertIn("Never quote a share price", prompt)

    def test_a_malformed_call_reasons_value_never_costs_the_brief(self) -> None:
        for bad in ("hold it", ["a"], {"hold": 3}, None):
            result = _validate_stock_brief_payload(_brief(call_reasons=bad))
            self.assertNotIn("call_reasons", result)
            self.assertEqual(result["headline"], "Nvidia faces a board investigation before earnings")
        result = _validate_stock_brief_payload(_brief())
        self.assertNotIn("call_reasons", result)

    def test_model_reasons_are_parsed_validated_and_cached(self) -> None:
        reasons = {
            "add": "Nvidia's data-center demand keeps growing, so we'd buy more.",
            "hold": "Nvidia is down 18% this week, and the Nov 17 report will show whether demand holds, so we'd hold rather than add.",
            "trim": "Nvidia is down 31% this week, so we'd sell some on a bounce.",
        }
        response = {"choices": [{"message": {"content": json.dumps(_brief(call_reasons=reasons))}}]}
        saved: list = []

        class Store:
            def get_llm_enrichment(self, _key):
                return None

            def save_llm_enrichment(self, key, row):
                saved.append(row)

        with patch("backend.stock_intelligence.llm_api_key", return_value="k"), patch(
            "backend.stock_intelligence.post_chat_completion", return_value=response
        ):
            result = _llm_synthesize_brief(
                ticker="NVDA",
                name="NVIDIA Corporation",
                key_points=["Earnings land on Nov 17."],
                article_titles=["Nvidia board investigation"],
                sentiment_label="mixed",
                sentiment_score=50,
                article_count=3,
                source_count=2,
                catalyst="Nov 17 earnings",
                risk="Board investigation",
                price_context={"returns": {"week_1_pct": -18.29}},
                earnings={"status": "upcoming", "event_date": "2026-11-17", "days_until": 7},
                store=Store(),
            )
        assert result is not None
        # 31% is not in the input, so the trim reason is dropped; the rest stay.
        self.assertEqual(result["call_reasons"], {"add": reasons["add"], "hold": reasons["hold"]})
        self.assertEqual(saved[0]["payload"]["call_reasons"], result["call_reasons"])


class FallbackTest(unittest.TestCase):
    def test_fixture_reasons_are_specific_valid_and_distinct(self) -> None:
        seen = set()
        for iid, case in FIXTURES.items():
            directive = build_directive_v2(case["doc"])
            text = compose_fallback_reason(case["doc"], directive, name=case["name"], ticker=case["ticker"], earnings=case["earnings"])
            evidence = json.dumps(case["doc"]) + json.dumps(case["earnings"])
            self.assertIsNone(
                rejection_reason(text, bucket=bucket_for(directive["stance"]), name=case["name"], ticker=case["ticker"], evidence_text=evidence),
                f"{iid}: {text}",
            )
            self.assertNotEqual(text, case["old_summary"])
            seen.add(text)
        self.assertEqual(len(seen), len(FIXTURES))

    def test_real_shaped_examples(self) -> None:
        def reason(iid: str) -> str:
            case = FIXTURES[iid]
            return compose_fallback_reason(case["doc"], build_directive_v2(case["doc"]), name=case["name"], ticker=case["ticker"], earnings=case["earnings"])

        self.assertEqual(
            reason("US_NVDA"),
            "NVIDIA is down 18% over the past week. Its sales and profits are growing faster than at similar companies, "
            "but the main worry is that leadership scrutiny expands, so we'd hold rather than add before the Nov 17 report.",
        )
        self.assertEqual(
            reason("US_HIMS"),
            "Hims & Hers Health is down 26% over the past week after missing earnings forecasts on Nov 9. "
            "The main worry is lower profit outlook, so we'd stay out for now.",
        )
        self.assertEqual(
            reason("US_GAP"),
            "Gap reports earnings on Nov 19. The stock is cheap next to similar companies for what it earns, "
            "but the main worry is persistent downtrend, so we'd hold rather than add before the Nov 19 report.",
        )
        self.assertIn("so we wouldn't buy more, and we'd sell some if it bounces", reason("US_FSLR"))

    def test_bare_doc_still_names_the_stock(self) -> None:
        directive = {"stance": "hold", "execution": "now", "action": {"label": "Hold here", "summary": OLD_TEMPLATES[-1]}}
        text = compose_fallback_reason({}, directive, name="Acme Widgets Inc.", ticker="ACME", today=date(2026, 11, 10))
        self.assertEqual(text, "For Acme Widgets, we'd hold rather than add for now.")

    def test_watch_without_a_price_is_a_plain_hold(self) -> None:
        def text(execution: str) -> str:
            return compose_fallback_reason({}, {"stance": "watch", "execution": execution}, name="Acme Inc.", ticker="ACME", today=date(2026, 11, 10))

        self.assertEqual(text("after_event"), "For Acme, we'd hold rather than add for now.")
        self.assertEqual(text("breakout"), "For Acme, we'd wait for the price to keep rising before adding.")

    def test_old_earnings_are_not_tied_to_this_weeks_move(self) -> None:
        doc = {"price_context": {"returns": {"week_1_pct": 5.2}}}
        earnings = {"status": "reported", "event_date": "2026-10-29", "surprise_label": "beat"}
        directive = {"stance": "accumulate", "execution": "now"}
        text = compose_fallback_reason(doc, directive, name="First Solar", ticker="FSLR", earnings=earnings, today=date(2026, 11, 10))
        self.assertTrue(text.startswith("First Solar is up 5% over the past week and beat earnings forecasts on Oct 29."), text)


class CallUnchangedTest(unittest.TestCase):
    def test_call_decision_is_byte_identical_for_fixtures(self) -> None:
        for iid, case in FIXTURES.items():
            directive = build_directive_v2(case["doc"])
            pinned = {key: directive[key] for key in ("stance", "execution", "confidence", "action", "zones")}
            self.assertEqual(json.dumps(pinned, sort_keys=True), json.dumps(case["expected_directive"], sort_keys=True), iid)

            before = json.dumps(directive, sort_keys=True)
            out = attach_call_reason(directive, doc=case["doc"], name=case["name"], ticker=case["ticker"], earnings=case["earnings"])
            self.assertEqual(json.dumps(directive, sort_keys=True), before, f"{iid}: input mutated")
            stripped = {key: value for key, value in out.items() if key not in ("call_reason", "call_reason_source")}
            self.assertEqual(json.dumps(stripped, sort_keys=True), before, iid)
            self.assertEqual(out["call_reason_source"], "facts")

    def test_matching_model_reason_wins_and_mismatched_timing_falls_back(self) -> None:
        case = FIXTURES["US_DUK"]  # accumulate on pullbacks
        directive = build_directive_v2(case["doc"])
        self.assertEqual((directive["stance"], directive["execution"]), ("accumulate", "pullback"))
        timed = {"add": "Duke Energy keeps raising its dividend, so we'd add at today's price."}
        out = attach_call_reason(directive, doc=case["doc"], name=case["name"], ticker=case["ticker"], model_reasons=timed)
        self.assertEqual(out["call_reason_source"], "facts")
        plain = {"add": "Duke Energy keeps raising its dividend, so we'd buy more.", "hold": "x"}
        out = attach_call_reason(directive, doc=case["doc"], name=case["name"], ticker=case["ticker"], model_reasons=plain)
        self.assertEqual((out["call_reason"], out["call_reason_source"]), (plain["add"], "model"))

    def test_a_failing_fallback_never_costs_the_call(self) -> None:
        directive = {"stance": "hold", "execution": "now", "action": {"summary": "x"}}
        with patch("backend.call_reason.compose_fallback_reason", side_effect=RuntimeError("boom")):
            self.assertIs(attach_call_reason(directive, doc={}, name="Acme", ticker="ACME"), directive)
        self.assertEqual(attach_call_reason({"stance": "unknown"}, doc={}, name="A", ticker="A"), {"stance": "unknown"})

    def test_readers_prefer_the_specific_reason(self) -> None:
        self.assertEqual(call_reason_text({"call_reason": "Apple beat.", "action": {"summary": "old"}}), "Apple beat.")
        self.assertEqual(call_reason_text({"action": {"summary": "old"}}), "old")
        self.assertEqual(call_reason_text(None), "")

    def test_no_news_doc_carries_the_model_reason(self) -> None:
        reasons = {
            "add": "Nvidia's data-center demand keeps growing with no bad news since, so we'd buy more.",
            "hold": "Nvidia has no fresh news and earnings come on Nov 17, so we'd hold rather than add.",
            "trim": "Nvidia has no fresh news to offset the board investigation, so we wouldn't buy more.",
        }
        brief = _brief(body="Coverage is quiet.", call_reasons=reasons)
        brief.pop("key_findings")

        class Store:
            def get_stock_intelligence_doc(self, *_args):
                return None

            def get_daily_anomaly_ticker_docs_batch(self, *_args):
                return {}

        with patch.dict(os.environ, {"CALL_ENGINE_MODE": "off"}), patch(
            "backend.stock_intelligence.generate_no_news_brief", return_value=copy.deepcopy(brief)
        ):
            doc = build_no_news_intelligence_doc(
                instrument={"instrument_id": "US_NVDA", "ticker": "NVDA", "name": "NVIDIA Corporation"},
                market="US",
                universe_id="us_core_155",
                latest_price_doc={"quote": {"current": 168.79, "day_change_pct": 0.4}},
                technical_doc=None,
                intel_pro_doc=None,
                store=Store(),
            )
        assert doc is not None
        directive = doc["directive_v2"]
        self.assertEqual(directive["call_reason_source"], "model")
        self.assertEqual(directive["call_reason"], reasons[bucket_for(directive["stance"])])
        self.assertIn("summary", directive["action"])


if __name__ == "__main__":
    unittest.main()
