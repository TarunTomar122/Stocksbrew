from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from backend import call_engine as ce
from backend import call_engine_pipeline as pipeline
from backend import stock_intelligence
from backend.evidence_history import merge_evidence_history_for_storage
from backend.localdb.firestore import LocalFirestoreClient
from backend.models import Article
from backend.stock_intelligence import (
    STOCK_BRIEF_ENGINE_SYSTEM_PROMPT,
    STOCK_BRIEF_SYSTEM_PROMPT,
    build_no_news_intelligence_doc,
    build_stock_intelligence_docs,
)
from backend.storage import TraceMoneyStore

LEGACY_LABELS = {"Accumulate now", "Accumulate on pullbacks", "Hold here", "Do not add here"}


TODAY = datetime.now(timezone.utc).date()
PRICE = {"price": 199.0, "sigma_daily": 0.02, "sma_50": 190.0, "sma_200": 160.0, "high_252": 240.0, "low_20": 186.0, "ret_1m": 0.03, "ret_5d": 0.0}


def engine_call(percentile: float = 90.0, as_of: date | None = None, model: str = "standard") -> dict:
    """What agentdata/call_scores.py stores in tm_call_engine_state for a ticker.
    ``percentile`` above 66 makes most families vote for (ADD), under 34 against
    (TRIM, with the price under its 200-day average), anything else HOLD."""
    vote = 1 if percentile >= 200 / 3 else -1 if percentile <= 100 / 3 else 0
    families: dict = {}
    for family in ce.FAMILIES[model]:
        families[family] = {"status": "scored", "percentile": percentile, "vote": vote if family != "trend" else 0, "members": {}}
    for family, reason in ce.NOT_SCORED.get(model, {}).items():
        families[family] = {"status": "not_scored", "reason": reason}
    families["insider"] = {"status": "scored", "percentile": None, "vote": 0, "buyers_90d": 0}
    price = PRICE if vote >= 0 else {**PRICE, "sma_200": 230.0}
    call = ce.build_call(day=(as_of or TODAY).isoformat(), model=model, group="Technology", families=families, price=price, universe_size=600)
    call["symbol"] = "NVDA"
    return call


INSTRUMENT = {"instrument_id": "US_NVDA", "market": "US", "ticker": "NVDA", "name": "NVIDIA Corporation", "sector": "Semiconductors"}
LLM_BRIEF = {
    "headline": "Data center demand still leads",
    "body": "Nvidia demand remains constructive.",
    "key_findings": ["Demand remains constructive."],
    "catalyst": "AI server demand",
    "risk": "Sector weakness",
    "thesis": "AI demand still leads",
    "setup_state": "trend",
    "drivers": [{"label": "Server demand", "detail": "Nvidia keeps selling more data center chips, which lifts profit.", "direction": "up", "strength": 4, "horizon": "quarter"}],
    "catalyst_cards": [],
    "risk_cards": [],
}


def article(article_id: str, published_at: str, sentiment: float = 0.5) -> Article:
    return Article(
        id=article_id,
        source_id="nvda-news",
        source_name="News",
        source_kind="publisher",
        market="US",
        title="Nvidia data center demand remains strong",
        url=f"https://example.com/{article_id}",
        summary="Data center demand remains strong.",
        article_overview="Data center demand remains strong.",
        article_key_points=["Data center demand remains strong."],
        published_at=published_at,
        topic_key="stock:US:nvda",
        topic_label="NVDA",
        topic_kind="stock",
        tags=[],
        sector_tags=["semiconductors"],
        stock_candidates=["NVDA"],
        stock_tickers=["NVDA"],
        signal_types=["market_news"],
        bucket_keys=["stock:US:nvda"],
        bucket_labels=["NVDA"],
        bucket_kinds=["stock"],
        entity_mentions=[{"type": "stock", "ticker": "NVDA", "mention_role": "primary"}],
        sentiment_score=sentiment,
        sentiment_label="constructive" if sentiment > 0 else "cautious",
        enrichment_source="llm",
        source_lane="core",
        focus_ticker="NVDA",
    )


