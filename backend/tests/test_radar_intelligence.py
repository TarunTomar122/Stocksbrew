from __future__ import annotations

import unittest

from backend.radar_intelligence import (
    MAX_INBOX_ITEMS,
    STALE_AFTER_HOURS,
    Citation,
    PortfolioPosition,
    ProseValidationResult,
    RadarEvent,
    StockState,
    build_personalized_inbox,
    build_quiet_summary,
    compute_event_id,
    derive_candidate_state,
    generate_events,
    normalize_evidence,
    process_evidence,
    process_portfolio,
    rank_inbox,
    reduce_state,
    render_prose,
    validate_prose,
)

DAY1 = "2026-07-01T14:30:00+00:00"
DAY2 = "2026-07-02T14:30:00+00:00"
DAY3 = "2026-07-03T14:30:00+00:00"


def make_evidence(kind: str, ticker: str, occurred_at: str, payload: dict, **overrides) -> dict:
    record = {
        "kind": kind,
        "ticker": ticker,
        "occurred_at": occurred_at,
        "source": overrides.pop("source", "TestSource"),
        "citation_title": overrides.pop("citation_title", f"{kind} update for {ticker}"),
        "citation_url": overrides.pop("citation_url", "https://example.com/note"),
        "payload": payload,
    }
    record.update(overrides)
    return record


class NormalizeEvidenceTests(unittest.TestCase):
    def test_normalizes_a_well_formed_record(self) -> None:
        raw = make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 32.5})
        evidence = normalize_evidence(raw)
        self.assertIsNotNone(evidence)
        self.assertEqual(evidence.ticker, "AAPL")
        self.assertEqual(evidence.kind, "rsi")
        self.assertEqual(evidence.payload["rsi_14"], 32.5)
        self.assertTrue(evidence.evidence_id)

    def test_lowercases_ticker_is_upper_cased(self) -> None:
        raw = make_evidence("rsi", "aapl", DAY1, {"rsi_14": 32.5})
        evidence = normalize_evidence(raw)
        self.assertEqual(evidence.ticker, "AAPL")

    def test_rejects_missing_kind(self) -> None:
        raw = make_evidence("", "AAPL", DAY1, {"rsi_14": 32.5})
        self.assertIsNone(normalize_evidence(raw))

    def test_rejects_unknown_kind(self) -> None:
        raw = make_evidence("astrology", "AAPL", DAY1, {"stars": "aligned"})
        self.assertIsNone(normalize_evidence(raw))

    def test_rejects_missing_ticker(self) -> None:
        raw = make_evidence("rsi", "", DAY1, {"rsi_14": 32.5})
        self.assertIsNone(normalize_evidence(raw))

    def test_rejects_invalid_ticker_shape(self) -> None:
        raw = make_evidence("rsi", "not a ticker!", DAY1, {"rsi_14": 32.5})
        self.assertIsNone(normalize_evidence(raw))

    def test_rejects_unparseable_timestamp(self) -> None:
        raw = make_evidence("rsi", "AAPL", "not-a-date", {"rsi_14": 32.5})
        self.assertIsNone(normalize_evidence(raw))

    def test_accepts_date_only_timestamp(self) -> None:
        raw = make_evidence("rsi", "AAPL", "2026-07-01", {"rsi_14": 32.5})
        evidence = normalize_evidence(raw)
        self.assertIsNotNone(evidence)
        self.assertTrue(evidence.occurred_at.startswith("2026-07-01"))

    def test_accepts_zulu_timestamp(self) -> None:
        raw = make_evidence("rsi", "AAPL", "2026-07-01T14:30:00Z", {"rsi_14": 32.5})
        evidence = normalize_evidence(raw)
        self.assertIsNotNone(evidence)

    def test_falls_back_to_bare_value_payload(self) -> None:
        raw = {
            "kind": "rsi",
            "ticker": "AAPL",
            "occurred_at": DAY1,
            "value": 31.0,
            "source": "TestSource",
        }
        evidence = normalize_evidence(raw)
        self.assertIsNotNone(evidence)
        self.assertEqual(evidence.payload["rsi_14"], 31.0)

    def test_deterministic_evidence_id_for_same_input(self) -> None:
        raw = make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 32.5})
        first = normalize_evidence(dict(raw))
        second = normalize_evidence(dict(raw))
        self.assertEqual(first.evidence_id, second.evidence_id)

    def test_explicit_evidence_id_is_preserved(self) -> None:
        raw = make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 32.5}, evidence_id="my-custom-id")
        evidence = normalize_evidence(raw)
        self.assertEqual(evidence.evidence_id, "my-custom-id")

    def test_default_reliability_applied_per_kind(self) -> None:
        raw = make_evidence("filing", "AAPL", DAY1, {"filing_id": "f1", "filing_type": "8-K"})
        evidence = normalize_evidence(raw)
        self.assertGreater(evidence.reliability, 0.9)


