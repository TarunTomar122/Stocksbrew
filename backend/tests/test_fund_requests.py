"""Funds on demand: which tickers are funds, and how a fund request is covered (process_fund_requests.py)."""
import json
import unittest
from typing import Any

from backend.agentdata import fund_facts
from backend.scripts import build_us_fund_tickers as build
from backend.scripts import process_fund_requests as funds
from backend.scripts import process_stock_requests

NOW = "2026-11-12T15:00:00+00:00"


# ---------------------------------------------------------------------------
# Fakes: just enough of the Firestore-shaped store for the fund path
# ---------------------------------------------------------------------------


class FakeSnap:
    def __init__(self, data: dict[str, Any] | None) -> None:
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return dict(self._data) if self._data is not None else None


class FakeRef:
    def __init__(self, db: "FakeDb", path: str) -> None:
        self.db = db
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def get(self) -> FakeSnap:
        return FakeSnap(self.db.docs.get(self.path))

    def set(self, data: dict[str, Any], merge: bool = False) -> None:
        current = dict(self.db.docs.get(self.path) or {}) if merge else {}
        current.update(data)
        self.db.docs[self.path] = current
        self.db.writes.append(("set", self.path))

    def update(self, data: dict[str, Any]) -> None:
        current = dict(self.db.docs.get(self.path) or {})
        for key, value in data.items():
            target = current
            parts = key.split(".")
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value
        self.db.docs[self.path] = current
        self.db.writes.append(("update", self.path))

    def create(self, data: dict[str, Any]) -> None:
        if self.path in self.db.docs:
            raise RuntimeError("already exists")
        self.db.docs[self.path] = dict(data)
        self.db.writes.append(("create", self.path))


class FakeCollection:
    def __init__(self, db: "FakeDb", name: str) -> None:
        self.db = db
        self.name = name

    def document(self, doc_id: str) -> FakeRef:
        return FakeRef(self.db, f"{self.name}/{doc_id}")


class FakeDb:
    def __init__(self, docs: dict[str, dict[str, Any]] | None = None) -> None:
        self.docs: dict[str, dict[str, Any]] = dict(docs or {})
        self.writes: list[tuple[str, str]] = []

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self, name)

    def document(self, path: str) -> FakeRef:
        return FakeRef(self, path)


class FakeStore:
    def __init__(self, db: FakeDb) -> None:
        self.db = db


class FakeDocs:
    """agentdata.store.DocStore over the same fake db, with its SQLite handle for field updates."""

    def __init__(self, db: FakeDb) -> None:
        self._db = db

    def get(self, path: str) -> dict[str, Any] | None:
        return self._db.docs.get(path)

    def set(self, path: str, data: dict[str, Any], merge: bool = False) -> None:
        FakeRef(self._db, path).set(data, merge=merge)


def fact_doc(ticker: str, quote_type: str = "ETF", **extra: Any) -> dict[str, Any]:
    return {"ticker": ticker, "name": f"{ticker} Fund", "quote_type": quote_type, "source": "Yahoo Finance", "fetched_at": NOW, "schema_version": 1, **extra}


def run(db: FakeDb, ticker: str, doc: dict[str, Any] | None, *, priced: bool = True, calls: list[str] | None = None) -> str:
    calls = calls if calls is not None else []
    request = db.document(f"stock_requests/{ticker}")
    if request.path not in db.docs:
        request.set({"query": ticker, "status": "running", "fulfilled": False})

    def fetch(key: str, **kwargs: Any) -> dict[str, Any] | None:
        assert kwargs.get("minimal") is True
        calls.append(f"fetch:{key}")
        return doc

    return funds.fulfill_fund(
        store=FakeStore(db),
        docs=FakeDocs(db),
        ref=request,
        ticker=ticker,
        fetch=fetch,
        price=lambda _store, instrument: calls.append(f"price:{instrument['instrument_id']}") or priced,
        history=lambda _docs, key: calls.append(f"history:{key}"),
        holdings=lambda _docs, key: calls.append(f"holdings:{key}") or "ok",
    )


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


