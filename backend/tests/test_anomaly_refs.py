"""The small copies of the explained-moves docs (backend/anomaly_refs.py)."""

from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from backend import anomaly_refs
from backend.agentdata.store import DocStore
from backend.localdb.firestore import LocalFirestoreClient
from backend.localdb.store import LocalDocumentStore


def _row(ticker: str, status: str = "verified", **extra) -> dict:
    row = {
        "ticker": ticker,
        "name": f"{ticker} Inc",
        "instrument_id": f"US_{ticker}",
        "day_change_pct": -7.5,
        "price": 10.0,
        "narrative_status": status,
        "narrative_as_of": "2026-11-12T21:30:00+00:00",
        "price_as_of": "2026-11-12T21:00:00+00:00",
        "sector": "Technology",
        "move_explanation": {
            "headline": f"{ticker} cut its outlook",
            "why_it_matters": "long text " * 40,
            "confidence": "high",
            "cause_type": "guidance",
            "external_source": "news",
            "evidence": [{"title": "Reuters", "url": "https://example.com/a", "snippet": "x" * 300}, "odd"],
        },
    }
    row.update(extra)
    return row


def _doc(day: str, rows: list) -> dict:
    return {"market": "US", "date": day, "anomalies": rows, "sector_summary": {"Tech": 1.2}, "generated_at": "2026-11-12T21:00:00+00:00"}


class RefsDocTest(unittest.TestCase):
    def test_keeps_verified_rows_with_only_the_fields_the_page_reads(self) -> None:
        source = _doc("2026-11-12", [_row("AAA"), _row("BBB", status="provisional"), "junk", _row("CCC", move_explanation=None)])
        path, refs = anomaly_refs.refs_doc("tm_daily_anomalies/US__2026-11-12", source)
        self.assertEqual(path, "tm_daily_anomaly_refs/US__2026-11-12")
        self.assertEqual((refs["mr_v"], refs["mr_date"]), (anomaly_refs.REFS_VERSION, "2026-11-12"))
        self.assertEqual([row["ticker"] for row in refs["mr_rows"]], ["AAA", "CCC"])
        first = refs["mr_rows"][0]
        self.assertEqual(
            set(first), {"ticker", "name", "day_change_pct", "narrative_status", "narrative_as_of", "price_as_of", "move_explanation"}
        )
        self.assertEqual(set(first["move_explanation"]), {"headline", "confidence", "cause_type", "external_source", "evidence"})
        self.assertEqual(first["move_explanation"]["evidence"], [{"title": "Reuters", "url": "https://example.com/a"}])
        self.assertIsNone(refs["mr_rows"][1]["move_explanation"])

    def test_sources_cut_to_one_sure_link_or_kept_whole(self) -> None:
        project = anomaly_refs._project_evidence
        sure = {"title": "Reuters", "url": "https://a.example/x", "snippet": "long"}
        self.assertEqual(project([{"title": " ", "url": "https://b"}, "odd", sure, {"title": "X", "url": "http://c"}]), [{"title": "Reuters", "url": "https://a.example/x"}])
        # Nothing surely linkable: every source stays (title and link only) for the page to judge.
        unsure = [{"title": "\u00a0", "url": " https://d", "extra": 1}, {"title": 5, "url": "https://e"}, "odd"]
        self.assertEqual(project(unsure), [{"title": "\u00a0", "url": " https://d"}, {"title": 5, "url": "https://e"}, "odd"])
        self.assertEqual(project({"not": "a list"}), {"not": "a list"})

    def test_missing_fields_stay_missing(self) -> None:
        row = {"ticker": "DDD", "narrative_status": "verified"}
        _, refs = anomaly_refs.refs_doc("tm_daily_anomalies/US__latest", _doc("2026-11-12", [row]))
        self.assertEqual(refs["mr_rows"], [row])


class WriteRefsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.local = LocalDocumentStore(str(Path(self._dir.name) / "documents.sqlite3"))
        self.client = LocalFirestoreClient(self.local)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_copy_names_the_hash_the_store_records(self) -> None:
        source = _doc("2026-11-12", [_row("AAA"), _row("BBB")])
        source["anomalies"][0]["researched_at"] = datetime(2026, 11, 12, 21, 30, tzinfo=timezone.utc)  # a typed value
        path = "tm_daily_anomalies/US__latest"
        self.client.document(path).set(source)
        anomaly_refs.write_refs(self.client, path, source)
        stored = self.local.get(path)
        copy = self.local.get("tm_daily_anomaly_refs/US__latest")
        self.assertEqual(copy["data"]["mr_src"], stored["hash"])

    def test_other_clients_write_nothing_and_errors_never_raise(self) -> None:
        firebase_like = mock.Mock()
        anomaly_refs.write_refs(firebase_like, "tm_daily_anomalies/US__latest", _doc("2026-11-12", []))
        firebase_like.document.assert_not_called()
        broken = mock.Mock(spec=LocalFirestoreClient)
        broken.document.side_effect = RuntimeError("locked")
        anomaly_refs.write_refs(broken, "tm_daily_anomalies/US__latest", _doc("2026-11-12", []))

    def test_backfill_writes_missing_and_old_copies_with_the_store_hash(self) -> None:
        store = DocStore(db_path=str(Path(self._dir.name) / "documents.sqlite3"))
        source = lambda path, data: self.client.document(path).set(data)  # the agent store writes only its own collections
        today = datetime.now(timezone.utc).date()
        day = lambda offset: (today - timedelta(days=offset)).isoformat()
        current = _doc(day(1), [_row("AAA")])
        source(f"tm_daily_anomalies/US__{day(1)}", current)
        store.set_many([anomaly_refs.refs_doc(f"tm_daily_anomalies/US__{day(1)}", current)])
        source(f"tm_daily_anomalies/US__{day(2)}", _doc(day(2), [_row("BBB")]))
        old = _doc(day(3), [_row("CCC")])
        store.set_many([anomaly_refs.refs_doc(f"tm_daily_anomalies/US__{day(3)}", old)])
        source(f"tm_daily_anomalies/US__{day(3)}", _doc(day(3), [_row("CCC"), _row("DDD")]))
        source("tm_daily_anomalies/US__latest", _doc(day(0), [_row("EEE")]))
        source(f"tm_daily_anomalies/US__{day(120)}", _doc(day(120), [_row("FFF")]))  # outside the window

        self.assertEqual(anomaly_refs.backfill(store, dry_run=True)["would_write"], 3)
        result = anomaly_refs.backfill(store)
        self.assertEqual((result["sources"], result["written"]), (4, 3))
        paths = [f"tm_daily_anomalies/US__{day(offset)}" for offset in (1, 2, 3)] + ["tm_daily_anomalies/US__latest"]
        sources = store.read_with_hashes(paths, [])
        copies = store.read_with_hashes([path.replace("tm_daily_anomalies/", "tm_daily_anomaly_refs/") for path in paths], ["mr_src"])
        for path in paths:
            self.assertEqual(copies[path.replace("tm_daily_anomalies/", "tm_daily_anomaly_refs/")]["data"]["mr_src"], sources[path]["hash"])
        self.assertEqual(anomaly_refs.backfill(store)["written"], 0)


if __name__ == "__main__":
    unittest.main()