class DedupeIdTests(unittest.TestCase):
    def test_same_inputs_produce_same_id(self) -> None:
        first = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        second = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        self.assertEqual(first, second)

    def test_different_discriminators_produce_different_ids(self) -> None:
        first = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        second = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "overbought", "oversold")
        self.assertNotEqual(first, second)

    def test_different_tickers_produce_different_ids(self) -> None:
        first = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        second = compute_event_id("MSFT", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        self.assertNotEqual(first, second)

    def test_different_dates_produce_different_ids(self) -> None:
        first = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-01", "neutral", "oversold")
        second = compute_event_id("AAPL", "rsi_oversold_cross", "2026-07-02", "neutral", "oversold")
        self.assertNotEqual(first, second)


class RsiTransitionTests(unittest.TestCase):
    def _state(self, ticker: str, rsi: float, as_of: str) -> StockState:
        evidence = [normalize_evidence(make_evidence("rsi", ticker, as_of, {"rsi_14": rsi}))]
        return derive_candidate_state(None, ticker, evidence, as_of)

    def test_no_event_without_previous_state(self) -> None:
        candidate = self._state("AAPL", 30.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0}))]
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual(events, [])

    def test_oversold_cross_generates_event(self) -> None:
        previous = self._state("AAPL", 50.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 30.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "rsi_oversold_cross")
        self.assertEqual(events[0].payload["current_rsi"], 30.0)
        self.assertTrue(events[0].citations)

    def test_overbought_cross_generates_event(self) -> None:
        previous = self._state("AAPL", 50.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 75.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "rsi_overbought_cross")

    def test_boundary_value_35_counts_as_oversold(self) -> None:
        previous = self._state("AAPL", 50.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 35.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events[0].kind, "rsi_oversold_cross")

    def test_boundary_value_70_counts_as_overbought(self) -> None:
        previous = self._state("AAPL", 50.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 70.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events[0].kind, "rsi_overbought_cross")

    def test_return_to_neutral_from_oversold(self) -> None:
        previous = self._state("AAPL", 30.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 50.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "rsi_return_to_neutral")
        self.assertEqual(events[0].payload["previous_state"], "oversold")

    def test_return_to_neutral_from_overbought(self) -> None:
        previous = self._state("AAPL", 80.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 55.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "rsi_return_to_neutral")
        self.assertEqual(events[0].payload["previous_state"], "overbought")

    def test_unchanged_state_generates_no_event(self) -> None:
        previous = self._state("AAPL", 30.0, DAY1)
        evidence = [normalize_evidence(make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 28.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])


