from datetime import date

from backend.earnings_actuals import fetch_yfinance_quarterly_actuals, pick_actual_for_event
from backend.earnings_copy import earnings_evidence_lines, is_missing_actual_copy
from backend.scripts import build_earnings_intel
from backend.scripts import build_market_events


def test_yfinance_actuals_reject_non_finite_eps(monkeypatch) -> None:
    class Frame:
        empty = False

        def iterrows(self):
            return [
                (
                    "2026-07-09 16:00:00-04:00",
                    {
                        "Reported EPS": float("nan"),
                        "EPS Estimate": 1.5,
                        "Surprise(%)": float("nan"),
                    },
                )
            ]

    class Ticker:
        earnings_dates = Frame()

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", lambda _ticker: Ticker())
    assert fetch_yfinance_quarterly_actuals("DAL") == []


def test_pick_actual_rejects_zero_eps_placeholder() -> None:
    actual = pick_actual_for_event(
        [
            {
                "reported_date": "2026-06-03",
                "reported_eps": 0.0,
                "estimated_eps": 2.39,
                "surprise": -2.39,
                "surprise_pct": -100.0,
            }
        ],
        "2026-06-03",
    )

    assert actual is None


def test_pick_actual_accepts_real_zero_eps_without_placeholder_shape() -> None:
    actual = pick_actual_for_event(
        [
            {
                "reported_date": "2026-06-03",
                "reported_eps": 0.0,
                "estimated_eps": 0.0,
                "surprise": 0.0,
                "surprise_pct": 0.0,
            }
        ],
        "2026-06-03",
    )

    assert actual is not None


def test_rejected_actuals_are_not_visible_to_llm_payload() -> None:
    event = {
        "event_date": "2026-06-03",
        "estimated_eps": 2.39,
        "reported_eps": 0.0,
        "eps_surprise": -2.39,
        "eps_surprise_pct": -100.0,
        "surprise_label": "miss",
        "actuals_reported_date": "2026-06-03",
    }

    actuals = build_earnings_intel._reported_actuals(event)
    prompt_actuals = build_earnings_intel._prompt_reported_actuals(actuals)
    prompt_event = build_earnings_intel._prompt_earnings_event(event, actuals)

    assert actuals["rejected_reason"] == "provider_zero_eps_placeholder"
    assert prompt_actuals == {
        "available": False,
        "note": (
            "Actual reported EPS is not captured yet. Do not state a beat or "
            "miss and do not present the estimate as the reported result."
        ),
    }
    assert "reported_eps" not in prompt_event
    assert "eps_surprise" not in prompt_event
    assert "eps_surprise_pct" not in prompt_event
    assert "surprise_label" not in prompt_event


def test_recent_reporter_instrument_ids_dedupes_and_scopes(monkeypatch) -> None:
    monkeypatch.setattr(
        build_earnings_intel,
        "_universe_instruments_by_ticker",
        lambda _store, _market, _universe_id=None: {
            "AAPL": {"instrument_id": "US_AAPL", "ticker": "AAPL"},
            "MSFT": {"instrument_id": "US_MSFT", "ticker": "MSFT"},
        },
    )
    monkeypatch.setattr(
        build_earnings_intel,
        "_list_recent_events",
        lambda *_args, **_kwargs: [
            {"ticker": "AAPL", "event_date": "2026-06-03"},
            {"ticker": "AAPL", "event_date": "2026-06-02"},
            {"ticker": "ZZZZ", "event_date": "2026-06-03"},
        ],
    )

    ids = build_earnings_intel.recent_reporter_instrument_ids(
        object(),
        "US",
        recent_days=3,
        max_events=10,
    )

    assert ids == ["US_AAPL"]


def test_yfinance_actuals_match_report_date(monkeypatch) -> None:
    class Frame:
        empty = False

        def iterrows(self):
            return [
                (
                    "2026-06-10 16:00:00-04:00",
                    {
                        "Reported EPS": 2.11,
                        "EPS Estimate": 1.96,
                        "Surprise(%)": 7.65,
                    },
                )
            ]

    class Ticker:
        earnings_dates = Frame()

    import yfinance as yf

    monkeypatch.setattr(yf, "Ticker", lambda _ticker: Ticker())
    rows = fetch_yfinance_quarterly_actuals("ORCL")
    actual = pick_actual_for_event(rows, "2026-06-10")
    assert actual is not None
    assert actual["reported_eps"] == 2.11
    assert actual["estimated_eps"] == 1.96