class FakeStore:
    """The slice of TraceMoneyStore the builder touches, with call counters."""

    def __init__(self, *, state: dict | None = None, previous_doc: dict | None = None) -> None:
        self.state = state
        self.previous_doc = previous_doc
        self.engine_reads: list[str] = []
        self.saved_history: list[tuple] = []
        self.stock_history: dict[str, list[dict]] = {}
        self.sector_history: dict[str, list[dict]] = {}

    def get_latest_prices(self, _ids: list[str]) -> dict[str, dict]:
        return {"US_NVDA": {"quote": {"current": 199.0, "day_change_pct": -0.5}}}

    def list_stock_intel_pro(self, _market: str, _universe: str) -> list[dict]:
        return []

    def get_latest_stock_technicals_batch(self, _ids: list[str]) -> dict[str, dict]:
        return {}

    def get_sector_regimes(self, _market: str) -> dict:
        return {}

    def get_stock_intelligence_doc(self, _market: str, _universe: str, _instrument_id: str) -> dict | None:
        return self.previous_doc

    # evidence history
    def get_stock_evidence_history(self, _market: str, ids: list[str], _days: int) -> dict:
        return {key: rows for key, rows in self.stock_history.items() if key in ids}

    def get_sector_evidence_history(self, _market: str, slugs: list[str], _days: int) -> dict:
        return {key: rows for key, rows in self.sector_history.items() if key in slugs}

    def save_evidence_history_rows(self, market: str, stock_rows: dict, sector_rows: dict) -> int:
        self.saved_history.append((market, stock_rows, sector_rows))
        self.stock_history.update(stock_rows)
        self.sector_history.update(sector_rows)
        return len(stock_rows) + len(sector_rows)

    # the engine's stored call
    def get_call_engine_state(self, symbol: str) -> dict | None:
        self.engine_reads.append(symbol)
        return self.state


def build(store: FakeStore, mode: str | None, articles: list[Article] | None = None) -> tuple[dict, dict]:
    """Run the news-backed builder with the model mocked. Returns (doc, llm kwargs)."""
    env = {pipeline.MODE_ENV: mode} if mode is not None else {}
    captured: dict = {}

    def fake_llm(**kwargs):
        captured.update(kwargs)
        return dict(LLM_BRIEF)

    with patch.dict(os.environ, env, clear=False):
        if mode is None:
            os.environ.pop(pipeline.MODE_ENV, None)
        with patch("backend.stock_intelligence._llm_synthesize_brief", side_effect=fake_llm):
            docs = build_stock_intelligence_docs(
                "US",
                "us_test_1",
                [INSTRUMENT],
                articles or [article("a1", f"{TODAY.isoformat()}T12:00:00+00:00")],
                store=store,
            )
    return docs[0], captured


