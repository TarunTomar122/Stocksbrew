"""Senate eFD periodic transaction reports: parsing, amendments, profiles, the polite client.

The fixtures in fixtures/senate_efd are real eFD pages, not made up:

* agreement.html: the eFD home page with its agreement form, as the Internet
  Archive captured it on 2026-01-06.
* ptr_*.html: four electronic PTRs (Whitehouse 06/02/2026, Fetterman 06/12/2026,
  Boozman's 06/16/2026 original and its Amendment 1), captured from
  efdsearch.senate.gov on 2026-07-05 and published as conformance fixtures by
  the open govfolio project. All but the Whitehouse page are cut to their <main>.
* search_ptr_2026_06.json: one page of eFD's PTR search (senators, filed from
  06/01/2026), from the same capture.

eFD answers 403 to this job's own requests, so these could not be fetched here.
"""

from __future__ import annotations

import io
import json
import unittest
import urllib.error
from datetime import date
from pathlib import Path

from backend.agentdata import senate_ptr as senate

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "senate_efd"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


SENATORS = {
    "whitehouse": [{"party": "D", "state": "RI", "name": "Sheldon Whitehouse", "first": "Sheldon", "nickname": "", "last": "Whitehouse"}],
    "boozman": [{"party": "R", "state": "AR", "name": "John Boozman", "first": "John", "nickname": "", "last": "Boozman"}],
    "fetterman": [{"party": "D", "state": "PA", "name": "John Fetterman", "first": "John", "nickname": "", "last": "Fetterman"}],
    "scott": [
        {"party": "R", "state": "FL", "name": "Rick Scott", "first": "Richard", "nickname": "Rick", "last": "Scott"},
        {"party": "R", "state": "SC", "name": "Tim Scott", "first": "Tim", "nickname": "", "last": "Scott"},
    ],
}


class SearchAndAgreementTests(unittest.TestCase):
    def test_agreement_token_comes_from_the_real_form(self) -> None:
        token = senate.agreement_token(fixture("agreement.html"))
        self.assertEqual(len(token), 64)
        self.assertEqual(senate.agreement_token("<html><body>Access Denied</body></html>"), "")

    def test_search_rows_from_a_real_page(self) -> None:
        rows = senate.parse_search_rows(json.loads(fixture("search_ptr_2026_06.json")))
        self.assertEqual(len(rows), 13)
        self.assertEqual(sum(1 for row in rows if row["kind"] == "paper"), 1)
        by_id = {row["uuid"]: row for row in rows}
        paper = by_id["a0d25e8f-fe54-4328-a7ea-504da008742b"]
        self.assertEqual((paper["first"], paper["last"], paper["submitted"]), ("Richard", "Blumenthal", "2026-06-08"))
        self.assertEqual(paper["url"], "https://efdsearch.senate.gov/search/view/paper/a0d25e8f-fe54-4328-a7ea-504da008742b/")
        amendment = by_id["727b4eb6-d8c7-4792-aa5b-c651c2d72f9c"]
        self.assertEqual((amendment["amendment"], amendment["title_date"]), (1, "2026-06-16"))
        # Dirty name cells: a trailing comma, a suffix after the comma.
        self.assertEqual(by_id["7caf1b69-3678-4420-8812-a1476a1a6158"]["last"], "Moran")
        self.assertEqual(by_id["36b2e868-6789-43e3-91eb-ebe85aad5699"]["last"], "McConnell")
        # The title's "for" date and the submitted date can differ by a day.
        mccormick = by_id["ff0b0573-2809-40ae-8197-4b26648e9027"]
        self.assertEqual((mccormick["title_date"], mccormick["submitted"]), ("2026-06-27", "2026-06-26"))

    def test_candidate_rows_are_dropped(self) -> None:
        payload = {"data": [["Jane", "Doe", "Doe, Jane (Candidate)", '<a href="/search/view/ptr/11111111-2222-3333-4444-555555555555/">Periodic Transaction Report for 01/02/2026</a>', "01/02/2026"]]}
        self.assertEqual(senate.parse_search_rows(payload), [])


