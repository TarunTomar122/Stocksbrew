"""Pure logic behind the Follow surface: 13F parsing and diffs, the follow-the-filing
record, Form 4 parsing and cluster buys, and the House report book."""

from __future__ import annotations

import unittest

from backend.agentdata import funds_13f as f13
from backend.agentdata import house_ptr as house
from backend.agentdata import insiders_form4 as form4

INFO_TABLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>037833100</ns1:cusip><ns1:value>1,000,000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>5000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>037833100</ns1:cusip><ns1:value>500000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>2500</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>TESLA INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>88160R101</ns1:cusip><ns1:value>300000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>1000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
    <ns1:putCall>Put</ns1:putCall>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>SOME CONVERT</ns1:nameOfIssuer><ns1:titleOfClass>NOTE</ns1:titleOfClass>
    <ns1:cusip>17253JAA4</ns1:cusip><ns1:value>90000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>100000</ns1:sshPrnamt><ns1:sshPrnamtType>PRN</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
  <ns1:infoTable>
    <ns1:nameOfIssuer>SHORT CUSIP CO</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>2824100</ns1:cusip><ns1:value>100</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>10</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
  </ns1:infoTable>
</ns1:informationTable>"""


def holding(cusip: str, value: float, shares: float, issuer: str = "X") -> dict:
    return {"cusip": cusip, "issuer": issuer, "title_class": "COM", "value": value, "shares": shares}


class InfoTableTests(unittest.TestCase):
    def test_parses_rows_whatever_the_namespace(self) -> None:
        rows = f13.parse_info_table(INFO_TABLE)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["value"], 1_000_000.0)
        self.assertEqual(rows[2]["put_call"], "put")
        self.assertEqual(rows[4]["cusip"], "002824100")  # leading zeros restored

    def test_aggregate_adds_sub_manager_lines_and_keeps_options_apart(self) -> None:
        grouped = f13.aggregate_rows(f13.parse_info_table(INFO_TABLE))
        apple = grouped["stocks"][0]
        self.assertEqual((apple["cusip"], apple["value"], apple["shares"]), ("037833100", 1_500_000.0, 7500.0))
        self.assertEqual([item["put_call"] for item in grouped["options"]], ["put"])
        self.assertEqual([item["cusip"] for item in grouped["other"]], ["17253JAA4"])

    def test_value_scale_follows_the_date_unless_prices_say_otherwise(self) -> None:
        thousands = [holding("A", 2_000, 10_000)]  # $0.20 a share unless scaled by 1,000
        dollars = [holding("A", 2_000_000, 10_000)]
        self.assertEqual(f13.detect_value_scale("2022-11-14", thousands), (1000, False))
        self.assertEqual(f13.detect_value_scale("2023-02-14", dollars), (1, False))
        # A late switcher: filed after the change but still in thousands.
        self.assertEqual(f13.detect_value_scale("2023-02-14", thousands), (1000, True))
        # An early switcher: filed before the change but already in dollars.
        self.assertEqual(f13.detect_value_scale("2022-11-14", dollars), (1, True))

    def test_foreign_issuers_use_the_cins_lookup(self) -> None:
        self.assertEqual(f13.figi_id_type("H1467J104"), "ID_CINS")
        self.assertEqual(f13.figi_id_type("037833100"), "ID_CUSIP")
        self.assertEqual(f13.clean_ticker("BRK/B"), "BRK.B")
        self.assertEqual(f13.clean_ticker("WBD*"), "")


class ChangeDetectionTests(unittest.TestCase):
    def test_new_added_reduced_sold_and_held(self) -> None:
        prev = [holding("A", 100, 10), holding("B", 100, 10), holding("C", 100, 10), holding("D", 100, 10)]
        cur = [holding("A", 100, 10), holding("B", 300, 20), holding("C", 40, 5), holding("E", 60, 6)]
        diff = f13.diff_holdings(prev, cur)
        self.assertEqual([item["cusip"] for item in diff["held"]], ["A"])
        self.assertEqual([item["cusip"] for item in diff["added"]], ["B"])
        self.assertEqual(diff["added"][0]["shares_delta_pct"], 100.0)
        self.assertEqual([item["cusip"] for item in diff["reduced"]], ["C"])
        self.assertEqual(diff["reduced"][0]["shares_delta_pct"], -50.0)
        self.assertEqual([item["cusip"] for item in diff["new"]], ["E"])
        self.assertAlmostEqual(diff["new"][0]["weight"], 60 / 500)
        self.assertEqual([item["cusip"] for item in diff["sold"]], ["D"])
        self.assertAlmostEqual(diff["sold"][0]["prev_weight"], 0.25)

    def test_a_split_is_not_a_trade(self) -> None:
        # 10-for-1: ten times the shares, a tenth of the price.
        self.assertTrue(f13.looks_like_split(1_000, 10_000, 500_000, 520_000))
        # Ten times the shares at the same price is a real purchase.
        self.assertFalse(f13.looks_like_split(1_000, 10_000, 500_000, 5_000_000))
        diff = f13.diff_holdings([holding("A", 500_000, 1_000)], [holding("A", 520_000, 10_000)])
        self.assertEqual(len(diff["held"]), 1)
        self.assertTrue(diff["held"][0]["split_suspected"])
        self.assertEqual(diff["added"], [])

    def test_amendments_fold_into_their_quarter(self) -> None:
        def filing(form: str, filed: str, accession: str, stocks: list, amendment: str = "") -> dict:
            return {"form": form, "filed_at": filed, "accession": accession, "period": "2026-03-31", "stocks": stocks,
                    "options": [], "other": [], "amendment_type": amendment, "url": f"u/{accession}"}

        by_period, timeline = f13.build_periods(
            [
                filing("13F-HR", "2026-05-15", "a1", [holding("A", 100, 10)]),
                filing("13F-HR/A", "2026-06-01", "a2", [holding("B", 50, 5)], "NEW HOLDINGS"),
                filing("13F-HR/A", "2026-06-20", "a3", [holding("C", 70, 7)], "RESTATEMENT"),
            ]
        )
        state = by_period["2026-03-31"]
        self.assertEqual([item["cusip"] for item in state["stocks"]], ["C"])  # the restatement replaced everything
        self.assertEqual(state["first_filed_at"], "2026-05-15")
        self.assertEqual([event["date"] for event in timeline], ["2026-05-15", "2026-06-01", "2026-06-20"])
        self.assertEqual(sorted(item["cusip"] for item in timeline[1]["stocks"]), ["A", "B"])  # new holdings were added

    def test_issuer_names_read_like_names(self) -> None:
        self.assertEqual(f13.display_name("COCA-COLA CO/THE"), "Coca-Cola Co")
        self.assertEqual(f13.display_name("ALPHABET INC-CL A"), "Alphabet Inc Class A")
        self.assertEqual(f13.display_name("LENNAR CORP-A"), "Lennar Corp Class A")
        self.assertEqual(f13.display_name("BANK OF AMERICA CORP"), "Bank of America Corp")
        self.assertEqual(f13.display_name("T-MOBILE US INC"), "T-Mobile US Inc")
        self.assertEqual(f13.quarter_label("2026-06-30"), "Q2 2026")

    def test_headline_is_built_from_the_numbers(self) -> None:
        changes = {"new": [{"ticker": "DHI"}], "added": [{"ticker": "GOOGL"}, {"ticker": "DAL"}], "reduced": [], "sold": [{"ticker": None, "issuer": "CONSTELLATION BRANDS INC"}]}
        self.assertEqual(
            f13.build_headline("Berkshire Hathaway", "2026-08-14", "2026-06-30", changes),
            "Berkshire Hathaway filed on Aug 14 for Q2 2026: bought DHI, added to GOOGL and DAL, and sold out of Constellation Brands Inc.",
        )
        self.assertIn("first filing", f13.build_headline("X", "2026-08-14", "2026-06-30", None))


class PerformanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.calendar = [f"2026-01-{day:02d}" for day in range(1, 11)]
        self.series = {
            "UP": {"dates": self.calendar, "closes": [100 + 10 * step for step in range(10)]},  # +10 a day
            "FLAT": {"dates": self.calendar, "closes": [50.0] * 10},
            "LATE": {"dates": self.calendar[6:], "closes": [10.0, 11.0, 12.0, 13.0]},
        }
        self.book = f13.PriceBook(self.calendar, self.series)

    def test_follows_from_the_filing_date_not_before(self) -> None:
        run = f13.simulate_follow([{"date": "2026-01-03", "weights": {"UP": 1.0}}], self.book)
        self.assertEqual(run["dates"][0], "2026-01-03")
        self.assertAlmostEqual(run["values"][-1], 190 / 120)

    def test_weights_reset_at_each_filing_and_levels_chain(self) -> None:
        events = [
            {"date": "2026-01-01", "weights": {"UP": 0.5, "FLAT": 0.5}},
            {"date": "2026-01-06", "weights": {"FLAT": 1.0}},
        ]
        run = f13.simulate_follow(events, self.book)
        first_leg = 0.5 * 150 / 100 + 0.5  # day 1 to day 6
        self.assertAlmostEqual(run["values"][5], first_leg)
        self.assertAlmostEqual(run["values"][-1], first_leg)  # all in the flat stock afterwards
        self.assertEqual(len(run["values"]), len(run["dates"]))

    def test_unpriced_positions_are_dropped_and_coverage_is_reported(self) -> None:
        events = [{"date": "2026-01-02", "weights": {"UP": 0.6, "LATE": 0.3, "GONE": 0.1}}]
        run = f13.simulate_follow(events, self.book)
        self.assertAlmostEqual(run["coverage"][0]["covered_weight"], 0.6)
        self.assertEqual(run["coverage"][0]["priced"], 1)
        self.assertAlmostEqual(run["values"][-1], 190 / 110)  # the priced name carries the whole book

    def test_an_empty_book_sits_in_cash(self) -> None:
        run = f13.simulate_follow(
            [{"date": "2026-01-01", "weights": {"UP": 1.0}}, {"date": "2026-01-05", "weights": {}}], self.book
        )
        self.assertAlmostEqual(run["values"][-1], 140 / 100)

    def test_windows_drawdown_and_month_shift(self) -> None:
        self.assertAlmostEqual(f13.max_drawdown([1.0, 1.2, 0.9, 1.5, 1.35]), 0.9 / 1.2 - 1)
        self.assertIsNone(f13.max_drawdown([1.0]))
        self.assertEqual(f13.shift_months("2026-03-31", -1), "2026-02-28")
        self.assertEqual(f13.shift_months("2026-01-15", -12), "2025-01-15")
        dates = ["2025-12-30", "2025-12-31", "2026-01-02", "2026-02-02", "2026-03-02"]
        values = [1.0, 1.1, 1.2, 1.3, 1.43]
        self.assertAlmostEqual(f13.window_return(dates, values, "2026-02-02"), 1.43 / 1.3 - 1)
        self.assertIsNone(f13.window_return(dates, values, "2025-01-01"))  # before the record starts
        stats = f13.performance_stats(dates, values)
        self.assertAlmostEqual(stats["r_ytd"], 1.43 / 1.1 - 1)  # from the last close of the prior year
        self.assertAlmostEqual(stats["r_1m"], 1.43 / 1.3 - 1)
        self.assertIsNone(stats["r_1y"])
        self.assertIsNone(stats["annualized"])  # under a year
        self.assertAlmostEqual(stats["r_since"], 0.43)
        over = f13.performance_stats(dates, values, ended=True)  # a record that stopped has no "past month"
        self.assertEqual((over["r_1m"], over["r_ytd"], over["r_1y"]), (None, None, None))
        self.assertAlmostEqual(over["r_since"], 0.43)

    def test_downsample_keeps_the_last_session(self) -> None:
        rows = f13.downsample([f"d{index}" for index in range(12)], list(range(12)), step=5)
        self.assertEqual([row[0] for row in rows], ["d0", "d5", "d10", "d11"])


FORM4 = """<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <periodOfReport>2026-11-03</periodOfReport>
  <issuer><issuerCik>0000320193</issuerCik><issuerName>Apple Inc.</issuerName><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0001214156</rptOwnerCik><rptOwnerName>COOK TIMOTHY D</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>true</isOfficer><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <aff10b5One>1</aff10b5One>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-11-03</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>M</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>50000</value></transactionShares><transactionPricePerShare><value>0</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>3330000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-11-03</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>10,000</value></transactionShares><transactionPricePerShare><value>250.00</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>3320000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-11-04</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>30000</value></transactionShares><transactionPricePerShare><value>260.00</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>3290000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>"""


def buy(symbol: str, insider: str, day: str, value: float = 1000.0) -> dict:
    return {"id": f"{symbol}-{insider}-{day}", "symbol": symbol, "company": f"{symbol} Inc", "insider": insider,
            "insider_id": insider, "role": "Director", "tx_type": "buy", "shares": 10.0, "value": value,
            "transaction_date": day, "filed_at": f"{day}T17:00:00"}


class Form4Tests(unittest.TestCase):
    def test_parses_issuer_owner_and_transactions(self) -> None:
        parsed = form4.parse_form4(FORM4)
        assert parsed is not None
        self.assertEqual((parsed["issuer_cik"], parsed["issuer_symbol"]), ("320193", "AAPL"))
        self.assertTrue(parsed["plan_10b5_1"])
        owner = parsed["owners"][0]
        self.assertEqual(owner["name"], "Timothy D. Cook")
        self.assertEqual(owner["role"], "Chief Executive Officer, Director")
        self.assertEqual([item["code"] for item in parsed["transactions"]], ["M", "S", "S"])
        self.assertIsNone(parsed["transactions"][0]["price"])  # a zero price is no price

    def test_only_open_market_codes_are_summarised(self) -> None:
        lines = form4.summarize_open_market(form4.parse_form4(FORM4))
        self.assertEqual(len(lines), 1)
        sale = lines[0]
        self.assertEqual((sale["code"], sale["tx_type"], sale["fills"]), ("S", "sell", 2))
        self.assertEqual(sale["shares"], 40000)
        self.assertAlmostEqual(sale["value"], 10_000 * 250 + 30_000 * 260)
        self.assertAlmostEqual(sale["price"], 257.5)
        self.assertEqual((sale["first_transaction_date"], sale["transaction_date"]), ("2026-11-03", "2026-11-04"))
        self.assertEqual(sale["shares_after"], 3_290_000)

    def test_trade_docs_carry_filing_time_and_lag(self) -> None:
        docs = form4.build_trade_docs(
            form4.parse_form4(FORM4), symbol="AAPL", company="Apple", accession="0001-26-000001",
            filing_date="2026-11-05", accepted_at="2026-11-05T18:31:02", url="https://sec.example/idx", captured_at="now",
        )
        self.assertEqual(len(docs), 1)
        path, data = docs[0]
        self.assertEqual(path, "tm_insider_trades/0001-26-000001__1214156__S")
        self.assertEqual((data["lag_days"], data["filed_at"], data["filed_at_zone"]), (1, "2026-11-05T18:31:02", "America/New_York"))
        self.assertTrue(data["is_officer"])

    def test_not_a_form4_and_names(self) -> None:
        self.assertIsNone(form4.parse_form4("<html>nope</html>"))
        self.assertEqual(form4.tidy_name("MCDONALD JOHN A JR"), "John A. McDonald Jr.")
        self.assertEqual(form4.tidy_name("BERKSHIRE HATHAWAY INC"), "Berkshire Hathaway Inc")
        self.assertEqual(form4.tidy_name("Gusek Ron"), "Ron Gusek")  # last name first even in mixed case
        self.assertEqual(form4.tidy_name("Gosney Ryan T"), "Ryan T. Gosney")
        self.assertEqual(form4.tidy_name("Nippon Life Insurance Co"), "Nippon Life Insurance Co")
        self.assertEqual(form4.tidy_title("CHIEF GROWTH OFFICER"), "Chief Growth Officer")
        self.assertEqual(form4.tidy_title("PRESIDENT & CEO"), "President & CEO")
        self.assertEqual(form4.tidy_title("EVP, Chief Financial Officer"), "EVP, Chief Financial Officer")
        self.assertEqual(form4.insider_role({"is_ten_percent_owner": True}), "10% owner")
        self.assertEqual(form4.acceptance_iso("2026-11-05T18:31:02.000Z"), "2026-11-05T13:31:02")  # UTC to Eastern (EST)
        self.assertEqual(form4.acceptance_iso("2026-07-02T00:46:00.000Z"), "2026-07-01T20:46:00")  # EDT, and the day rolls back
        self.assertEqual(form4.acceptance_iso(""), "")

    def test_recent_form4_filters_by_form_and_date(self) -> None:
        submissions = {"filings": {"recent": {
            "form": ["4", "8-K", "4/A", "4"],
            "accessionNumber": ["a", "b", "c", "d"],
            "filingDate": ["2026-11-05", "2026-11-04", "2026-11-01", "2026-08-01"],
            "acceptanceDateTime": ["2026-11-05T18:31:02.000Z", "", "2026-11-01T09:00:00.000Z", ""],
            "primaryDocument": ["xslF345X05/wk-form4_1.xml", "x.htm", "xslF345X05/form4a.xml", "old.xml"],
        }}}
        found = form4.recent_form4(submissions, "2026-10-01")
        self.assertEqual([item["accession"] for item in found], ["a", "c"])
        self.assertEqual(found[0]["xml_name"], "wk-form4_1.xml")

    def test_cluster_needs_three_different_insiders_within_thirty_days(self) -> None:
        trades = [
            buy("AAA", "ann", "2026-10-01"), buy("AAA", "bob", "2026-10-10"), buy("AAA", "cy", "2026-10-28", 5000.0),
            buy("BBB", "ann", "2026-10-01"), buy("BBB", "ann", "2026-10-02"), buy("BBB", "bob", "2026-10-03"),  # two people
            buy("CCC", "ann", "2026-08-01"), buy("CCC", "bob", "2026-09-15"), buy("CCC", "cy", "2026-10-30"),  # too spread out
            {**buy("DDD", "ann", "2026-10-01"), "tx_type": "sell"},
        ]
        clusters = form4.detect_clusters(trades)
        self.assertEqual([cluster["symbol"] for cluster in clusters], ["AAA"])
        cluster = clusters[0]
        self.assertEqual((cluster["insiders"], cluster["first_date"], cluster["last_date"]), (3, "2026-10-01", "2026-10-28"))
        self.assertEqual(cluster["total_value"], 7000.0)
        self.assertEqual(cluster["members"][0]["insider"], "cy")  # biggest buyer first

    def test_symbol_totals_count_people_not_filings(self) -> None:
        totals = form4.symbol_totals([buy("AAA", "ann", "2026-10-01"), buy("AAA", "ann", "2026-10-02"), buy("AAA", "bob", "2026-10-03")])
        self.assertEqual((totals["AAA"]["buys"], totals["AAA"]["buyers"], totals["AAA"]["buy_value"]), (3, 2, 3000.0))


def ptr_trade(ticker: str, side: str, filed: str, amount: float, partial: bool = False, traded: str = "") -> dict:
    return {"ticker": ticker, "tx_type": side, "disclosure_date": filed, "transaction_date": traded or filed,
            "est_amount": amount, "partial": partial}


class HouseReportTests(unittest.TestCase):
    def test_lines_read_top_to_bottom(self) -> None:
        # PDF y grows upward: the row is above its wrapped second line.
        chunks = [
            {"page": 0, "x": 105.0, "y": 449.0, "text": "Stock (FERG)"},
            {"page": 0, "x": 160.0, "y": 449.0, "text": "[ST]"},
            {"page": 0, "x": 446.0, "y": 449.0, "text": "$50,000"},
            {"page": 0, "x": 66.0, "y": 459.0, "text": "SP"},
            {"page": 0, "x": 105.0, "y": 459.0, "text": "Ferguson Enterprises Inc. Common"},
            {"page": 0, "x": 262.0, "y": 459.0, "text": "P"},
            {"page": 0, "x": 327.0, "y": 459.0, "text": "12/12/2025"},
            {"page": 0, "x": 381.0, "y": 459.0, "text": "01/06/2026"},
            {"page": 0, "x": 446.0, "y": 459.0, "text": "$15,001 -"},
            {"page": 0, "x": 105.0, "y": 431.0, "text": "F S:"},
            {"page": 0, "x": 163.0, "y": 431.0, "text": "New"},
            {"page": 0, "x": 525.0, "y": 481.0, "text": "$200?"},
        ]
        rows = house.parse_transactions(chunks)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row["ticker"], row["asset_type"], row["tx_type"], row["owner"]), ("FERG", "ST", "buy", "SP"))
        self.assertEqual((row["amount_low"], row["amount_high"]), (15001.0, 50000.0))
        self.assertEqual((row["transaction_date"], row["notification_date"]), ("2025-12-12", "2026-01-06"))

    def test_index_rows_and_slugs(self) -> None:
        xml = b"""<FinancialDisclosure>
          <Member><Prefix>Hon.</Prefix><Last>Aderholt</Last><First>Robert B.</First><Suffix/><FilingType>P</FilingType><StateDst>AL04</StateDst><Year>2025</Year><FilingDate>9/10/2025</FilingDate><DocID>20032062</DocID></Member>
          <Member><Last>Other</Last><First>A</First><FilingType>C</FilingType><StateDst>TX01</StateDst><Year>2025</Year><FilingDate>1/1/2025</FilingDate><DocID>1</DocID></Member>
        </FinancialDisclosure>"""
        rows = house.parse_index(xml)
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["filed_at"], rows[0]["state"], rows[0]["district"]), ("2025-09-10", "AL", "4"))
        self.assertEqual(house.member_slug("Robert B.", "Aderholt"), "robert-aderholt")
        self.assertEqual(house.member_slug("Marjorie Taylor", "Greene"), "marjorie-greene")

    def test_brackets(self) -> None:
        self.assertEqual(house.parse_amount("$1,001 - $15,000"), (1001.0, 15000.0))
        self.assertEqual(house.parse_amount("Over $50,000,000"), (50_000_000.0, None))
        self.assertEqual(house.amount_mid(1001.0, 15000.0), 8000.5)
        self.assertEqual(house.amount_mid(50_000_000.0, None), 50_000_000.0)
        self.assertIsNone(house.amount_mid(None, None))
        self.assertEqual(house.clean_ptr_ticker("brk/b"), "BRK.B")
        self.assertEqual(house.clean_ptr_ticker("N/A!"), "")

    def test_book_after_each_report(self) -> None:
        events = house.disclosed_book_events(
            [
                ptr_trade("ZZZ", "sell", "2026-01-05", 8000),  # sold something we never saw bought: ignored
                ptr_trade("AAA", "buy", "2026-01-10", 8000),
                ptr_trade("BBB", "buy", "2026-01-10", 24000),
                ptr_trade("BBB", "sell", "2026-02-01", 8000, partial=True),
                ptr_trade("AAA", "sell", "2026-03-01", 8000),
                ptr_trade("BBB", "sell", "2026-03-01", 8000),
            ]
        )
        self.assertEqual([event["date"] for event in events], ["2026-01-10", "2026-02-01", "2026-03-01"])
        self.assertAlmostEqual(events[0]["weights"]["BBB"], 0.75)
        self.assertAlmostEqual(events[1]["weights"]["BBB"], 16000 / 24000)
        self.assertEqual(events[2]["weights"], {})  # everything disclosed has been sold: cash

    def test_member_stats_and_headline(self) -> None:
        trades = [
            {**ptr_trade("AAA", "buy", "2026-01-10", 8000), "lag_days": 10, "company": "Aaa"},
            {**ptr_trade("BBB", "buy", "2026-01-10", 24000), "lag_days": 60, "company": "Bbb"},
            {**ptr_trade("AAA", "sell", "2026-03-01", 8000), "lag_days": 20, "company": "Aaa"},
        ]
        stats = house.member_stats(trades)
        self.assertEqual((stats["trades"], stats["buys"], stats["sells"], stats["late_trades"], stats["median_lag_days"]), (3, 2, 1, 1, 20))
        self.assertEqual(stats["top_bought"][0], {"ticker": "BBB", "name": "Bbb", "weight": 0.75})
        self.assertEqual(house.congress_headline("Jane Roe", "2026-01-10", trades), "Jane Roe reported on Jan 10: bought BBB and AAA and sold AAA.")


if __name__ == "__main__":
    unittest.main()
