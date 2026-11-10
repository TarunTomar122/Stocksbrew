import unittest

from backend.agentdata import fund_holders
from backend.agentdata.store import _check_writable


def profile(slug, fund, portfolio, sold=None, **extra):
    return {
        "slug": slug,
        "fund": fund,
        "manager": f"{fund} manager",
        "latest": {"period": "2026-06-30", "quarter": "Q2 2026", "filed_at": "2026-08-14", "url": f"https://sec.gov/{slug}"},
        "portfolio": portfolio,
        "changes": {"sold": sold or []},
        "compared_with": "2026-03-31",
        **extra,
    }


class BuildHolderDocsTest(unittest.TestCase):
    def setUp(self):
        self.docs = fund_holders.build_holder_docs(
            [
                profile(
                    "alpha",
                    "Alpha Capital",
                    [
                        {"ticker": "NVDA", "value": 500, "weight": 0.25, "shares": 10, "change": "added", "shares_delta_pct": 12.5},
                        {"ticker": None, "value": 400, "weight": 0.2},
                        {"ticker": "BRK/B", "value": 100, "weight": 0.05},
                    ],
                    sold=[{"ticker": "AAPL", "prev_value": 90, "prev_weight": 0.04}],
                ),
                profile("beta", "Beta Partners", [{"ticker": "nvda", "value": 900, "weight": 0.1, "held_since": "2024-03-31"}]),
                {"slug": "broken", "fund": "No latest filing", "portfolio": [{"ticker": "NVDA", "value": 1}]},
            ],
            now_iso="2026-11-09T00:00:00+00:00",
        )

    def test_holders_are_grouped_by_ticker_and_sorted_by_value(self):
        nvda = self.docs["tm_fund_holders/NVDA"]
        self.assertEqual([row["slug"] for row in nvda["holders"]], ["beta", "alpha"])
        self.assertEqual(nvda["holder_count"], 2)
        self.assertEqual(nvda["holders"][1]["rank"], 1)
        self.assertEqual(nvda["holders"][1]["shares_delta_pct"], 12.5)
        self.assertEqual(nvda["holders"][0]["held_since"], "2024-03-31")
        self.assertEqual(nvda["latest_filed_at"], "2026-08-14")

    def test_unmapped_positions_and_funds_without_a_filing_are_skipped(self):
        self.assertEqual(len(self.docs), 3)
        self.assertNotIn("tm_fund_holders/", self.docs)

    def test_class_share_tickers_get_a_store_safe_id(self):
        self.assertIn("tm_fund_holders/BRK.B", self.docs)
        self.assertEqual(self.docs["tm_fund_holders/BRK.B"]["ticker"], "BRK/B")

    def test_exits_are_kept_for_tickers_no_fund_holds_now(self):
        aapl = self.docs["tm_fund_holders/AAPL"]
        self.assertEqual(aapl["holders"], [])
        self.assertEqual(aapl["sold"][0]["slug"], "alpha")
        self.assertEqual(aapl["sold"][0]["compared_with"], "2026-03-31")

    def test_missing_numbers_stay_unknown(self):
        row = self.docs["tm_fund_holders/BRK.B"]["holders"][0]
        self.assertIsNone(row["shares"])
        self.assertIsNone(row["shares_delta_pct"])

    def test_paths_are_inside_the_writable_prefixes(self):
        for path in list(self.docs) + ["tm_fund_holders_meta/run"]:
            _check_writable(path)


if __name__ == "__main__":
    unittest.main()