class DetectionTests(unittest.TestCase):
    def test_checked_in_list_names_etfs_and_mutual_funds(self) -> None:
        self.assertEqual(funds.fund_kind("VTWO"), "etf")
        self.assertEqual(funds.fund_kind("spy"), "etf")
        self.assertEqual(funds.fund_kind("VTSAX"), "mutual_fund")
        self.assertEqual(funds.fund_kind("FXAIX"), "mutual_fund")

    def test_stocks_money_market_and_junk_are_not_funds(self) -> None:
        for ticker in ("AAPL", "NVDA", "SPAXX", "VMFXX", "BRK.B", "", "TOOLONGX", "VT SAX"):
            self.assertIsNone(funds.fund_kind(ticker), ticker)

    def test_the_sec_file_adds_funds_newer_than_the_list(self) -> None:
        self.assertFalse(funds.is_fund_candidate("ZZZQ"))
        self.assertTrue(funds.is_fund_candidate("ZZZQ", {"ZZZQ"}))
        self.assertFalse(funds.is_fund_candidate("BRK.B", {"BRK.B"}))

    def test_list_builder_reads_both_sources(self) -> None:
        nasdaq = "\n".join(
            [
                "Nasdaq Traded|Symbol|Security Name|Listing Exchange|Market Category|ETF|Round Lot Size|Test Issue|Financial Status|CQS Symbol|NASDAQ Symbol|NextShares",
                "Y|AAPL|Apple Inc.|Q|Q|N|100|N|N||AAPL|N",
                "Y|VTWO|Vanguard Russell 2000 ETF|Q|G|Y|100|N|N||VTWO|N",
                "Y|ZTEST|Test ETF|Q|G|Y|100|Y|N||ZTEST|N",
                "Y|BRK.B|Berkshire|N| |Y|100|N||BRK.B|BRK.B|N",
                "File Creation Time: 1112202614:00|||||||||||",
            ]
        )
        self.assertEqual(build.etf_tickers(nasdaq), ["VTWO"])
        sec = {"fields": ["cik", "seriesId", "classId", "symbol"], "data": [[1, "S1", "C1", "VTSAX"], [2, "S2", "C2", "SPAXX"], [3, "S3", "C3", "VTWO"], [4, "S4", "C4", "fxaix"]]}
        self.assertEqual(build.mutual_fund_tickers(sec), ["FXAIX", "VTSAX"])
        payload = build.build(["VTWO"], ["FXAIX", "VTSAX"], NOW)
        self.assertEqual(payload["etfs"], "VTWO")
        self.assertEqual(payload["mutual_funds"], "FXAIX VTSAX")
        self.assertEqual(payload["counts"], {"etfs": 1, "mutual_funds": 2})

    def test_checked_in_file_is_well_formed(self) -> None:
        payload = json.loads(funds.FUND_LIST_PATH.read_text())
        etfs, mutual_funds = payload["etfs"].split(), payload["mutual_funds"].split()
        self.assertGreater(len(etfs), 2000)
        self.assertGreater(len(mutual_funds), 10000)
        self.assertTrue(all(build.MUTUAL_FUND_TICKER.match(t) and not build.MONEY_MARKET_TICKER.match(t) for t in mutual_funds))
        self.assertFalse(set(etfs) & set(mutual_funds))