class ReportParsingTests(unittest.TestCase):
    def test_whitehouse_full_page(self) -> None:
        parsed = senate.parse_report(fixture("ptr_whitehouse_4aa0094d.html"))
        self.assertTrue(parsed["ok"])
        self.assertEqual(parsed["filer"], "Sheldon Whitehouse")
        self.assertEqual(parsed["filed_at"], "2026-06-02T12:56")
        self.assertEqual((parsed["title_date"], parsed["amendment"]), ("2026-06-02", 0))
        rows = parsed["rows"]
        self.assertEqual([row["number"] for row in rows], [3, 2, 1])
        self.assertEqual([row["ticker"] for row in rows], ["ORCL", "NVDA", "NVDA"])
        self.assertEqual([row["owner"] for row in rows], ["self", "self", "spouse"])
        self.assertTrue(all(row["tx_type"] == "sell" and row["partial"] for row in rows))
        self.assertEqual((rows[1]["amount_low"], rows[1]["amount_high"]), (100001.0, 250000.0))
        self.assertEqual(rows[0]["transaction_date"], "2026-05-07")
        self.assertEqual(rows[0]["comment"], "")

    def test_bond_row_keeps_its_detail_and_has_no_ticker(self) -> None:
        parsed = senate.parse_report(fixture("ptr_fetterman_4b69867f.html"))
        self.assertTrue(parsed["ok"])
        (row,) = parsed["rows"]
        self.assertEqual((row["owner"], row["ticker"], row["asset_type"], row["tx_type"]), ("dependent child", "", "Corporate Bond", "buy"))
        self.assertEqual(row["asset"], "EXPEDIA GROUP INC NOTE")
        self.assertIn("Matures: 2036-04-15", row["asset_detail"])
        self.assertEqual(parsed["filed_at"], "2026-06-12T13:23")

    def test_amendment_and_original(self) -> None:
        amendment = senate.parse_report(fixture("ptr_boozman_amendment_727b4eb6.html"))
        original = senate.parse_report(fixture("ptr_boozman_original_a9754ff5.html"))
        self.assertEqual((amendment["amendment"], len(amendment["rows"]), amendment["ok"]), (1, 18, True))
        self.assertEqual((original["amendment"], len(original["rows"]), original["ok"]), (0, 18, True))
        self.assertLess(original["filed_at"], amendment["filed_at"])
        self.assertTrue(all(row["owner"] == "joint" for row in amendment["rows"]))

    def test_a_page_whose_count_disagrees_is_not_read(self) -> None:
        page = fixture("ptr_whitehouse_4aa0094d.html").replace("(3 transactions total)", "(4 transactions total)")
        self.assertFalse(senate.parse_report(page)["ok"])
        self.assertFalse(senate.parse_report(fixture("agreement.html"))["ok"])

    def test_amount_and_type_words(self) -> None:
        self.assertEqual(senate._amount("None (or less than $1,001)"), (0.0, 1000.0))
        self.assertEqual(senate._amount("Over $50,000,000"), (50000000.0, None))
        self.assertEqual(senate._type("Sale (Full)"), ("sell", False))
        self.assertEqual(senate._type("Exchange"), ("exchange", False))
        self.assertEqual(senate._type("Gift"), ("other", False))


def stored_report(name: str, ref: dict) -> dict:
    return senate.report_doc(ref, senate.parse_report(fixture(name)), "2026-07-06T00:00:00+00:00")


def refs_by_id() -> dict:
    return {row["uuid"]: row for row in senate.parse_search_rows(json.loads(fixture("search_ptr_2026_06.json")))}


