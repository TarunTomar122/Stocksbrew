import unittest

from backend.agentdata import etf_holdings as etf
from backend.agentdata.store import _check_writable

NPORT = b"""<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/nport">
  <headerData><filerInfo><seriesClassInfo><seriesId>S000002839</seriesId></seriesClassInfo></filerInfo></headerData>
  <formData>
    <genInfo>
      <regName>VANGUARD INDEX FUNDS</regName>
      <seriesName>VANGUARD 500 INDEX FUND</seriesName>
      <seriesId>S000002839</seriesId>
      <repPdEnd>2026-12-31</repPdEnd>
      <repPdDate>2026-06-30</repPdDate>
    </genInfo>
    <fundInfo><netAssets>1000.00</netAssets></fundInfo>
    <invstOrSecs>
      <invstOrSec>
        <name>NVIDIA Corp</name><title>NVIDIA CORP</title><cusip>67066G104</cusip>
        <identifiers><isin value="US67066G1040"/></identifiers>
        <balance>10</balance><units>NS</units><valUSD>400</valUSD><pctVal>40.0</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>EC</assetCat><invCountry>US</invCountry>
      </invstOrSec>
      <invstOrSec>
        <name>NVIDIA Corp</name><title>NVIDIA CORP</title><cusip>67066G104</cusip>
        <balance>1</balance><units>NS</units><valUSD>40</valUSD><pctVal>4.0</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Apple Inc</name><title>APPLE INC</title><cusip>N/A</cusip>
        <identifiers><isin value="US0378331005"/></identifiers>
        <balance>5</balance><units>NS</units><valUSD>300</valUSD><pctVal>30.0</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Exxon Mobil Corp</name><title>EXXON MOBIL</title><cusip>99999X999</cusip>
        <balance>5</balance><units>NS</units><valUSD>100</valUSD><pctVal>10.0</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Mystery Holdings</name><title>MYSTERY</title><cusip>88888Y888</cusip>
        <balance>5</balance><units>NS</units><valUSD>5</valUSD><pctVal>0.5</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>E-mini S&amp;P 500 Future</name><title>SPX FUT</title><cusip>N/A</cusip>
        <balance>3</balance><units>NC</units><valUSD>0.5</valUSD><pctVal>0.05</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>DE</assetCat>
        <derivativeInfo><futrDeriv><notionalAmt>30</notionalAmt></futrDeriv></derivativeInfo>
      </invstOrSec>
      <invstOrSec>
        <name>Market Liquidity Fund</name><title>CASH FUND</title><cusip>92202V351</cusip>
        <balance>4</balance><units>NS</units><valUSD>4</valUSD><pctVal>0.4</pctVal>
        <payoffProfile>Long</payoffProfile><assetConditional assetCat="STIV"/>
      </invstOrSec>
      <invstOrSec>
        <name>A Corporate Bond</name><title>BOND</title><cusip>12345B678</cusip>
        <balance>4</balance><units>PA</units><valUSD>4</valUSD><pctVal>0.4</pctVal>
        <payoffProfile>Long</payoffProfile><assetCat>DBT</assetCat>
      </invstOrSec>
    </invstOrSecs>
  </formData>
</edgarSubmission>
"""


class FakeCusips:
    def __init__(self, mapping):
        self.mapping = mapping

    def ticker(self, cusip):
        return self.mapping.get(cusip)


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.parsed = etf.parse_nport(NPORT)
        self.summary = etf.summarise_positions(self.parsed["positions"])

    def test_header_fields(self):
        self.assertEqual(self.parsed["as_of"], "2026-06-30")
        self.assertEqual(self.parsed["series_id"], "S000002839")
        self.assertEqual(self.parsed["net_assets_usd"], 1000.0)
        self.assertEqual(self.parsed["series_name"], "VANGUARD 500 INDEX FUND")

    def test_stocks_fold_by_cusip_and_sort_by_weight(self):
        stocks = self.summary["stocks"]
        self.assertEqual([item["name"] for item in stocks], ["NVIDIA Corp", "Apple Inc", "Exxon Mobil Corp", "Mystery Holdings"])
        self.assertAlmostEqual(stocks[0]["weight"], 0.44)
        self.assertEqual(stocks[0]["shares"], 11)

    def test_isin_stands_in_for_a_missing_cusip(self):
        self.assertEqual(self.summary["stocks"][1]["cusip"], "037833100")

    def test_debt_is_not_counted_as_a_derivative(self):
        self.assertAlmostEqual(self.summary["derivatives_gross_weight"], 0.0005)
        self.assertAlmostEqual(self.summary["derivatives_notional_usd"], 30)
        self.assertAlmostEqual(self.summary["other_weight"], 0.008)  # the cash fund and the bond

    def test_equity_weight(self):
        self.assertAlmostEqual(self.summary["equity_weight"], 0.845)