def test_earnings_evidence_skips_missing_actual_disclaimer() -> None:
    facts = {
        "reported_vs_expected": "Actual EPS is not yet available; no beat or miss can be confirmed.",
        "price_reaction": "Stock fell 4.2% on the report day.",
        "guidance_signal": "Management raised full-year cloud growth outlook.",
    }
    assert is_missing_actual_copy(facts["reported_vs_expected"]) is True
    assert earnings_evidence_lines(facts) == [
        "Stock fell 4.2% on the report day.",
        "Management raised full-year cloud growth outlook.",
    ]


def test_market_events_skips_reports_older_than_two_weeks() -> None:
    class Snap:
        def __init__(self, doc_id: str, payload: dict):
            self.id = doc_id
            self._payload = payload

        def to_dict(self):
            return self._payload

    class Collection:
        def stream(self):
            return [
                Snap(
                    "US__US_OLD__latest",
                    {
                        "ticker": "OLD",
                        "instrument_id": "US_OLD",
                        "event_date": "2026-05-20",
                        "generated_at": "2026-05-21T00:00:00+00:00",
                        "report": {"headline": "Old", "summary": "Old"},
                    },
                ),
                Snap(
                    "US__US_NEW__latest",
                    {
                        "ticker": "NEW",
                        "instrument_id": "US_NEW",
                        "event_date": "2026-06-10",
                        "generated_at": "2026-06-11T00:00:00+00:00",
                        "report": {"headline": "New", "summary": "New"},
                    },
                ),
            ]

    class Store:
        db = type("Db", (), {"collection": lambda self, _name: Collection()})()

        def get_latest_prices(self, _ids):
            return {}

    events = build_market_events._events_from_earnings(
        "US",
        Store(),
        10,
        today=date(2026, 6, 12),
    )
    assert [event["ticker"] for event in events] == ["NEW"]


def test_market_events_earnings_evidence_skips_disclaimer(monkeypatch) -> None:
    class Store:
        db = None

        def get_latest_prices(self, _ids):
            return {}

    facts = {
        "reported_vs_expected": "Actual EPS is not yet available.",
        "price_reaction": "Stock rose 3.1% on the report day.",
        "guidance_signal": "Guidance was reiterated.",
    }
    intel_rows = [
        {
            "ticker": "ORCL",
            "instrument_id": "US_ORCL",
            "event_date": "2026-06-10",
            "generated_at": "2026-06-12T00:00:00+00:00",
            "report": {
                "headline": "Oracle update",
                "summary": "Summary",
                "facts": facts,
                "confidence": {"score_0_100": 80},
            },
        }
    ]

    class Snap:
        id = "US__US_ORCL__latest"

        def to_dict(self):
            return intel_rows[0]

    class Collection:
        def stream(self):
            return [Snap()]

    Store.db = type("Db", (), {"collection": lambda self, _name: Collection()})()
    events = build_market_events._events_from_earnings(
        "US",
        Store(),
        5,
        today=date(2026, 6, 12),
    )
    assert events[0]["evidence"] == [
        "Stock rose 3.1% on the report day.",
        "Guidance was reiterated.",
    ]


def test_market_events_ranks_before_final_limit(monkeypatch) -> None:
    events = [
        {
            "ticker": "OLD",
            "instrument_id": "US_OLD",
            "event_date": "2026-06-01",
            "urgency": 96,
            "direction": "positive",
            "generated_at": "2026-06-04T00:00:00+00:00",
        },
        {
            "ticker": "LOW",
            "instrument_id": "US_LOW",
            "event_date": "2026-06-03",
            "urgency": 60,
            "direction": "positive",
            "generated_at": "2026-06-03T21:10:00+00:00",
        },
        {
            "ticker": "HIGH",
            "instrument_id": "US_HIGH",
            "event_date": "2026-06-03",
            "urgency": 95,
            "direction": "negative",
            "generated_at": "2026-06-03T21:00:00+00:00",
        },
    ]

    monkeypatch.setattr(build_market_events, "_events_from_earnings", lambda *_args: events)

    class Store:
        db = None

        def get_active_price_universe(self, _market: str) -> str:
            return "us_core_100"

        def save_stage_watermark(self, **_kwargs) -> None:
            return None

    written = {}

    class Doc:
        def set(self, payload):
            written["payload"] = payload

    class Collection:
        def document(self, _doc_id):
            return Doc()

    Store.db = type("Db", (), {"collection": lambda self, _name: Collection()})()

    payload = build_market_events.build_for_market(Store(), "US", limit=2, earnings_cap=1)

    assert [event["ticker"] for event in payload["events"]] == ["HIGH", "LOW"]
    assert written["payload"]["event_count"] == 2