class BuildTests(unittest.TestCase):
    def setUp(self) -> None:
        refs = refs_by_id()
        self.reports = [
            stored_report("ptr_whitehouse_4aa0094d.html", refs["4aa0094d-d9da-4a05-aa13-6d9f5d376105"]),
            stored_report("ptr_fetterman_4b69867f.html", refs["4b69867f-0376-4526-93f2-cd556b1155c9"]),
            stored_report("ptr_boozman_amendment_727b4eb6.html", refs["727b4eb6-d8c7-4792-aa5b-c651c2d72f9c"]),
            stored_report("ptr_boozman_original_a9754ff5.html", refs["a9754ff5-901a-4877-b7be-a647bd361c52"]),
            senate.report_doc(refs["a0d25e8f-fe54-4328-a7ea-504da008742b"], None, "2026-07-06T00:00:00+00:00"),
        ]

    def build(self, taken: set[str] | None = None, slugs: dict | None = None):
        slugs = {} if slugs is None else slugs
        docs, counts = senate.build_documents(self.reports, SENATORS, slugs, taken or set(), now_iso="2026-07-06T00:00:00+00:00")
        return dict(docs), counts, slugs

    def test_profiles_trades_and_counts(self) -> None:
        docs, counts, slugs = self.build()
        profile = docs["tm_follow_people/sheldon-whitehouse"]
        self.assertEqual((profile["chamber"], profile["person"], profile["style"]), ("senate", "US Senate, RI", "Democrat · RI"))
        self.assertEqual(profile["latest_date"], "2026-06-02")
        self.assertEqual(profile["stats"]["sells"], 3)
        self.assertEqual(profile["reports"][0]["url"], "https://efdsearch.senate.gov/search/view/ptr/4aa0094d-d9da-4a05-aa13-6d9f5d376105/")
        trade = docs["tm_follow_trades/4aa0094d-d9da-4a05-aa13-6d9f5d376105-2"]
        self.assertEqual((trade["ticker"], trade["company"], trade["lag_days"], trade["disclosure_date"]), ("NVDA", "NVIDIA Corporation", 25, "2026-06-02"))
        self.assertEqual(docs["tm_follow_trades/4aa0094d-d9da-4a05-aa13-6d9f5d376105-3"]["company"], "Oracle Corporation")
        self.assertEqual(docs["tm_follow_sources/sheldon-whitehouse"]["kind"], "congress")
        # A bond buy has no ticker; a paper filing is counted and makes no profile.
        self.assertEqual(docs["tm_follow_trades/4b69867f-0376-4526-93f2-cd556b1155c9-1"]["ticker"], "")
        self.assertNotIn("tm_follow_people/richard-blumenthal", docs)
        self.assertEqual((counts["paper_filings"], counts["electronic_reports"], counts["amended_originals"]), (1, 4, 1))
        self.assertEqual(slugs["whitehouse:s"], "sheldon-whitehouse")

    def test_amendment_replaces_its_original(self) -> None:
        docs, counts, _ = self.build()
        boozman = docs["tm_follow_people/john-boozman"]
        self.assertEqual([row["doc_id"] for row in boozman["reports"]], ["727b4eb6-d8c7-4792-aa5b-c651c2d72f9c"])
        self.assertEqual(boozman["trades_total"], 18)
        old = docs["tm_follow_trades/a9754ff5-901a-4877-b7be-a647bd361c52-1"]
        self.assertEqual(old["superseded_by"], "727b4eb6-d8c7-4792-aa5b-c651c2d72f9c")
        self.assertNotIn("superseded_by", docs["tm_follow_trades/727b4eb6-d8c7-4792-aa5b-c651c2d72f9c-1"])
        self.assertEqual(counts["trades"], 3 + 1 + 18)

    def test_a_name_the_house_already_uses_gets_a_senate_slug_and_keeps_it(self) -> None:
        _, _, slugs = self.build(taken={"john-boozman"})
        self.assertEqual(slugs["boozman:j"], "john-boozman-senate")
        # Next run: the House name is gone, but the slug given before stays.
        docs, _, _ = self.build(taken=set(), slugs=slugs)
        self.assertIn("tm_follow_people/john-boozman-senate", docs)

    def test_slugs_hold_when_the_senator_list_changes(self) -> None:
        docs, _, _ = self.build()
        self.assertIn("tm_follow_people/john-boozman", docs)
        # Boozman leaves the Senate: same slug, name kept from his last report in office, no longer sitting.
        for report in self.reports:
            report.pop("slug", None)
        slugs: dict = {}
        senate.build_documents(self.reports, SENATORS, slugs, set(), now_iso="2026-07-06T00:00:00+00:00")
        without = {key: value for key, value in SENATORS.items() if key != "boozman"}
        later = dict(senate.build_documents(self.reports, without, slugs, set(), now_iso="2026-07-07T00:00:00+00:00")[0])
        boozman = later["tm_follow_people/john-boozman"]
        self.assertEqual((boozman["name"], boozman["state"], boozman["sitting"]), ("John Boozman", "AR", False))

    def test_restated_original_activity_is_written_marked(self) -> None:
        docs, _, _ = self.build()
        old = docs["tm_follow_activity/john-boozman__2026-06-16__a9754ff5-901a-4877-b7be-a647bd361c52"]
        self.assertEqual(old["superseded_by"], "727b4eb6-d8c7-4792-aa5b-c651c2d72f9c")

    def test_activity_only_for_recent_reports_with_trades(self) -> None:
        docs, _, _ = self.build()
        activity = [path for path in docs if path.startswith("tm_follow_activity/") and "superseded_by" not in docs[path]]
        self.assertEqual(len(activity), 3)
        item = docs["tm_follow_activity/sheldon-whitehouse__2026-06-02__4aa0094d-d9da-4a05-aa13-6d9f5d376105"]
        self.assertEqual((item["chamber"], item["counts"]), ("senate", {"buys": 0, "sells": 3}))