class StatusTest(unittest.TestCase):
    def base(self, **over):
        summary = {"equity_weight": 0.99, "derivatives_gross_weight": 0.0, "derivatives_notional_usd": 0.0, "short_equity_weight": 0.0}
        summary.update(over)
        return summary

    def test_plain_index_fund_is_ok(self):
        self.assertEqual(etf.fund_status(self.base(), 1000)[0], "ok")

    def test_cash_equitisation_futures_do_not_disqualify(self):
        self.assertEqual(etf.fund_status(self.base(derivatives_notional_usd=20), 1000)[0], "ok")

    def test_leveraged_fund_with_mostly_stocks_is_still_derivatives(self):
        status, note = etf.fund_status(self.base(equity_weight=0.69, derivatives_notional_usd=2400), 1000)
        self.assertEqual(status, "derivatives")
        self.assertIn("swaps", note)

    def test_bond_fund(self):
        self.assertEqual(etf.fund_status(self.base(equity_weight=0.05), 1000)[0], "not_stocks")


class MappingTest(unittest.TestCase):
    def test_name_key_meets_sec_titles(self):
        self.assertEqual(etf.name_key("Exxon Mobil Corp"), etf.name_key("ExxonMobil Holdings Corp"))
        self.assertEqual(etf.name_key("ONEOK INC /NEW/"), "ONEOK")
        self.assertEqual(etf.name_key("Coca-Cola Co/The"), "COCACOLA")

    def test_name_index_keeps_the_first_class(self):
        index = etf.build_name_index(
            {"0": {"ticker": "GOOGL", "title": "Alphabet Inc."}, "1": {"ticker": "GOOG", "title": "Alphabet Inc."}, "2": {"ticker": "BRK-B", "title": "BERKSHIRE HATHAWAY INC"}}
        )
        self.assertEqual(index["ALPHABET"], "GOOGL")
        self.assertEqual(index["BERKSHIREHATHAWAY"], "BRK.B")

    def test_cusip_wins_then_name_then_nothing(self):
        summary = etf.summarise_positions(etf.parse_nport(NPORT)["positions"])
        ticker_of = etf.make_ticker_of(FakeCusips({"67066G104": "NVDA", "037833100": "AAPL"}), {"EXXONMOBIL": "XOM"})
        rows = etf.holding_rows(summary["stocks"], ticker_of)
        self.assertEqual([(row["ticker"], row["mapped_by"]) for row in rows], [("NVDA", "cusip"), ("AAPL", "cusip"), ("XOM", "name"), (None, None)])

    def test_name_shared_by_two_companies_is_dropped(self):
        index = etf.build_name_index(
            {
                "0": {"ticker": "FBNC", "title": "FIRST BANCORP /NC/", "cik_str": 1},
                "1": {"ticker": "FBP", "title": "FIRST BANCORP /PR/", "cik_str": 2},
                "2": {"ticker": "GOOGL", "title": "Alphabet Inc.", "cik_str": 3},
                "3": {"ticker": "GOOG", "title": "Alphabet Inc.", "cik_str": 3},
            }
        )
        self.assertNotIn("FIRSTBANCORP", index)
        self.assertEqual(index["ALPHABET"], "GOOGL")

    def test_fund_inside_a_fund_is_not_a_company(self):
        summary = etf.summarise_positions(
            [
                {"name": "Some Stock", "cusip": "123456789", "pctVal": "90", "assetCat": "EC", "issuerCat": "CORP"},
                {"name": "Another ETF", "cusip": "987654321", "pctVal": "9", "assetCat": "EC", "issuerCat": "RF"},
            ]
        )
        self.assertEqual([item["name"] for item in summary["stocks"]], ["Some Stock"])
        self.assertAlmostEqual(summary["fund_weight"], 0.09)

    def test_written_calls_do_not_count_as_leverage(self):
        summary = etf.summarise_positions(
            [
                {"name": "Stock", "cusip": "123456789", "pctVal": "99", "assetCat": "EC"},
                {"name": "NDX call", "pctVal": "-1", "assetCat": "DE", "notional_usd": 1000.0, "written_option": True},
            ]
        )
        self.assertEqual(summary["derivatives_notional_usd"], 0.0)
        self.assertEqual(etf.fund_status(summary, 1000.0)[0], "ok")

    def test_cusip_from_isin(self):
        self.assertEqual(etf.cusip_from_isin("US0378331005"), "037833100")
        self.assertEqual(etf.cusip_from_isin("GB0002875804"), "")
        self.assertEqual(etf.usable_cusip("000000000", "US0378331005"), "037833100")


