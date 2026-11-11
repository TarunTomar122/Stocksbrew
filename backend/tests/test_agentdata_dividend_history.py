"""Dividend history: parsing Yahoo events, specials, cadence, pay lag and the stored document."""

from datetime import date, datetime, timezone

from backend.agentdata import dividend_history as dh


def stamp(day: str) -> int:
    # Yahoo stamps dividend events at the US open, 14:30 UTC in winter.
    return int(datetime.fromisoformat(f"{day}T14:30:00").replace(tzinfo=timezone.utc).timestamp())


def pay(day: str, amount: float, special: bool = False) -> dict:
    return {"ex_date": day, "amount": amount, "special": special}


def test_parse_events_sorts_merges_and_drops_bad_rows():
    result = {
        "events": {
            "dividends": {
                "b": {"amount": 0.51, "date": stamp("2026-03-14")},
                "a": {"amount": 0.485, "date": stamp("2025-11-29")},
                "zero": {"amount": 0, "date": stamp("2026-01-01")},
                "nodate": {"amount": 0.5},
                "text": "nope",
                # Two events on one day are one payment.
                "c1": {"amount": 0.2, "date": stamp("2026-06-13")},
                "c2": {"amount": 0.3, "date": stamp("2026-06-13") + 60},
            }
        }
    }
    assert dh.parse_events(result) == [
        {"ex_date": "2025-11-29", "amount": 0.485},
        {"ex_date": "2026-03-14", "amount": 0.51},
        {"ex_date": "2026-06-13", "amount": 0.5},
    ]
    assert dh.parse_events(None) == []
    assert dh.parse_events({"events": {}}) == []
    assert dh.parse_events({"events": {"dividends": []}}) == []


def test_specials_are_spikes_and_raises_are_not():
    costco = [
        {"ex_date": "2023-10-26", "amount": 1.02},
        {"ex_date": "2023-12-28", "amount": 15.0},
        {"ex_date": "2024-01-25", "amount": 1.02},
        {"ex_date": "2024-04-25", "amount": 1.16},
    ]
    assert [p["special"] for p in dh.mark_specials(costco)] == [False, True, False, False]

    # NVDA after its 2026 raise: the new level holds, so nothing is special.
    nvda = [
        {"ex_date": "2025-12-04", "amount": 0.01},
        {"ex_date": "2026-03-11", "amount": 0.01},
        {"ex_date": "2026-06-04", "amount": 0.25},
        {"ex_date": "2026-09-10", "amount": 0.25},
    ]
    assert not any(p["special"] for p in dh.mark_specials(nvda))

    # A newest payment that jumps on the usual cadence is read as a raise...
    raise_last = nvda[:3]
    assert not any(p["special"] for p in dh.mark_specials(raise_last))
    # ...but an extra one weeks after the regular payment is a special.
    extra_last = [
        {"ex_date": "2026-01-10", "amount": 0.5},
        {"ex_date": "2026-04-10", "amount": 0.5},
        {"ex_date": "2026-07-10", "amount": 0.5},
        {"ex_date": "2026-07-30", "amount": 5.0},
    ]
    assert [p["special"] for p in dh.mark_specials(extra_last)] == [False, False, False, True]
    assert dh.mark_specials([]) == []
    # The window can start on the special (Costco's $15 in Dec 2023).
    starts_special = [
        {"ex_date": "2023-12-27", "amount": 15.0},
        {"ex_date": "2024-02-01", "amount": 1.02},
        {"ex_date": "2024-04-25", "amount": 1.16},
    ]
    assert [p["special"] for p in dh.mark_specials(starts_special)] == [True, False, False]
    assert [p["special"] for p in dh.mark_specials(starts_special[:2])] == [False, False]
    # Costco in late 2023: the $15 special is the newest payment, nine weeks after a regular one.
    newest_special = [
        {"ex_date": "2023-05-04", "amount": 1.02},
        {"ex_date": "2023-07-27", "amount": 1.02},
        {"ex_date": "2023-10-26", "amount": 1.02},
        {"ex_date": "2023-12-28", "amount": 15.0},
    ]
    assert [p["special"] for p in dh.mark_specials(newest_special)] == [False, False, False, True]
    # A monthly payer's newest payment off its usual size and date is a special too.
    monthly = [{"ex_date": f"2026-{m:02d}-15", "amount": 0.25} for m in range(1, 11)] + [{"ex_date": "2026-10-25", "amount": 2.0}]
    assert dh.mark_specials(monthly)[-1]["special"] is True


def test_infer_frequency():
    today = date(2026, 11, 11)
    quarterly = [pay(d, 0.5) for d in ("2025-02-14", "2025-05-15", "2025-08-14", "2025-11-13", "2026-02-13", "2026-05-14", "2026-08-13")]
    assert dh.infer_frequency(quarterly, today) == ("quarterly", 4)
    monthly = [pay(f"2026-{m:02d}-28", 0.27) for m in range(1, 11)]
    assert dh.infer_frequency(monthly, today) == ("monthly", 12)
    semi = [pay(d, 1.0) for d in ("2025-03-01", "2025-09-01", "2026-03-01", "2026-09-01")]
    assert dh.infer_frequency(semi, today) == ("semiannual", 2)
    annual = [pay(d, 2.0) for d in ("2023-12-01", "2024-12-02", "2025-12-01")]
    assert dh.infer_frequency(annual, today) == ("annual", 1)
    assert dh.infer_frequency([], today) == ("none", None)
    assert dh.infer_frequency([pay("2026-06-01", 1.0)], today) == ("irregular", None)
    # Specials do not count toward the cadence.
    with_special = quarterly + [pay("2026-08-20", 9.0, special=True)]
    assert dh.infer_frequency(with_special, today) == ("quarterly", 4)