class ModeFlagTest(unittest.TestCase):
    def test_default_and_garbage_are_off(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(pipeline.MODE_ENV, None)
            self.assertEqual(pipeline.call_engine_mode(), "off")
        for value, expected in (("", "off"), ("yes", "off"), ("SHADOW", "shadow"), (" on ", "on"), ("off", "off")):
            with patch.dict(os.environ, {pipeline.MODE_ENV: value}):
                self.assertEqual(pipeline.call_engine_mode(), expected)

    def test_engine_is_us_only_and_needs_a_store(self) -> None:
        self.assertFalse(pipeline.EngineContext(FakeStore(), "IN", "shadow").active)
        self.assertIsNone(pipeline.compute_engine_call(pipeline.EngineContext(FakeStore(state=engine_call()), "IN", "on"), INSTRUMENT))
        self.assertFalse(pipeline.EngineContext(None, "US", "on").active)
        self.assertFalse(pipeline.EngineContext(FakeStore(), "US", "off").active)
        self.assertTrue(pipeline.EngineContext(FakeStore(), "US", "shadow").active)


class WiringTest(unittest.TestCase):
    def test_off_never_touches_the_engine(self) -> None:
        store = FakeStore(state=engine_call())
        doc, llm_kwargs = build(store, None)
        self.assertEqual(store.engine_reads, [])
        self.assertNotIn("call_engine", doc)
        self.assertNotIn("call_engine_mode", doc)
        self.assertNotIn("engine_call", llm_kwargs)
        self.assertEqual(doc["directive_v2"]["version"], "v2-shadow-2")

    def test_shadow_keeps_the_old_directive_and_adds_the_engine(self) -> None:
        off_doc, _ = build(FakeStore(), "off")
        store = FakeStore(state=engine_call())
        doc, llm_kwargs = build(store, "shadow")
        self.assertEqual(store.engine_reads, ["NVDA"])
        self.assertEqual(doc["directive_v2"], off_doc["directive_v2"])
        self.assertNotIn("engine_call", llm_kwargs)  # the model sees exactly what it saw before
        self.assertEqual(doc["call_engine_mode"], "shadow")
        self.assertEqual(doc["call_engine"]["version"], ce.ENGINE_VERSION)
        self.assertEqual(doc["call_engine"]["call"], "add")
        # every other field of the brief is what "off" produced
        skip = {"call_engine", "call_engine_mode", "generated_at", "as_of", "run_context"}
        self.assertEqual({k: v for k, v in doc.items() if k not in skip}, {k: v for k, v in off_doc.items() if k not in skip})
        json.dumps(doc["call_engine"])  # storable

    def test_on_lets_the_engine_decide_and_hands_the_call_to_the_model(self) -> None:
        for percentile, stance in ((90.0, "accumulate"), (50.0, "hold"), (10.0, "trim")):
            state = engine_call(percentile)
            doc, llm_kwargs = build(FakeStore(state=state), "on")
            directive = doc["directive_v2"]
            self.assertEqual(llm_kwargs["engine_call"]["call"], state["call"])
            self.assertEqual(directive["version"], ce.ENGINE_VERSION)
            self.assertEqual(directive["stance"], stance)
            self.assertIn(directive["action"]["label"], LEGACY_LABELS)
            self.assertEqual(directive["confidence"], state["confidence"]["label"])
            self.assertEqual(directive["zones"].get("trim_above"), state["zones"].get("trim_above"))
            # the model's sentences are still the evidence text
            self.assertTrue(any("data center chips" in item["text"] for item in directive["evidence"]))
            self.assertNotIn("call_engine_fallback", doc)

    def test_on_falls_back_when_there_is_no_usable_engine_call(self) -> None:
        stale = engine_call(as_of=TODAY - timedelta(days=12))
        other_version = {**engine_call(), "version": "call-engine-1"}
        for state in (None, stale, other_version, {"version": ce.ENGINE_VERSION}, "garbage"):
            doc, llm_kwargs = build(FakeStore(state=state), "on")
            self.assertEqual(doc["directive_v2"]["version"], "v2-shadow-2")
            self.assertNotIn("engine_call", llm_kwargs)
            self.assertNotIn("call_engine", doc)
            self.assertIn("call_engine_fallback", doc)
        shadow, _ = build(FakeStore(state=None), "shadow")
        self.assertNotIn("call_engine", shadow)
        self.assertNotIn("call_engine_fallback", shadow)

    def test_a_failing_state_read_never_breaks_the_brief(self) -> None:
        store = FakeStore()
        store.get_call_engine_state = lambda _symbol: (_ for _ in ()).throw(RuntimeError("db down"))  # type: ignore[method-assign]
        doc, _ = build(store, "on")
        self.assertEqual(doc["directive_v2"]["version"], "v2-shadow-2")

    def test_no_news_doc_follows_the_flag(self) -> None:
        brief = {
            "headline": "Nvidia holds gains",
            "body": "Coverage is quiet.",
            "thesis": "Quiet week",
            "setup_state": "trend",
            "drivers": [{"label": "Growth", "detail": "Revenue growth is strong.", "direction": "up"}],
            "catalyst_cards": [],
            "risk_cards": [],
        }

        def run(mode: str, store: FakeStore) -> dict:
            store.get_daily_anomaly_ticker_docs_batch = lambda _market, _tickers: {}  # type: ignore[attr-defined]
            with patch.dict(os.environ, {pipeline.MODE_ENV: mode}), patch("backend.stock_intelligence.generate_no_news_brief", return_value=brief):
                doc = build_no_news_intelligence_doc(
                    instrument=INSTRUMENT,
                    market="US",
                    universe_id="us_core_100",
                    latest_price_doc={"quote": {"current": 197.76, "day_change_pct": 1.0}},
                    technical_doc=None,
                    intel_pro_doc=None,
                    store=store,
                )
            assert doc is not None
            return doc

        off_store = FakeStore(state=engine_call())
        off = run("off", off_store)
        self.assertEqual(off_store.engine_reads, [])
        self.assertNotIn("call_engine", off)
        shadow = run("shadow", FakeStore(state=engine_call()))
        self.assertEqual(shadow["directive_v2"], off["directive_v2"])
        self.assertIn("call_engine", shadow)
        on = run("on", FakeStore(state=engine_call(10.0)))
        self.assertEqual(on["directive_v2"]["version"], ce.ENGINE_VERSION)
        self.assertEqual(on["directive_v2"]["action"]["label"], "Do not add here")


class PromptTest(unittest.TestCase):
    def call_llm(self, engine_call: dict | None) -> tuple[str, dict]:
        seen: dict = {}

        def fake_post(**kwargs):
            seen.update(kwargs)
            return {"choices": [{"message": {"content": json.dumps(LLM_BRIEF)}}]}

        kwargs = dict(
            ticker="NVDA",
            name="NVIDIA",
            key_points=["Demand remains strong."],
            article_titles=["Nvidia demand"],
            sentiment_label="constructive",
            sentiment_score=70,
            article_count=1,
            source_count=1,
            catalyst="",
            risk="",
            previous_directive={"stance": "hold", "execution": "now", "action": {"label": "Hold here"}},
        )
        if engine_call is not None:
            kwargs["engine_call"] = engine_call
        with patch("backend.stock_intelligence.llm_api_key", return_value="test-key"), patch(
            "backend.stock_intelligence.post_chat_completion", side_effect=fake_post
        ):
            result = stock_intelligence._llm_synthesize_brief(**kwargs)
        self.assertIsNotNone(result)
        return seen["messages"][0]["content"], json.loads(seen["messages"][1]["content"])

    def test_engine_prompt_swaps_only_the_decision_sections(self) -> None:
        self.assertNotIn("DIRECTIVE REASONS", STOCK_BRIEF_ENGINE_SYSTEM_PROMPT)
        self.assertIn("THE CALL IS ALREADY DECIDED", STOCK_BRIEF_ENGINE_SYSTEM_PROMPT)
        self.assertIn("You cannot change it", STOCK_BRIEF_ENGINE_SYSTEM_PROMPT)
        self.assertNotIn("previous_directive", STOCK_BRIEF_ENGINE_SYSTEM_PROMPT)
        for kept in ("PLAIN LANGUAGE - WRITE FOR A NORMAL STOCK OWNER:", "MARKET REGIME - USE IT:", "EVIDENCE DISCIPLINE - THIS IS CRITICAL:", "RECENCY - THIS IS CRITICAL:"):
            self.assertIn(kept, STOCK_BRIEF_ENGINE_SYSTEM_PROMPT)
        self.assertIn("DIRECTIVE REASONS", STOCK_BRIEF_SYSTEM_PROMPT)  # the default prompt is untouched

    def test_without_an_engine_call_the_prompt_and_payload_are_the_old_ones(self) -> None:
        system, payload = self.call_llm(None)
        self.assertIn("DIRECTIVE REASONS - THE FIRST TWO CARDS ARE USER-FACING", system)
        self.assertNotIn("THE CALL IS ALREADY DECIDED", system)
        self.assertNotIn("call", payload)
        self.assertEqual(payload["previous_directive"]["stance"], "hold")

    def test_with_an_engine_call_the_model_is_told_the_call(self) -> None:
        call = pipeline.compute_engine_call(pipeline.EngineContext(FakeStore(state=engine_call()), "US", "on"), INSTRUMENT)
        assert call is not None
        system, payload = self.call_llm(call)
        self.assertIn("THE CALL IS ALREADY DECIDED", system)
        self.assertNotIn("DIRECTIVE REASONS", system)
        self.assertNotIn("previous_directive", payload)
        self.assertEqual(payload["call"]["call"], call["call"].upper())
        self.assertEqual(payload["call"]["decided_by"], "rules")
        self.assertTrue(payload["call"]["reasons"])
        self.assertTrue(payload["call"]["what_would_change_it"])
        self.assertEqual(len(payload["call"]["scorecard"]), 6)
        self.assertEqual(payload["call"]["not_in_the_call"], [])
        self.assertEqual(payload["call"]["rule"], ce.RULE_TEXT)
        self.assertEqual(payload["call"]["votes"]["for"], 4)
        self.assertIn("200-day average", payload["call"]["trend"])
        bank = pipeline.engine_brief_for_prompt(engine_call(model="financial"))
        self.assertEqual(len(bank["not_in_the_call"]), 1)
        self.assertIn("Not scored for banks", bank["not_in_the_call"][0])
        self.assertIn("may not promise outperformance", payload["call"]["limits"].lower())
        self.assertIn("never state or imply a success rate", system)

    def test_a_broken_engine_prompt_falls_back_to_the_old_prompt(self) -> None:
        # If a base-prompt edit moves a section marker, the module still imports
        # and the model gets the old prompt without the call, never a mix.
        with self.assertRaises(ValueError):
            stock_intelligence._engine_stock_brief_prompt("no markers here")
        call = pipeline.compute_engine_call(pipeline.EngineContext(FakeStore(state=engine_call()), "US", "on"), INSTRUMENT)
        with patch("backend.stock_intelligence.STOCK_BRIEF_ENGINE_SYSTEM_PROMPT", ""):
            system, payload = self.call_llm(call)
        self.assertIn("DIRECTIVE REASONS - THE FIRST TWO CARDS ARE USER-FACING", system)
        self.assertNotIn("call", payload)


class EvidenceHistoryFixTest(unittest.TestCase):
    def test_off_by_default_leaves_the_store_untouched(self) -> None:
        store = FakeStore()
        yesterday = (TODAY - timedelta(days=1)).isoformat()
        with mock.patch.dict(os.environ, {"EVIDENCE_HISTORY_MODE": ""}):
            build(store, "off", [article("y1", f"{yesterday}T12:00:00+00:00", -0.6)])
        self.assertEqual(store.saved_history, [])

    @mock.patch.dict(os.environ, {"EVIDENCE_HISTORY_MODE": "on"})
    def test_second_run_sees_the_first_runs_day(self) -> None:
        store = FakeStore()
        yesterday = (TODAY - timedelta(days=1)).isoformat()
        first, _ = build(store, "off", [article("y1", f"{yesterday}T12:00:00+00:00", -0.6)])
        self.assertEqual(first["evidence_history"]["coverage_days"], 1)
        self.assertEqual(first["evidence_history"]["history_status"], "current_only")
        self.assertEqual(len(store.saved_history), 1)
        self.assertEqual([row["day"] for row in store.stock_history["US_NVDA"]], [yesterday])
        self.assertIn("semiconductors", store.sector_history)

        second, _ = build(store, "off", [article("t1", f"{TODAY.isoformat()}T12:00:00+00:00", -0.6)])
        history = second["evidence_history"]
        self.assertEqual(history["coverage_days"], 2)
        self.assertEqual(history["history_status"], "building")
        self.assertEqual([row["day"] for row in history["recent_days"]], [yesterday, TODAY.isoformat()])
        self.assertEqual(second["sector_evidence_history"]["coverage_days"], 2)
        self.assertEqual([row["day"] for row in store.stock_history["US_NVDA"]], [yesterday, TODAY.isoformat()])

    def test_a_store_without_the_methods_still_works(self) -> None:
        class Bare:
            def get_latest_prices(self, _ids):
                return {}

            def list_stock_intel_pro(self, _m, _u):
                return []

            def get_latest_stock_technicals_batch(self, _ids):
                return {}

            def get_sector_regimes(self, _m):
                return {}

            def get_stock_intelligence_doc(self, _m, _u, _i):
                return None

        with patch("backend.stock_intelligence._llm_synthesize_brief", return_value=dict(LLM_BRIEF)):
            docs = build_stock_intelligence_docs("US", "us_test_1", [INSTRUMENT], [article("a1", f"{TODAY.isoformat()}T12:00:00+00:00")], store=Bare())
        self.assertEqual(docs[0]["evidence_history"]["coverage_days"], 1)

    def test_storage_merge_keeps_the_fuller_row_for_a_day(self) -> None:
        full = {"day": "2026-11-09", "article_count": 20, "direction": "negative"}
        thin = {"day": "2026-11-09", "article_count": 2, "direction": "positive"}
        self.assertEqual(merge_evidence_history_for_storage([full], [thin]), [full])
        self.assertEqual(merge_evidence_history_for_storage([thin], [full]), [full])
        rows = [{"day": f"2026-10-{d:02d}", "article_count": 1} for d in range(1, 31)]
        self.assertEqual(len(merge_evidence_history_for_storage(rows, [full], keep_days=5)), 5)


class StorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = object.__new__(TraceMoneyStore)
        self.store.db = LocalFirestoreClient(os.path.join(self.tmp.name, "docs.sqlite3"))

    def test_evidence_history_round_trip(self) -> None:
        recent = (TODAY - timedelta(days=1)).isoformat()
        old = (TODAY - timedelta(days=40)).isoformat()
        written = self.store.save_evidence_history_rows(
            "us",
            {"US_NVDA": [{"day": old, "article_count": 1}, {"day": recent, "article_count": 3, "direction": "negative"}], "US_EMPTY": []},
            {"semiconductors": [{"day": recent, "article_count": 9}]},
        )
        self.assertEqual(written, 2)
        stocks = self.store.get_stock_evidence_history("US", ["US_NVDA", "US_AMD"], 14)
        self.assertEqual(list(stocks), ["US_NVDA"])
        self.assertEqual([row["day"] for row in stocks["US_NVDA"]], [recent])  # the 40-day-old row is outside the window
        self.assertEqual(self.store.get_sector_evidence_history("US", ["semiconductors"], 14)["semiconductors"][0]["article_count"], 9)
        self.assertEqual(self.store.get_stock_evidence_history("US", [], 14), {})
        doc = self.store.db.collection("tm_evidence_history").document("US__stock__US_NVDA").get()
        self.assertTrue(doc.exists)

    def test_real_store_feeds_the_builder_loaders(self) -> None:
        # The builder looks these three names up with getattr(); they must exist.
        for name in ("get_stock_evidence_history", "get_sector_evidence_history", "save_evidence_history_rows"):
            self.assertTrue(callable(getattr(TraceMoneyStore, name, None)), name)

    def test_engine_state_is_read_from_its_collection(self) -> None:
        self.assertIsNone(self.store.get_call_engine_state("NVDA"))
        self.assertIsNone(self.store.get_call_engine_state(""))
        self.store.db.collection("tm_call_engine_state").document("NVDA").set(engine_call())
        state = self.store.get_call_engine_state("nvda")
        assert state is not None
        self.assertEqual(state["call"], "add")
        context = pipeline.EngineContext(self.store, "US", "shadow")
        self.assertEqual(pipeline.compute_engine_call(context, INSTRUMENT)["call"], "add")
        self.assertIsNone(pipeline.compute_engine_call(context, {"ticker": "AMD"}))

    def shadow_doc(self, mode: str) -> dict:
        doc, _ = build(FakeStore(state=engine_call()), mode)
        return doc

    def test_directive_history_gets_engine_fields_only_in_on_mode(self) -> None:
        def history(doc: dict) -> dict:
            self.store.append_directive_history("US", [doc])
            day = str(doc["generated_at"])[:10]
            snap = self.store.db.collection("tm_directive_history").document("US_NVDA").collection("calls").document(day).get()
            return snap.to_dict()

        shadow = history(self.shadow_doc("shadow"))
        self.assertNotIn("engine_rank_pct", shadow)
        self.assertEqual(shadow["directive_version"], "v2-shadow-2")

        doc = self.shadow_doc("on")
        row = history(doc)
        self.assertEqual(row["directive_version"], ce.ENGINE_VERSION)
        self.assertEqual(row["engine_call"], doc["call_engine"]["call"])
        self.assertIsNone(row["engine_rank_pct"])  # v3 has no universe rank
        self.assertEqual(row["engine_votes"], doc["call_engine"]["votes"])
        self.assertEqual(row["engine_score"], doc["call_engine"]["score"])
        self.assertEqual(row["add_below"], doc["call_engine"]["zones"].get("accumulate_below"))
        self.assertEqual(row["trim_above"], doc["call_engine"]["zones"].get("trim_above"))
        self.assertIn("engine_trigger", row)
        self.assertIn("engine_reason", row)
        # the old fields are all still there
        for key in ("stance", "text", "rationale", "confidence", "trigger_type", "trigger_value", "price_at_call", "generated_at"):
            self.assertIn(key, row)


if __name__ == "__main__":
    unittest.main()