class DocTest(unittest.TestCase):
    def test_doc_carries_source_and_as_of(self):
        parsed = etf.parse_nport(NPORT)
        summary = etf.summarise_positions(parsed["positions"])
        rows = etf.holding_rows(summary["stocks"], etf.make_ticker_of(FakeCusips({"67066G104": "NVDA"}), {}))
        filing = {
            "cik": 36405, "accession": "0000036405-26-000473", "form": "NPORT-P", "filed_at": "2026-08-28",
            "index_url": "https://www.sec.gov/x-index.htm", "xml_url": "https://www.sec.gov/x.xml",
        }
        doc = etf.build_fund_doc(ticker="VOO", filing=filing, parsed=parsed, summary=summary, rows=rows, fetched_at="2026-11-11T00:00:00+00:00")
        self.assertEqual(doc["as_of"], "2026-06-30")
        self.assertEqual(doc["fund_name"], "Vanguard 500 Index Fund")
        self.assertEqual(doc["source_url"], "https://www.sec.gov/x-index.htm")
        self.assertEqual(doc["status"], "ok")
        self.assertAlmostEqual(doc["mapped_weight"], 0.44)
        self.assertEqual(len(doc["holdings"]), 4)

    def test_derivative_fund_keeps_no_holdings(self):
        parsed = {"series_name": "DIREXION DAILY 3X", "as_of": "2026-07-31", "net_assets_usd": 100.0}
        summary = {"stocks": [], "equity_weight": 0.7, "derivatives_gross_weight": 0.1, "derivatives_notional_usd": 200.0, "short_equity_weight": 0.0, "fund_weight": 0.0}
        rows = [{"ticker": "NVDA", "weight": 0.1}]
        filing = {"cik": 1, "accession": "a", "form": "NPORT-P", "filed_at": "2026-09-01", "index_url": "u", "xml_url": "x"}
        doc = etf.build_fund_doc(ticker="SOXL", filing=filing, parsed=parsed, summary=summary, rows=rows, fetched_at="t")
        self.assertEqual(doc["status"], "derivatives")
        self.assertEqual(doc["holdings"], [])


class FeedTest(unittest.TestCase):
    def test_atom_entries_and_pick(self):
        atom = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
        <entry><content type="text/xml"><accession-number>0000036405-26-000473</accession-number>
        <filing-date>2026-08-28</filing-date><filing-href>https://www.sec.gov/Archives/edgar/data/36405/000003640526000473/0000036405-26-000473-index.htm</filing-href>
        <filing-type>NPORT-P</filing-type></content></entry>
        <entry><content type="text/xml"><accession-number>0000036405-26-000100</accession-number>
        <filing-date>2026-05-28</filing-date><filing-href>https://www.sec.gov/Archives/edgar/data/36405/000003640526000100/x-index.htm</filing-href>
        <filing-type>NPORT-P</filing-type></content></entry></feed>"""
        filings = etf.parse_atom_filings(atom)
        self.assertEqual([item["accession"] for item in filings], ["0000036405-26-000473", "0000036405-26-000100"])
        self.assertEqual(filings[0]["cik"], 36405)

    def test_pick_filing_prefers_latest_period_then_latest_filing(self):
        chosen = etf.pick_filing(
            [
                {"form": "NPORT-P", "accession": "1", "filed_at": "2026-08-28", "period": "2026-06-30"},
                {"form": "NPORT-P/A", "accession": "2", "filed_at": "2026-09-10", "period": "2026-06-30"},
                {"form": "NPORT-P", "accession": "3", "filed_at": "2026-05-28", "period": "2026-03-31"},
                {"form": "N-CSR", "accession": "4", "filed_at": "2026-10-01", "period": "2026-09-30"},
            ]
        )
        self.assertEqual(chosen["accession"], "2")


class DiscoveryAndMetaTest(unittest.TestCase):
    def test_fund_name_check(self):
        self.assertTrue(etf.looks_like_fund_name("Invesco QQQ Trust", "QQQ"))
        self.assertTrue(etf.looks_like_fund_name("SOXL", "SOXL"))
        self.assertTrue(etf.looks_like_fund_name(None, "IWM"))
        self.assertFalse(etf.looks_like_fund_name("Space Exploration Technologies Corp.", "SPCX"))

    def test_meta_keeps_prior_funds_and_updates_new(self):
        previous = {"funds": {"VOO": {"status": "ok", "as_of": "2026-03-31", "fund_name": "Vanguard 500"}, "DIA": {"status": "ok", "as_of": "2026-07-31", "fund_name": "Dow"}}}
        report = [
            {"ticker": "VOO", "status": "ok", "as_of": "2026-06-30", "fund_name": "Vanguard 500 Index Fund"},
            {"ticker": "DIA", "status": "unchanged", "as_of": "2026-07-31"},
            {"ticker": "XYZ", "status": "missing"},
        ]
        meta = etf.build_meta(report, previous, "now")
        self.assertEqual(meta["funds"]["VOO"]["as_of"], "2026-06-30")
        self.assertEqual(meta["funds"]["DIA"]["fund_name"], "Dow")
        self.assertNotIn("XYZ", meta["funds"])

    def test_collections_are_writable(self):
        for path in ("tm_etf_holdings/VOO", "tm_etf_cusip_map/037833100", "tm_etf_meta/latest"):
            _check_writable(path)

    def test_tidy_name(self):
        self.assertEqual(etf.tidy_name("N/A"), "")
        self.assertEqual(etf.tidy_name("State Street(R) Technology Select Sector SPDR(R) ETF"), "State Street Technology Select Sector SPDR ETF")


if __name__ == "__main__":
    unittest.main()