def test_pay_lags_reads_only_good_dividend_rows():
    rows = [
        {"kind": "dividend", "ticker": "msft", "date": "2026-11-19", "payment_date": "2026-12-10"},
        {"kind": "dividend", "ticker": "MSFT", "date": "2026-08-20", "payment_date": "2026-09-11"},
        {"kind": "dividend", "ticker": "AAPL", "date": "2026-11-12", "payment_date": None},
        {"kind": "dividend", "ticker": "XOM", "date": "2026-11-12", "payment_date": "2026-11-01"},  # before ex
        {"kind": "dividend", "ticker": "KO", "date": "2026-11-12", "payment_date": "2026-11-30", "superseded": True},
        {"kind": "ipo", "ticker": "NEW", "date": "2026-11-12", "payment_date": "2026-11-30"},
        {"kind": "dividend", "ticker": "BAD", "date": "not a date", "payment_date": "2026-11-30"},
    ]
    assert dh.pay_lags(rows) == {"MSFT": [21, 22]}


def test_build_doc_summarises_the_last_year():
    today = date(2026, 11, 11)
    payments = [
        {"ex_date": "2025-08-14", "amount": 0.83},
        {"ex_date": "2025-11-20", "amount": 0.91},
        {"ex_date": "2026-02-19", "amount": 0.91},
        {"ex_date": "2026-05-21", "amount": 0.91},
        {"ex_date": "2026-08-20", "amount": 0.91},
        {"ex_date": "2026-11-19", "amount": 0.98},
    ]
    doc = dh.build_doc("MSFT", payments, today=today, years=3, lags=[21, 22, 20], now_iso="2026-11-11T00:00:00Z")
    assert doc["frequency"] == "quarterly" and doc["per_year"] == 4
    # Ex-dates after 2025-11-11: Nov 20, Feb 19, May 21, Aug 20, Nov 19 (an announced one already in Yahoo's list).
    assert doc["ttm_count"] == 5
    assert doc["latest_amount"] == 0.98
    assert doc["year_ago_amount"] == 0.91
    assert doc["pay_lag_days"] == 21 and doc["pay_lag_samples"] == 3
    assert doc["first_ex_date"] == "2025-08-14" and doc["last_ex_date"] == "2026-11-19"
    assert all(p["special"] is False for p in doc["payments"])


def test_build_doc_skips_the_year_ago_base_when_the_cadence_changed():
    # Quarterly at $0.75, then monthly at $0.25: the same money a year, not a cut.
    payments = [{"ex_date": d, "amount": 0.75} for d in ("2025-08-01", "2025-11-01", "2026-02-01")]
    payments += [{"ex_date": f"2026-{m:02d}-01", "amount": 0.25} for m in range(5, 11)]
    doc = dh.build_doc("SWAP", payments, today=date(2026, 11, 11), years=3, lags=None, now_iso="x")
    assert doc["latest_amount"] == 0.25
    assert doc["year_ago_amount"] is None


def test_build_doc_for_a_stock_that_pays_nothing():
    doc = dh.build_doc("AMZN", [], today=date(2026, 11, 11), years=3, lags=None, now_iso="x")
    assert doc["count"] == 0 and doc["payments"] == []
    assert doc["frequency"] == "none" and doc["per_year"] is None
    assert doc["ttm_amount"] == 0.0 and doc["latest_amount"] is None and doc["pay_lag_days"] is None


class FakeStore:
    def __init__(self, existing=None):
        self.writes = []
        self._db = None
        self.existing = existing or {}

    def get(self, path):
        return self.existing.get(path)

    def set_many(self, docs):
        docs = list(docs)
        self.writes.extend(docs)
        return len(docs)

    def _request(self, method, path, body):
        assert path == "/query" and body["collection"] == "tm_agent_calendar"
        assert {"field": "date", "op": ">=", "value": body["filters"][1]["value"]} in body["filters"]
        return {"documents": [{"path": "tm_agent_calendar/div_KO", "data": {"kind": "dividend", "ticker": "KO", "date": "2026-11-28", "payment_date": "2026-12-15"}}]}


def test_run_writes_only_its_own_collection_and_skips_missing(monkeypatch):
    charts = {
        "KO": {"timestamp": [1], "events": {"dividends": {"a": {"amount": 0.51, "date": stamp("2026-09-12")}}}},
        "AMZN": {"timestamp": [1], "events": {}},
        "GONE": None,
        "BROKEN": {"events": {}},  # no prices: a degraded response
        "PEP": {"timestamp": [1], "events": {}},  # paid last quarter, nothing now
    }
    monkeypatch.setattr(dh, "_fetch_chart", lambda symbol, years: charts[symbol])
    store = FakeStore({"tm_dividend_history/PEP": {"last_ex_date": "2026-09-05"}})
    summary = dh.run(symbols=["ko", "AMZN", "GONE", "BROKEN", "PEP"], pause=0, store=store)
    paths = [path for path, _ in store.writes]
    assert paths == ["tm_dividend_history/KO", "tm_dividend_history/AMZN"]  # no meta on a spot run
    assert all(path.startswith("tm_dividend_history") for path in paths)
    assert summary["missing"] == ["GONE", "BROKEN"] and summary["kept"] == ["PEP"]
    assert summary["payers"] == 1 and summary["written"] == 2
    ko = dict(store.writes)["tm_dividend_history/KO"]
    assert ko["pay_lag_days"] == 17

    dry = FakeStore()
    dh.run(symbols=["KO"], pause=0, store=dry, dry_run=True)
    assert dry.writes == []