class MinimalFactsTests(unittest.TestCase):
    def test_a_fund_without_figures_still_says_it_is_a_fund(self) -> None:
        info = {"quoteType": "MUTUALFUND", "longName": "Some Admiral Fund"}
        self.assertIsNone(fund_facts.build_fact_doc("ABCDX", info, fetched_at=NOW))
        doc = fund_facts.minimal_fact_doc("ABCDX", info, fallback_name=None, fetched_at=NOW)
        self.assertEqual(doc["name"], "Some Admiral Fund")
        self.assertEqual(doc["quote_type"], "MUTUALFUND")
        self.assertIsNone(fund_facts.minimal_fact_doc("AAPL", {"quoteType": "EQUITY"}, fallback_name=None, fetched_at=NOW))


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class FulfillTests(unittest.TestCase):
    def test_new_etf_is_registered_priced_and_marked_fulfilled(self) -> None:
        db = FakeDb({"tm_fund_meta/latest": {"funds": {"VOO": {"name": "Vanguard S&P 500 ETF"}}}})
        calls: list[str] = []
        outcome = run(db, "VTWO", fact_doc("VTWO", expense_ratio=0.0006), calls=calls)
        self.assertEqual(outcome, "ok")
        instrument = db.docs["tm_instruments/US_VTWO"]
        self.assertEqual(instrument["asset_type"], "fund")
        self.assertEqual(instrument["fund_kind"], "etf")
        self.assertEqual(instrument["source"], "fund_request")
        self.assertEqual(instrument["name"], "VTWO Fund")
        self.assertEqual(db.docs["tm_fund_facts/VTWO"]["expense_ratio"], 0.0006)
        # One key added to the meta map; the funds already there stay.
        self.assertEqual(set(db.docs["tm_fund_meta/latest"]["funds"]), {"VOO", "VTWO"})
        self.assertIn("US_VTWO", db.docs["tm_config/price_core_overrides"]["US"])
        request = db.docs["stock_requests/VTWO"]
        self.assertTrue(request["fulfilled"])
        self.assertEqual(request["status"], "fulfilled")
        self.assertEqual(request["fund_kind"], "etf")
        self.assertEqual(request["resolved_instrument_id"], "US_VTWO")
        # Holdings come after the request is fulfilled, so a slow N-PORT read never holds the page back.
        self.assertEqual(calls, ["fetch:VTWO", "price:US_VTWO", "history:VTWO", "holdings:VTWO"])

    def test_mutual_fund_is_covered_as_a_fund(self) -> None:
        db = FakeDb()
        self.assertEqual(run(db, "VTSAX", fact_doc("VTSAX", "MUTUALFUND", expense_ratio=0.0004)), "ok")
        self.assertEqual(db.docs["tm_instruments/US_VTSAX"]["fund_kind"], "mutual_fund")
        self.assertEqual(db.docs["stock_requests/VTSAX"]["fund_kind"], "mutual_fund")

    def test_existing_instrument_is_never_changed(self) -> None:
        existing = {"instrument_id": "US_SCHD", "ticker": "SCHD", "name": "SCHD", "source": "stock_request_auto"}
        db = FakeDb({"tm_instruments/US_SCHD": dict(existing)})
        self.assertEqual(run(db, "SCHD", fact_doc("SCHD", dividend_yield=0.035)), "ok")
        self.assertEqual(db.docs["tm_instruments/US_SCHD"], existing)
        self.assertNotIn(("create", "tm_instruments/US_SCHD"), db.writes)
        self.assertNotIn(("set", "tm_instruments/US_SCHD"), db.writes)

    def test_name_only_facts_never_replace_figures(self) -> None:
        figures = fact_doc("ABCD", expense_ratio=0.001)
        db = FakeDb({"tm_fund_facts/ABCD": dict(figures)})
        self.assertEqual(run(db, "ABCD", fact_doc("ABCD")), "ok")
        self.assertEqual(db.docs["tm_fund_facts/ABCD"]["expense_ratio"], 0.001)

    def test_not_a_fund_leaves_everything_alone(self) -> None:
        db = FakeDb()
        before = dict(db.docs)
        self.assertEqual(run(db, "AAPL", None), "not_a_fund")
        self.assertEqual({k: v for k, v in db.docs.items() if not k.startswith("stock_requests/")}, before)
        self.assertEqual(db.docs["stock_requests/AAPL"]["status"], "running")

    def test_yahoo_failure_marks_the_request_for_retry(self) -> None:
        db = FakeDb()
        db.document("stock_requests/VTWO").set({"query": "VTWO", "status": "running"})

        def broken(*_args: Any, **_kwargs: Any) -> None:
            raise TimeoutError("yahoo")

        outcome = funds.fulfill_fund(store=FakeStore(db), docs=FakeDocs(db), ref=db.document("stock_requests/VTWO"), ticker="VTWO", fetch=broken)
        self.assertEqual(outcome, "fail")
        self.assertEqual(db.docs["stock_requests/VTWO"]["status"], "retry")
        self.assertNotIn("tm_instruments/US_VTWO", db.docs)

    def test_no_first_price_still_fulfils(self) -> None:
        db = FakeDb()
        self.assertEqual(run(db, "VTWO", fact_doc("VTWO", aum_usd=1e9), priced=False), "ok")
        self.assertTrue(db.docs["stock_requests/VTWO"]["fulfilled"])