class AnalystTransitionTests(unittest.TestCase):
    def test_rating_change_detected_as_upgrade(self) -> None:
        previous = StockState(ticker="AAPL", analyst_rating="Hold")
        evidence = [normalize_evidence(make_evidence("analyst_rating", "AAPL", DAY2, {"rating": "Buy"}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "analyst_rating_change")
        self.assertEqual(events[0].payload["direction"], "upgrade")

    def test_rating_change_detected_as_downgrade(self) -> None:
        previous = StockState(ticker="AAPL", analyst_rating="Buy")
        evidence = [normalize_evidence(make_evidence("analyst_rating", "AAPL", DAY2, {"rating": "Hold"}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events[0].payload["direction"], "downgrade")

    def test_no_rating_event_when_unchanged(self) -> None:
        previous = StockState(ticker="AAPL", analyst_rating="Buy")
        evidence = [normalize_evidence(make_evidence("analyst_rating", "AAPL", DAY2, {"rating": "Buy"}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_target_revision_above_threshold_fires(self) -> None:
        previous = StockState(ticker="AAPL", analyst_target=100.0)
        evidence = [normalize_evidence(make_evidence("analyst_target", "AAPL", DAY2, {"target": 110.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "analyst_target_revision")
        self.assertAlmostEqual(events[0].payload["change_pct"], 10.0)

    def test_target_revision_below_threshold_is_suppressed(self) -> None:
        previous = StockState(ticker="AAPL", analyst_target=100.0)
        evidence = [normalize_evidence(make_evidence("analyst_target", "AAPL", DAY2, {"target": 101.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_target_revision_lowered_direction_in_prose(self) -> None:
        previous = StockState(ticker="AAPL", analyst_target=100.0)
        evidence = [normalize_evidence(make_evidence("analyst_target", "AAPL", DAY2, {"target": 85.0}))]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertIn("lowered", events[0].what_changed)

    def test_no_target_event_on_first_observation(self) -> None:
        evidence = [normalize_evidence(make_evidence("analyst_target", "AAPL", DAY1, {"target": 100.0}))]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual(events, [])


class EarningsTransitionTests(unittest.TestCase):
    def test_upcoming_fires_on_first_sighting(self) -> None:
        evidence = [
            normalize_evidence(
                make_evidence("earnings_upcoming", "AAPL", DAY1, {"earnings_date": "2026-07-15"})
            )
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "earnings_upcoming")

    def test_upcoming_does_not_refire_for_same_date(self) -> None:
        previous = StockState(ticker="AAPL", earnings_status="upcoming", earnings_date="2026-07-15")
        evidence = [
            normalize_evidence(
                make_evidence("earnings_upcoming", "AAPL", DAY2, {"earnings_date": "2026-07-15"})
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_upcoming_refires_when_date_changes(self) -> None:
        previous = StockState(ticker="AAPL", earnings_status="upcoming", earnings_date="2026-07-15")
        evidence = [
            normalize_evidence(
                make_evidence("earnings_upcoming", "AAPL", DAY2, {"earnings_date": "2026-07-22"})
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].payload["earnings_date"], "2026-07-22")

    def test_results_fire_on_upcoming_to_reported_transition(self) -> None:
        previous = StockState(ticker="AAPL", earnings_status="upcoming", earnings_date="2026-07-15")
        evidence = [
            normalize_evidence(
                make_evidence(
                    "earnings_result",
                    "AAPL",
                    DAY2,
                    {"eps_actual": 1.50, "eps_estimate": 1.30},
                )
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "earnings_results")
        self.assertEqual(events[0].payload["result_label"], "beat")

    def test_results_do_not_refire_once_reported(self) -> None:
        previous = StockState(ticker="AAPL", earnings_status="reported")
        evidence = [
            normalize_evidence(
                make_evidence(
                    "earnings_result", "AAPL", DAY2, {"eps_actual": 1.5, "eps_estimate": 1.3}
                )
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_miss_label_for_earnings_below_estimate(self) -> None:
        previous = StockState(ticker="AAPL", earnings_status="upcoming")
        evidence = [
            normalize_evidence(
                make_evidence(
                    "earnings_result", "AAPL", DAY2, {"eps_actual": 1.1, "eps_estimate": 1.3}
                )
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events[0].payload["result_label"], "miss")

    def test_guidance_raised_fires(self) -> None:
        previous = StockState(ticker="AAPL", guidance_direction="maintained")
        evidence = [
            normalize_evidence(make_evidence("earnings_guidance", "AAPL", DAY2, {"direction": "raised"}))
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "earnings_guidance_change")

    def test_guidance_maintained_does_not_fire(self) -> None:
        previous = StockState(ticker="AAPL", guidance_direction=None)
        evidence = [
            normalize_evidence(make_evidence("earnings_guidance", "AAPL", DAY2, {"direction": "maintained"}))
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_guidance_same_direction_twice_does_not_refire(self) -> None:
        previous = StockState(ticker="AAPL", guidance_direction="lowered")
        evidence = [
            normalize_evidence(make_evidence("earnings_guidance", "AAPL", DAY2, {"direction": "lowered"}))
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])


class FilingTransitionTests(unittest.TestCase):
    def test_recent_filing_fires_on_first_sighting(self) -> None:
        evidence = [
            normalize_evidence(
                make_evidence("filing", "AAPL", DAY2, {"filing_id": "new-filing", "filing_type": "8-K"})
            )
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY2)
        events = generate_events(None, candidate, evidence, DAY2)
        self.assertEqual([event.kind for event in events], ["filing_catalyst"])
        self.assertEqual(events[0].evidence_refs, (evidence[0].evidence_id,))

    def test_new_filing_fires_catalyst_event(self) -> None:
        previous = StockState(ticker="AAPL", last_filing_id="old-filing")
        evidence = [
            normalize_evidence(
                make_evidence("filing", "AAPL", DAY2, {"filing_id": "new-filing", "filing_type": "8-K"})
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "filing_catalyst")

    def test_same_filing_id_does_not_refire(self) -> None:
        previous = StockState(ticker="AAPL", last_filing_id="filing-1")
        evidence = [
            normalize_evidence(
                make_evidence("filing", "AAPL", DAY2, {"filing_id": "filing-1", "filing_type": "8-K"})
            )
        ]
        candidate = derive_candidate_state(previous, "AAPL", evidence, DAY2)
        events = generate_events(previous, candidate, evidence, DAY2)
        self.assertEqual(events, [])

    def test_filing_event_fires_on_first_observation(self) -> None:
        evidence = [
            normalize_evidence(
                make_evidence("filing", "AAPL", DAY1, {"filing_id": "filing-1", "filing_type": "8-K"})
            )
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual([event.kind for event in events], ["filing_catalyst"])


class AbnormalPriceMoveTests(unittest.TestCase):
    def test_fires_when_evidence_backed_explanation_exists(self) -> None:
        evidence = [
            normalize_evidence(make_evidence("price_move", "AAPL", DAY1, {"day_change_pct": 8.0})),
            normalize_evidence(
                make_evidence(
                    "filing", "AAPL", DAY1, {"filing_id": "f1", "filing_type": "8-K"}, source="SEC EDGAR"
                )
            ),
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        event = next(event for event in events if event.kind == "abnormal_price_move")
        self.assertTrue(event.citations)

    def test_does_not_fire_without_explanation(self) -> None:
        evidence = [
            normalize_evidence(make_evidence("price_move", "AAPL", DAY1, {"day_change_pct": 9.0})),
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual(events, [])

    def test_does_not_fire_below_threshold_even_with_explanation(self) -> None:
        evidence = [
            normalize_evidence(make_evidence("price_move", "AAPL", DAY1, {"day_change_pct": 1.5})),
            normalize_evidence(make_evidence("analyst_rating", "AAPL", DAY1, {"rating": "Buy"})),
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        self.assertEqual(events, [])

    def test_explanation_must_be_same_day(self) -> None:
        evidence = [
            normalize_evidence(make_evidence("price_move", "AAPL", DAY3, {"day_change_pct": 8.0})),
            normalize_evidence(make_evidence("analyst_rating", "AAPL", DAY1, {"rating": "Buy"})),
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY3)
        events = generate_events(None, candidate, evidence, DAY3)
        self.assertEqual(events, [])

    def test_fires_regardless_of_missing_previous_state(self) -> None:
        # Abnormal moves are same-day facts and should not require a baseline.
        evidence = [
            normalize_evidence(make_evidence("price_move", "AAPL", DAY1, {"day_change_pct": -6.0})),
            normalize_evidence(make_evidence("earnings_result", "AAPL", DAY1, {"eps_actual": 0.5, "eps_estimate": 1.0})),
        ]
        candidate = derive_candidate_state(None, "AAPL", evidence, DAY1)
        events = generate_events(None, candidate, evidence, DAY1)
        event = next(event for event in events if event.kind == "abnormal_price_move")
        self.assertIn("down", event.what_changed)


class DedupeAndRecurringFactTests(unittest.TestCase):
    def test_static_unchanged_state_produces_no_events_across_days(self) -> None:
        previous = StockState(ticker="AAPL")
        raw_day1 = [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})]
        result1 = process_evidence(previous, raw_day1, "AAPL", DAY1)
        self.assertEqual(len(result1.events), 1)

        raw_day2 = [make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 29.0})]
        result2 = process_evidence(result1.state, raw_day2, "AAPL", DAY2)
        self.assertEqual(result2.events, ())

        raw_day3 = [make_evidence("rsi", "AAPL", DAY3, {"rsi_14": 28.0})]
        result3 = process_evidence(result2.state, raw_day3, "AAPL", DAY3)
        self.assertEqual(result3.events, ())

    def test_replaying_the_same_batch_is_idempotent(self) -> None:
        previous = StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral")
        raw = [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})]

        first = process_evidence(previous, raw, "AAPL", DAY1)
        self.assertEqual(len(first.events), 1)

        # Same previous state, same evidence, same day: replaying should not
        # produce a second copy of the same event once folded into state.
        second = process_evidence(first.state, raw, "AAPL", DAY1)
        self.assertEqual(second.events, ())
        self.assertIn(first.events[0].event_id, first.state.seen_event_ids)

    def test_seen_event_ids_are_capped(self) -> None:
        state = StockState(ticker="AAPL", seen_event_ids=tuple(f"evt_{i}" for i in range(300)))
        candidate = derive_candidate_state(state, "AAPL", [], DAY1)
        reduced = reduce_state(state, candidate, [], DAY1)
        self.assertLessEqual(len(reduced.seen_event_ids), 200)


class ProseValidationTests(unittest.TestCase):
    def test_engine_generated_prose_is_always_valid(self) -> None:
        previous = StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral")
        raw = [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})]
        result = process_evidence(previous, raw, "AAPL", DAY1)
        event = result.events[0]
        validation = validate_prose(
            event.what_changed, event.why_it_matters, event.next_trigger, event.citations, event.payload
        )
        self.assertTrue(validation.is_valid, validation.issues)

    def test_valid_prose_has_no_issues(self) -> None:
        citations = (Citation(source="Zacks", title="Zacks note", url="https://example.com", occurred_at=DAY1),)
        payload = {"current_rsi": 32.5}
        result = validate_prose(
            "AAPL's RSI dropped to 32.5.",
            "This is worth watching for AAPL.",
            "Watching for AAPL's RSI to recover.",
            citations,
            payload,
        )
        self.assertTrue(result.is_valid)
        self.assertEqual(result.issues, ())

    def test_flags_missing_evidence(self) -> None:
        result = validate_prose("AAPL moved.", "It matters.", "Watch it.", (), {})
        self.assertFalse(result.is_valid)
        self.assertIn("missing_evidence", result.issues)

    def test_flags_ai_like_filler(self) -> None:
        citations = (Citation(source="Zacks", title="note", url="", occurred_at=DAY1),)
        result = validate_prose(
            "In today's fast-paced market, AAPL is moving.",
            "It is important to note this matters.",
            "Stay tuned for more.",
            citations,
            {},
        )
        self.assertFalse(result.is_valid)
        self.assertIn("ai_like_filler", result.issues)

    def test_flags_unsupported_action(self) -> None:
        citations = (Citation(source="Zacks", title="note", url="", occurred_at=DAY1),)
        result = validate_prose(
            "AAPL is oversold.",
            "You should buy AAPL right now.",
            "Watch AAPL.",
            citations,
            {},
        )
        self.assertFalse(result.is_valid)
        self.assertIn("unsupported_action", result.issues)

    def test_flags_unsupported_number(self) -> None:
        citations = (Citation(source="Zacks", title="note", url="", occurred_at=DAY1),)
        payload = {"current_rsi": 32.5}
        result = validate_prose(
            "AAPL's RSI dropped to 32.5.",
            "Analysts see 412% upside from here.",
            "Watching for AAPL.",
            citations,
            payload,
        )
        self.assertFalse(result.is_valid)
        self.assertIn("unsupported_number", result.issues)

    def test_numbers_from_citations_are_supported(self) -> None:
        citations = (
            Citation(source="Reuters", title="AAPL surges 12% on filing news", url="", occurred_at=DAY1),
        )
        payload = {"day_change_pct": 12.0}
        result = validate_prose(
            "AAPL moved 12.0% today.",
            "This lines up with AAPL surges 12% on filing news.",
            "Watching AAPL.",
            citations,
            payload,
        )
        self.assertTrue(result.is_valid, result.issues)

    def test_rsi_domain_constants_are_always_supported(self) -> None:
        citations = (Citation(source="Zacks", title="note", url="", occurred_at=DAY1),)
        payload = {"current_rsi": 32.5}
        result = validate_prose(
            "AAPL's 14-day RSI dropped to 32.5.",
            "Watching the 35-70 neutral range.",
            "Watching for AAPL's RSI to climb back above 35.",
            citations,
            payload,
        )
        self.assertTrue(result.is_valid, result.issues)


class HumanSoundingFallbackTests(unittest.TestCase):
    def test_rendered_prose_mentions_ticker_and_has_no_filler(self) -> None:
        payload = {"current_rsi": 32.5, "previous_state": "neutral", "current_state": "oversold"}
        citations = (Citation(source="Zacks", title="AAPL RSI update", url="https://example.com", occurred_at=DAY1),)
        what, why, next_trigger = render_prose("rsi_oversold_cross", "AAPL", payload, citations)

        for text in (what, why, next_trigger):
            self.assertIn("AAPL", text)
            lowered = text.lower()
            for banned in ("as an ai", "in today's fast-paced", "delve into", "unprecedented", "game changer"):
                self.assertNotIn(banned, lowered)

        result = validate_prose(what, why, next_trigger, citations, payload)
        self.assertTrue(result.is_valid, result.issues)

    def test_fallback_fields_are_deterministic(self) -> None:
        payload = {"previous_target": 100.0, "current_target": 110.0, "change_pct": 10.0}
        citations = (Citation(source="Morgan Stanley", title="target raise", url="", occurred_at=DAY1),)
        first = render_prose("analyst_target_revision", "AAPL", payload, citations)
        second = render_prose("analyst_target_revision", "AAPL", payload, citations)
        self.assertEqual(first, second)

    def test_all_generated_event_kinds_pass_validation(self) -> None:
        scenarios = [
            (
                StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral"),
                [make_evidence("rsi", "AAPL", DAY2, {"rsi_14": 30.0})],
            ),
            (
                StockState(ticker="AAPL", analyst_rating="Hold"),
                [make_evidence("analyst_rating", "AAPL", DAY2, {"rating": "Buy"})],
            ),
            (
                StockState(ticker="AAPL", analyst_target=100.0),
                [make_evidence("analyst_target", "AAPL", DAY2, {"target": 120.0})],
            ),
            (
                None,
                [make_evidence("earnings_upcoming", "AAPL", DAY1, {"earnings_date": "2026-07-15"})],
            ),
            (
                StockState(ticker="AAPL", earnings_status="upcoming"),
                [make_evidence("earnings_result", "AAPL", DAY2, {"eps_actual": 2.0, "eps_estimate": 1.5})],
            ),
            (
                StockState(ticker="AAPL", guidance_direction="maintained"),
                [make_evidence("earnings_guidance", "AAPL", DAY2, {"direction": "raised"})],
            ),
            (
                StockState(ticker="AAPL", last_filing_id="old"),
                [make_evidence("filing", "AAPL", DAY2, {"filing_id": "new", "filing_type": "8-K"})],
            ),
            (
                None,
                [
                    make_evidence("price_move", "AAPL", DAY1, {"day_change_pct": 7.0}),
                    make_evidence("analyst_rating", "AAPL", DAY1, {"rating": "Buy"}),
                ],
            ),
        ]
        for previous, raw in scenarios:
            result = process_evidence(previous, raw, "AAPL", raw[-1]["occurred_at"])
            self.assertEqual(len(result.events), 1, msg=raw)
            event = result.events[0]
            validation = validate_prose(
                event.what_changed, event.why_it_matters, event.next_trigger, event.citations, event.payload
            )
            self.assertTrue(validation.is_valid, msg=(event.kind, validation.issues))


class RankingTests(unittest.TestCase):
    def _event(self, ticker: str, materiality: float, confidence: float, novelty: float, occurred_at: str, kind: str = "rsi_oversold_cross") -> RadarEvent:
        citations = (Citation(source="Test", title="note", url="", occurred_at=occurred_at),)
        payload = {"current_rsi": 30.0}
        return RadarEvent(
            event_id=f"evt_{ticker}_{kind}_{occurred_at}",
            ticker=ticker,
            kind=kind,
            occurred_at=occurred_at,
            materiality=materiality,
            confidence=confidence,
            novelty=novelty,
            payload=payload,
            citations=citations,
            what_changed=f"{ticker} changed.",
            why_it_matters=f"Matters for {ticker}.",
            next_trigger=f"Watching {ticker}.",
        )

    def test_ranking_orders_by_score_descending(self) -> None:
        positions = [
            PortfolioPosition(ticker="AAPL", position_type="watch", weight_pct=10.0),
            PortfolioPosition(ticker="MSFT", position_type="watch", weight_pct=10.0),
        ]
        low = self._event("AAPL", materiality=40.0, confidence=50.0, novelty=50.0, occurred_at=DAY1)
        high = self._event("MSFT", materiality=90.0, confidence=90.0, novelty=90.0, occurred_at=DAY1)
        items = rank_inbox([low, high], positions, DAY1)
        self.assertEqual([item.event.ticker for item in items], ["MSFT", "AAPL"])
        self.assertEqual(items[0].rank, 1)
        self.assertEqual(items[1].rank, 2)

    def test_position_type_boosts_score(self) -> None:
        positions_long = [PortfolioPosition(ticker="AAPL", position_type="long", weight_pct=0.0)]
        positions_watch = [PortfolioPosition(ticker="AAPL", position_type="watch", weight_pct=0.0)]
        event = self._event("AAPL", materiality=60.0, confidence=60.0, novelty=60.0, occurred_at=DAY1)

        long_items = rank_inbox([event], positions_long, DAY1)
        watch_items = rank_inbox([event], positions_watch, DAY1)
        self.assertGreater(long_items[0].score, watch_items[0].score)

    def test_inbox_keeps_only_the_strongest_event_per_ticker(self) -> None:
        positions = [
            PortfolioPosition(ticker="AAPL", position_type="long", weight_pct=50.0),
            PortfolioPosition(ticker="MSFT", position_type="long", weight_pct=50.0),
        ]
        weak_aapl = self._event("AAPL", 40, 60, 50, DAY1, "rsi_return_to_neutral")
        strong_aapl = self._event("AAPL", 90, 90, 90, DAY1, "earnings_results")
        msft = self._event("MSFT", 60, 70, 70, DAY1)
        items = rank_inbox([weak_aapl, strong_aapl, msft], positions, DAY1)
        self.assertEqual([item.event.ticker for item in items], ["AAPL", "MSFT"])
        self.assertEqual(items[0].event.kind, "earnings_results")

    def test_portfolio_weight_boosts_score(self) -> None:
        heavy = [PortfolioPosition(ticker="AAPL", position_type="watch", weight_pct=50.0)]
        light = [PortfolioPosition(ticker="AAPL", position_type="watch", weight_pct=0.0)]
        event = self._event("AAPL", materiality=60.0, confidence=60.0, novelty=60.0, occurred_at=DAY1)

        heavy_items = rank_inbox([event], heavy, DAY1)
        light_items = rank_inbox([event], light, DAY1)
        self.assertGreater(heavy_items[0].score, light_items[0].score)

    def test_only_events_for_held_tickers_are_ranked(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        event = self._event("TSLA", materiality=90.0, confidence=90.0, novelty=90.0, occurred_at=DAY1)
        items = rank_inbox([event], positions, DAY1)
        self.assertEqual(items, ())

    def test_low_novelty_events_are_suppressed(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        event = self._event("AAPL", materiality=90.0, confidence=90.0, novelty=5.0, occurred_at=DAY1)
        items = rank_inbox([event], positions, DAY1)
        self.assertEqual(items, ())

    def test_stale_events_are_excluded(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        as_of = "2026-07-10T00:00:00+00:00"
        stale_occurred_at = "2026-07-01T00:00:00+00:00"  # well beyond STALE_AFTER_HOURS
        self.assertGreaterEqual((9 * 24), STALE_AFTER_HOURS / 24)
        event = self._event("AAPL", materiality=95.0, confidence=95.0, novelty=95.0, occurred_at=stale_occurred_at)
        items = rank_inbox([event], positions, as_of)
        self.assertEqual(items, ())

    def test_fresh_events_are_not_excluded(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        as_of = "2026-07-10T00:00:00+00:00"
        fresh_occurred_at = "2026-07-09T12:00:00+00:00"
        event = self._event("AAPL", materiality=95.0, confidence=95.0, novelty=95.0, occurred_at=fresh_occurred_at)
        items = rank_inbox([event], positions, as_of)
        self.assertEqual(len(items), 1)

    def test_max_3_cap_is_enforced(self) -> None:
        positions = [PortfolioPosition(ticker=t, position_type="watch") for t in ["AAA", "BBB", "CCC", "DDD", "EEE"]]
        events = [
            self._event(t, materiality=90.0 - i, confidence=90.0, novelty=90.0, occurred_at=DAY1)
            for i, t in enumerate(["AAA", "BBB", "CCC", "DDD", "EEE"])
        ]
        items = rank_inbox(events, positions, DAY1)
        self.assertEqual(len(items), MAX_INBOX_ITEMS)
        self.assertEqual(len(items), 3)
        self.assertEqual([item.event.ticker for item in items], ["AAA", "BBB", "CCC"])

    def test_max_items_override_still_capped_by_argument(self) -> None:
        positions = [PortfolioPosition(ticker=t, position_type="watch") for t in ["AAA", "BBB"]]
        events = [
            self._event(t, materiality=90.0, confidence=90.0, novelty=90.0, occurred_at=DAY1)
            for t in ["AAA", "BBB"]
        ]
        items = rank_inbox(events, positions, DAY1, max_items=1)
        self.assertEqual(len(items), 1)


class QuietStateTests(unittest.TestCase):
    def test_quiet_summary_when_no_positions(self) -> None:
        summary = build_quiet_summary([], [], DAY1)
        self.assertEqual(summary.tickers_checked, ())
        self.assertTrue(summary.headline)
        self.assertTrue(summary.body)

    def test_quiet_summary_lists_holding_weak_stretch(self) -> None:
        states = [
            StockState(ticker="AAPL", rsi_14=38.0),
            StockState(ticker="MSFT", rsi_14=50.0),
        ]
        positions = [PortfolioPosition(ticker="AAPL", position_type="long")]
        summary = build_quiet_summary(states, positions, DAY1)
        self.assertIn("AAPL", summary.body)
        self.assertIn("weak stretch on a holding", summary.body)

    def test_quiet_summary_omits_watchlist_from_brief(self) -> None:
        states = [StockState(ticker="AAPL", rsi_14=38.0)]
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        summary = build_quiet_summary(states, positions, DAY1)
        self.assertNotIn("buy zone", summary.body)
        self.assertIn("No material moves", summary.body)

    def test_quiet_summary_is_deterministic(self) -> None:
        states = [StockState(ticker="AAPL", rsi_14=50.0), StockState(ticker="MSFT", rsi_14=52.0)]
        positions = [
            PortfolioPosition(ticker="AAPL", position_type="watch"),
            PortfolioPosition(ticker="MSFT", position_type="watch"),
        ]
        first = build_quiet_summary(states, positions, DAY1)
        second = build_quiet_summary(states, positions, DAY1)
        self.assertEqual(first, second)

    def test_build_personalized_inbox_falls_back_to_quiet_summary(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        states = [StockState(ticker="AAPL", rsi_14=50.0, as_of=DAY1)]
        result = build_personalized_inbox([], states, positions, DAY1)
        self.assertEqual(result.items, ())
        self.assertIsNotNone(result.quiet_summary)
        self.assertEqual(result.quiet_summary.tickers_checked, ("AAPL",))

    def test_build_personalized_inbox_returns_items_when_available(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="long", weight_pct=20.0)]
        previous = StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral")
        raw = [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})]
        result = process_evidence(previous, raw, "AAPL", DAY1)
        states = [result.state]
        inbox = build_personalized_inbox(result.events, states, positions, DAY1)
        self.assertEqual(len(inbox.items), 1)
        self.assertIsNone(inbox.quiet_summary)


class EndToEndPortfolioTests(unittest.TestCase):
    def test_process_portfolio_produces_ranked_inbox(self) -> None:
        positions = [
            PortfolioPosition(ticker="AAPL", position_type="long", weight_pct=25.0),
            PortfolioPosition(ticker="MSFT", position_type="watch", weight_pct=5.0),
        ]
        previous_states = {
            "AAPL": StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral"),
            "MSFT": StockState(ticker="MSFT", rsi_14=50.0, rsi_state="neutral"),
        }
        raw_evidence = {
            "AAPL": [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})],
            "MSFT": [make_evidence("rsi", "MSFT", DAY1, {"rsi_14": 52.0})],
        }
        result = process_portfolio(previous_states, raw_evidence, positions, DAY1)
        self.assertIn("AAPL", result.states)
        self.assertIn("MSFT", result.states)
        self.assertEqual(len(result.inbox.items), 1)
        self.assertEqual(result.inbox.items[0].event.ticker, "AAPL")

    def test_process_portfolio_is_quiet_when_nothing_changes(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="watch")]
        previous_states = {"AAPL": StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral")}
        raw_evidence = {"AAPL": [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 51.0})]}
        result = process_portfolio(previous_states, raw_evidence, positions, DAY1)
        self.assertEqual(result.inbox.items, ())
        self.assertIsNotNone(result.inbox.quiet_summary)

    def test_to_dict_round_trips_are_json_shaped(self) -> None:
        positions = [PortfolioPosition(ticker="AAPL", position_type="long", weight_pct=25.0)]
        previous_states = {"AAPL": StockState(ticker="AAPL", rsi_14=50.0, rsi_state="neutral")}
        raw_evidence = {"AAPL": [make_evidence("rsi", "AAPL", DAY1, {"rsi_14": 30.0})]}
        result = process_portfolio(previous_states, raw_evidence, positions, DAY1)
        payload = result.to_dict()
        self.assertIn("states", payload)
        self.assertIn("events", payload)
        self.assertIn("inbox", payload)
        self.assertEqual(payload["inbox"]["items"][0]["rank"], 1)


if __name__ == "__main__":
    unittest.main()