class NamesTests(unittest.TestCase):
    def test_match_by_last_name_then_initial(self) -> None:
        self.assertEqual(senate.match_senator(SENATORS, "Sheldon", "Whitehouse")["state"], "RI")
        self.assertEqual(senate.match_senator(SENATORS, "Richard L", "Scott")["state"], "FL")
        self.assertEqual(senate.match_senator(SENATORS, "Tim", "Scott")["state"], "SC")
        self.assertIsNone(senate.match_senator(SENATORS, "Zed", "Scott"))
        self.assertIsNone(senate.match_senator(SENATORS, "Pat", "Nobody"))

    def test_filer_key_and_name_ignore_initials_and_case(self) -> None:
        self.assertEqual(senate.filer_key("A. Mitchell", "McConnell"), "mcconnell:m")
        self.assertEqual(senate.filer_key("Gary C", "Peters"), senate.filer_key("Gary", "Peters"))
        self.assertEqual(senate.filing_name("A. Mitchell", "McConnell"), "Mitchell McConnell")

    def test_display_slug(self) -> None:
        self.assertEqual(senate.display_slug("Gary C. Peters"), "gary-peters")
        self.assertEqual(senate.display_slug("A. Mitchell McConnell, Jr."), "mitchell-mcconnell")
        self.assertEqual(senate.display_slug("Tommy Tuberville"), "tommy-tuberville")

    def test_window_start(self) -> None:
        today = date(2026, 11, 11)
        self.assertEqual(senate.window_start({}, today, None, None), date(2025, 11, 11))
        self.assertEqual(senate.window_start({"high_water": "2026-11-01"}, today, None, None), date(2026, 10, 2))
        self.assertEqual(senate.window_start({"high_water": "2026-11-01"}, today, 30, None), date(2026, 10, 12))
        self.assertEqual(senate.window_start({}, today, None, "2026-01-01"), date(2026, 1, 1))


class _Response:
    def __init__(self, url: str, body: str) -> None:
        self._url, self._body = url, body.encode()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self) -> bytes:
        return self._body

    def geturl(self) -> str:
        return self._url


class _Opener:
    """Answers from a list of (status, final url, body); records each request."""

    def __init__(self, answers: list[tuple[int, str, str]]) -> None:
        self.answers = list(answers)
        self.seen: list[tuple[str, str, bytes | None]] = []

    def open(self, request, timeout=None):
        self.seen.append((request.get_method(), request.full_url, request.data))
        status, url, body = self.answers.pop(0)
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, "error", {}, io.BytesIO(body.encode()))
        return _Response(url, body)


class ClientTests(unittest.TestCase):
    def client(self, answers):
        opener = _Opener(answers)
        sleeps: list[float] = []
        return senate.EfdClient(opener=opener, pause=0, sleep=sleeps.append), opener, sleeps

    def test_agreement_posts_the_checkbox_with_the_forms_token(self) -> None:
        client, opener, _ = self.client([(200, senate.HOME_URL, fixture("agreement.html")), (200, senate.SEARCH_URL, "<html>search</html>")])
        client.agree()
        method, url, data = opener.seen[1]
        self.assertEqual((method, url), ("POST", senate.HOME_URL))
        self.assertIn(b"prohibition_agreement=1", data)
        self.assertIn(b"csrfmiddlewaretoken=" + senate.agreement_token(fixture("agreement.html")).encode(), data)
        self.assertTrue(client.agreed)

    def test_a_403_stops_at_once_without_retrying(self) -> None:
        client, opener, sleeps = self.client([(403, senate.HOME_URL, "Access Denied")])
        with self.assertRaises(senate.Blocked):
            client.search(date(2026, 6, 1))
        self.assertEqual(len(opener.seen), 1)
        self.assertEqual(sleeps, [])

    def test_a_page_that_is_not_a_report_is_a_refusal_not_a_report(self) -> None:
        client, _, _ = self.client([(200, senate.report_url("ptr", "x"), "<html><body>Please wait while we check your browser</body></html>")])
        client.agreed = True
        with self.assertRaises(senate.Blocked):
            client.report_page("x")

    def test_search_pages_until_the_total_and_backs_off_on_503(self) -> None:
        page = json.loads(fixture("search_ptr_2026_06.json"))
        first = {**page, "data": (page["data"] * 8)[:100], "recordsFiltered": 101}
        second = {**page, "data": page["data"][:1], "recordsFiltered": 101}
        client, opener, sleeps = self.client(
            [
                (200, senate.HOME_URL, fixture("agreement.html")),
                (200, senate.SEARCH_URL, "ok"),
                (503, senate.DATA_URL, "busy"),
                (200, senate.DATA_URL, json.dumps(first)),
                (200, senate.DATA_URL, json.dumps(second)),
            ]
        )
        rows = client.search(date(2026, 6, 1))
        self.assertEqual(len(rows), 101)
        self.assertEqual(sleeps, [5.0])
        self.assertIn(b"report_types=%5B11%5D", opener.seen[3][2])
        self.assertIn(b"start=100", opener.seen[4][2])
        self.assertIn(b"submitted_start_date=06%2F01%2F2026+00%3A00%3A00", opener.seen[3][2])