def _run_build_intel(monkeypatch, capsys, tickers, failing):
    import json
    import sys

    monkeypatch.setattr(build_earnings_intel, "TraceMoneyStore", lambda: object())
    monkeypatch.setattr(
        build_earnings_intel,
        "_universe_instruments_by_ticker",
        lambda *_args, **_kwargs: {t: {"instrument_id": f"US_{t}", "ticker": t} for t in tickers},
    )
    monkeypatch.setattr(
        build_earnings_intel,
        "_list_recent_events",
        lambda **_kwargs: [{"ticker": t, "event_date": "2026-11-20"} for t in tickers],
    )
    monkeypatch.setattr(build_earnings_intel, "_build_input_payload", lambda _s, _m, ticker, *_a: {"ticker": ticker})

    def fake_llm(payload, **_kwargs):
        if payload["ticker"] in failing:
            raise TimeoutError("read timed out")
        return {}

    monkeypatch.setattr(build_earnings_intel, "_llm_synthesize", fake_llm)
    monkeypatch.setattr(build_earnings_intel, "_sanitize_decision_guide", lambda report, _payload: report)
    monkeypatch.setattr(sys, "argv", ["build_earnings_intel", "--all-recent", "--max-events", "30"])
    exit_code = 0
    try:
        build_earnings_intel.main()
    except SystemExit as exc:
        exit_code = exc.code
    out = capsys.readouterr().out
    # The summary is the only JSON in stdout; the progress lines before it are plain text.
    summary = json.loads(out[out.index("\n{") + 1:] if not out.startswith("{") else out)
    return exit_code, summary


def test_build_intel_keeps_going_past_one_failed_stock(monkeypatch, capsys) -> None:
    code, summary = _run_build_intel(monkeypatch, capsys, ["AAA", "BBB", "CCC"], failing={"BBB"})
    assert code == 0
    assert summary["count"] == 2
    assert [f["ticker"] for f in summary["failures"]] == ["BBB"]


def test_build_intel_fails_when_every_stock_fails(monkeypatch, capsys) -> None:
    code, summary = _run_build_intel(monkeypatch, capsys, ["AAA", "BBB"], failing={"AAA", "BBB"})
    assert code == 1
    assert summary["count"] == 0


def test_build_intel_stops_after_failures_in_a_row(monkeypatch, capsys) -> None:
    tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
    code, summary = _run_build_intel(monkeypatch, capsys, tickers, failing={"BBB", "CCC", "DDD", "EEE", "FFF"})
    assert code == 1
    assert summary["count"] == 1
    assert [f["ticker"] for f in summary["failures"]] == ["BBB", "CCC", "DDD"]


def test_build_intel_counts_only_failures_in_a_row(monkeypatch, capsys) -> None:
    tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
    code, summary = _run_build_intel(monkeypatch, capsys, tickers, failing={"AAA", "BBB", "DDD", "EEE"})
    assert code == 0
    assert summary["count"] == 2
    assert len(summary["failures"]) == 4


def test_llm_synthesize_retries_a_hung_call(monkeypatch) -> None:
    from backend.llm_client import LLMWallTimeout

    calls = []

    def fake_post(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise LLMWallTimeout("hung")
        return {"choices": [{"message": {"content": "{}"}}]}

    monkeypatch.setattr(build_earnings_intel, "post_chat_completion", fake_post)
    assert build_earnings_intel._llm_synthesize({"ticker": "AAA"}, model_name="m", prompt_variant="v1") == {}
    assert len(calls) == 2