class QueueTests(unittest.TestCase):
    class Doc:
        def __init__(self, doc_id: str) -> None:
            self.id = doc_id

    def test_only_runnable_fund_requests_oldest_first(self) -> None:
        rows = [
            (self.Doc("AAPL"), {"query": "AAPL", "status": "queued", "requested_at": "1"}),
            (self.Doc("VTSAX"), {"query": "VTSAX", "status": "queued", "last_requested_at": "3"}),
            (self.Doc("VTWO"), {"query": "VTWO", "status": "retry", "last_requested_at": "2"}),
            (self.Doc("QQQ"), {"query": "QQQ", "status": "fulfilled", "fulfilled": True}),
            (self.Doc("SPY"), {"query": "SPY", "status": "needs_confirmation"}),
            (self.Doc("IWM"), {"query": "IWM", "status": "queued", "fund_check": "not_a_fund"}),
        ]
        picked = [doc.id for doc, _ in funds.pending_fund_requests(rows)]
        # A retry that failed a minute ago waits; one from twenty minutes ago runs.
        from datetime import datetime, timezone

        now = datetime(2026, 11, 12, 15, 0, tzinfo=timezone.utc)
        fresh = [(self.Doc("VTWO"), {"query": "VTWO", "status": "retry", "updated_at": "2026-11-12T14:59:00+00:00"})]
        stale = [(self.Doc("VTWO"), {"query": "VTWO", "status": "retry", "updated_at": "2026-11-12T14:40:00+00:00"})]
        self.assertEqual(funds.pending_fund_requests(fresh, now=now), [])
        self.assertEqual(len(funds.pending_fund_requests(stale, now=now)), 1)
        self.assertEqual(len(funds.pending_fund_requests(fresh, query="VTWO", now=now)), 1)
        self.assertEqual(picked, ["VTWO", "VTSAX"])
        self.assertEqual([doc.id for doc, _ in funds.pending_fund_requests(rows, query="VTSAX")], ["VTSAX"])
        self.assertEqual(len(funds.pending_fund_requests(rows, limit=1)), 1)

    def test_refuses_to_run_against_firebase_by_default(self) -> None:
        import os

        saved = os.environ.pop("LOCALDB_PATH", None)
        try:
            self.assertEqual(funds.main(["--dry-run"]), 2)
        finally:
            if saved is not None:
                os.environ["LOCALDB_PATH"] = saved


class StockLaneTests(unittest.TestCase):
    def test_stock_lane_hands_funds_to_the_fund_path(self) -> None:
        seen: list[str] = []
        original = funds.fulfill_fund
        try:
            funds.fulfill_fund = lambda **kwargs: seen.append(kwargs["ticker"]) or "ok"  # type: ignore[assignment]
            process_stock_requests._SEC_FUNDS = set()
            import backend.agentdata.store as store_module

            saved_from_env = store_module.DocStore.from_env
            store_module.DocStore.from_env = classmethod(lambda cls: object())  # type: ignore[assignment]
            try:
                db = FakeDb()
                ref = db.document("stock_requests/VTWO")
                self.assertEqual(process_stock_requests._try_fund_path(FakeStore(db), ref, {}, "US", "vtwo"), "ok")
                # A stock, a non-US market and a request the fund check sent back all take the stock path.
                self.assertIsNone(process_stock_requests._try_fund_path(FakeStore(db), ref, {}, "US", "AAPL"))
                self.assertIsNone(process_stock_requests._try_fund_path(FakeStore(db), ref, {}, "IN", "VTWO"))
                self.assertIsNone(process_stock_requests._try_fund_path(FakeStore(db), ref, {"fund_check": "not_a_fund"}, "US", "VTWO"))
            finally:
                store_module.DocStore.from_env = saved_from_env  # type: ignore[assignment]
        finally:
            funds.fulfill_fund = original  # type: ignore[assignment]
            process_stock_requests._SEC_FUNDS = None
        self.assertEqual(seen, ["VTWO"])

    def test_not_a_fund_marks_the_request_and_falls_through(self) -> None:
        original = funds.fulfill_fund
        import backend.agentdata.store as store_module

        saved_from_env = store_module.DocStore.from_env
        try:
            funds.fulfill_fund = lambda **_kwargs: "not_a_fund"  # type: ignore[assignment]
            store_module.DocStore.from_env = classmethod(lambda cls: object())  # type: ignore[assignment]
            db = FakeDb()
            ref = db.document("stock_requests/VTWO")
            self.assertIsNone(process_stock_requests._try_fund_path(FakeStore(db), ref, {}, "US", "VTWO"))
            self.assertEqual(db.docs["stock_requests/VTWO"]["fund_check"], "not_a_fund")
        finally:
            funds.fulfill_fund = original  # type: ignore[assignment]
            store_module.DocStore.from_env = saved_from_env  # type: ignore[assignment]


if __name__ == "__main__":
    unittest.main()