class _Client:
    """Stands in for EfdClient in read_new: pages by id, or an error."""

    def __init__(self, pages: dict) -> None:
        self.pages = pages

    def report_page(self, uuid: str) -> str:
        page = self.pages[uuid]
        if isinstance(page, Exception):
            raise page
        return page


class ReadNewTests(unittest.TestCase):
    def setUp(self) -> None:
        refs = refs_by_id()
        self.refs = [
            refs["4b69867f-0376-4526-93f2-cd556b1155c9"],  # 06/12
            refs["4aa0094d-d9da-4a05-aa13-6d9f5d376105"],  # 06/02
            refs["a0d25e8f-fe54-4328-a7ea-504da008742b"],  # paper, 06/08
        ]

    def test_reads_new_reports_and_paper_without_fetching_it(self) -> None:
        client = _Client({"4b69867f-0376-4526-93f2-cd556b1155c9": fixture("ptr_fetterman_4b69867f.html"),
                          "4aa0094d-d9da-4a05-aa13-6d9f5d376105": fixture("ptr_whitehouse_4aa0094d.html")})
        docs, newest = senate.read_new(client, self.refs, {}, now_iso="2026-07-06T00:00:00+00:00")
        self.assertEqual(len(docs), 3)
        self.assertEqual(newest, "2026-06-12")
        paper = next(doc for doc in docs if doc["paper"])
        self.assertEqual((paper["rows"], paper["readable"], paper["filed_on"]), ([], False, "2026-06-08"))

    def test_a_failed_report_holds_the_high_water_mark_back(self) -> None:
        import urllib.error as errors

        client = _Client({"4b69867f-0376-4526-93f2-cd556b1155c9": fixture("ptr_fetterman_4b69867f.html"),
                          "4aa0094d-d9da-4a05-aa13-6d9f5d376105": errors.HTTPError("u", 404, "gone", {}, None)})
        docs, newest = senate.read_new(client, self.refs, {}, now_iso="2026-07-06T00:00:00+00:00")
        self.assertEqual(len(docs), 2)
        self.assertEqual(newest, "2026-06-01")

    def test_stored_reports_are_skipped_unless_they_were_unreadable(self) -> None:
        held = {
            f"{senate.REPORTS}/4b69867f-0376-4526-93f2-cd556b1155c9": {"readable": True},
            f"{senate.REPORTS}/4aa0094d-d9da-4a05-aa13-6d9f5d376105": {"readable": False},
            f"{senate.REPORTS}/a0d25e8f-fe54-4328-a7ea-504da008742b": {"readable": False, "paper": True},
        }
        client = _Client({"4aa0094d-d9da-4a05-aa13-6d9f5d376105": fixture("ptr_whitehouse_4aa0094d.html")})
        docs, _ = senate.read_new(client, self.refs, held, now_iso="2026-07-06T00:00:00+00:00")
        self.assertEqual([doc["uuid"] for doc in docs], ["4aa0094d-d9da-4a05-aa13-6d9f5d376105"])


class _Store:
    mode = "test"

    def __init__(self) -> None:
        self.writes: list = []

    def get(self, path):
        return None

    def get_many(self, paths):
        return {}

    def list(self, collection, limit=1000):
        return []

    def set_many(self, docs, merge=False):
        docs = list(docs)
        self.writes.extend(docs)
        return len(docs)

    def set(self, path, data, merge=False):
        self.writes.append((path, data))


class MainTests(unittest.TestCase):
    def test_a_refusal_writes_nothing_and_exits_2(self) -> None:
        from unittest import mock

        store = _Store()

        class Refused(senate.EfdClient):
            def search(self, since, until=None, max_pages=200):
                self.requests += 1
                raise senate.Blocked("eFD answered 403 for /search/home/")

        with mock.patch("backend.agentdata.store.DocStore.from_env", return_value=store), mock.patch.object(senate, "EfdClient", Refused):
            self.assertEqual(senate.main(["--force", "--skip-prices"]), 2)
        self.assertEqual(store.writes, [])

    def test_off_without_the_flag(self) -> None:
        from unittest import mock

        with mock.patch.dict("os.environ", {senate.ENABLE_FLAG: ""}):
            self.assertEqual(senate.main([]), 0)


if __name__ == "__main__":
    unittest.main()
