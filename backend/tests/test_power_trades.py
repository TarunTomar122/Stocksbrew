"""Tests for the power trades fetcher normalization layer."""
from __future__ import annotations

import unittest

from backend.power_trades import (
    dedupe,
    match_member,
    normalize_bargo,
    normalize_ci,
    parse_amount_range,
    trade_id,
)


MEMBERS = [
    {
        "id": "michael-mccaul",
        "name": "Michael McCaul",
        "chamber": "house",
        "party": "R",
        "state": "TX",
        "bargo_slugs": ["michael-t-mccaul"],
        "aliases": ["Michael McCaul", "Michael T. McCaul"],
    },
    {
        "id": "gilbert-cisneros",
        "name": "Gilbert Cisneros",
        "chamber": "house",
        "party": "D",
        "state": "CA",
        "bargo_slugs": ["gilbert-cisneros"],
        "aliases": ["Gilbert Cisneros", "Gilbert Ray Cisneros, Jr."],
    },
]


class ParseAmountRangeTest(unittest.TestCase):
    def test_standard_range(self):
        self.assertEqual(parse_amount_range("$15,001 - $50,000"), (15001.0, 50000.0))

    def test_no_spaces(self):
        self.assertEqual(parse_amount_range("$1,001-$15,000"), (1001.0, 15000.0))

    def test_single_number(self):
        self.assertEqual(parse_amount_range("$500"), (500.0, None))

    def test_garbage(self):
        self.assertEqual(parse_amount_range("n/a"), (None, None))
        self.assertEqual(parse_amount_range(""), (None, None))


class MatchMemberTest(unittest.TestCase):
    def test_not_on_watchlist(self):
        member = match_member("Sheldon Whitehouse", MEMBERS)
        self.assertIsNone(member)

    def test_alias_with_middle_initial(self):
        member = match_member("Michael T. McCaul", MEMBERS)
        self.assertIsNotNone(member)
        assert member is not None
        self.assertEqual(member["id"], "michael-mccaul")

    def test_suffix_ignored(self):
        member = match_member("Gilbert Ray Cisneros, Jr.", MEMBERS)
        self.assertIsNotNone(member)
        assert member is not None
        self.assertEqual(member["id"], "gilbert-cisneros")

    def test_unknown(self):
        self.assertIsNone(match_member("Steve Cohen", MEMBERS))


class NormalizeTest(unittest.TestCase):
    def test_normalize_bargo_purchase_maps_to_buy(self):
        raw = {
            "member": "Nancy Pelosi",
            "chamber": "house",
            "ticker": "NVDA",
            "asset": "NVIDIA Corporation - Common Stock",
            "type": "purchase",
            "amount_low": 1001,
            "amount_high": 15000,
            "transaction_date": "2026-07-01",
            "disclosure_date": "2026-07-20",
            "perf_pct": "12.5",
            "filing_portal": "https://example.gov/ptr.pdf",
        }
        row = normalize_bargo(raw, MEMBERS[0], "2026-08-23T00:00:00+00:00")
        self.assertEqual(row["tx_type"], "buy")
        self.assertEqual(row["amount_low"], 1001.0)
        self.assertEqual(row["amount_high"], 15000.0)
        self.assertEqual(row["lag_days"], 19)
        self.assertEqual(row["perf_pct"], 12.5)
        self.assertEqual(row["source"], "bargo")
        self.assertTrue(row["trade_id"])

    def test_normalize_ci_senate_shape(self):
        raw = {
            "member": "Sheldon Whitehouse",
            "chamber": "Senate",
            "trade_type": "sell",
            "amount": "$100,001 - $250,000",
            "tx_date": "2026-05-08",
            "disclosed": "2026-06-02",
            "asset": "NVIDIA Corporation - Common Stock",
            "ticker": "NVDA",
            "link": "https://efdsearch.senate.gov/search/view/ptr/x/",
        }
        row = normalize_ci(raw, MEMBERS[0], "2026-08-23T00:00:00+00:00")
        self.assertEqual(row["tx_type"], "sell")
        self.assertEqual(row["chamber"], "house")  # from watchlist, wins over source casing
        self.assertEqual(row["amount_low"], 100001.0)
        self.assertEqual(row["amount_high"], 250000.0)
        self.assertEqual(row["lag_days"], 25)
        self.assertIsNone(row["perf_pct"])
        self.assertEqual(row["source"], "congressinvests")

    def test_trade_id_stable_and_sensitive(self):
        a = trade_id("p1", "nvda", "buy", "2026-07-01", 1001.0, 15000.0)
        b = trade_id("p1", "NVDA", "buy", "2026-07-01", 1001.0, 15000.0)
        c = trade_id("p1", "NVDA", "sell", "2026-07-01", 1001.0, 15000.0)
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)


class DedupeTest(unittest.TestCase):
    def test_prefers_bargo_on_collision(self):
        base = {
            "trade_id": "abc",
            "transaction_date": "2026-07-01",
            "disclosure_date": "2026-07-20",
        }
        ci_row = {**base, "source": "congressinvests"}
        bargo_row = {**base, "source": "bargo"}
        out = dedupe([ci_row, bargo_row])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source"], "bargo")

    def test_sorted_desc_by_transaction_date(self):
        rows = [
            {"trade_id": "a", "transaction_date": "2026-07-01", "disclosure_date": "2026-07-02"},
            {"trade_id": "b", "transaction_date": "2026-07-15", "disclosure_date": "2026-07-16"},
        ]
        out = dedupe(rows)
        self.assertEqual([r["trade_id"] for r in out], ["b", "a"])


if __name__ == "__main__":
    unittest.main()
