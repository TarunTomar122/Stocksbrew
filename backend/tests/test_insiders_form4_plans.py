"""Form 4 lines that are not open-market trades of the listed share.

The fixtures are trimmed copies of TSMC's real Form 4s from November 2026:
a monthly ESPP purchase coded P (0001046179-26-000779), a discretionary buy of
Taiwan shares priced per Taiwan share (0001046179-26-000732), and a director
buying the US ADRs (0001046179-26-000734).
"""

from __future__ import annotations

import unittest
from typing import Any

from backend.agentdata import insiders_form4 as form4

ISSUER = """
    <issuer>
        <issuerCik>0001046179</issuerCik>
        <issuerName>TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD</issuerName>
        <issuerTradingSymbol>TSM</issuerTradingSymbol>
        <issuerForeignTradingSymbol>2330.TW</issuerForeignTradingSymbol>
    </issuer>"""


def owner(cik: str, name: str, title: str = "VP", director: str = "0") -> str:
    return f"""
    <reportingOwner>
        <reportingOwnerId><rptOwnerCik>{cik}</rptOwnerCik><rptOwnerName>{name}</rptOwnerName></reportingOwnerId>
        <reportingOwnerRelationship>
            <isDirector>{director}</isDirector><isOfficer>{"1" if title else "0"}</isOfficer>
            <isTenPercentOwner>0</isTenPercentOwner><isOther>0</isOther><officerTitle>{title}</officerTitle>
        </reportingOwnerRelationship>
    </reportingOwner>"""


def purchase(title: str, shares: str, price: str, *, date: str = "2026-11-06", nature: str = "", date_note: str = "", price_note: str = "", after_note: str = "", indirect: bool = False) -> str:
    nature_xml = f"<natureOfOwnership><value>{nature}</value></natureOfOwnership>" if nature else ""
    return f"""
        <nonDerivativeTransaction>
            <securityTitle><value>{title}</value></securityTitle>
            <transactionDate><value>{date}</value>{date_note}</transactionDate>
            <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding>
            <transactionAmounts>
                <transactionShares><value>{shares}</value></transactionShares>
                <transactionPricePerShare><value>{price}</value>{price_note}</transactionPricePerShare>
                <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
            </transactionAmounts>
            <postTransactionAmounts><sharesOwnedFollowingTransaction><value>8000</value>{after_note}</sharesOwnedFollowingTransaction></postTransactionAmounts>
            <ownershipNature><directOrIndirectOwnership><value>{"I" if indirect else "D"}</value></directOrIndirectOwnership>{nature_xml}</ownershipNature>
        </nonDerivativeTransaction>"""


def document(owners: str, rows: str, footnotes: str, issuer: str = ISSUER) -> str:
    return f"""<?xml version="1.0"?>
<ownershipDocument>
    <schemaVersion>X0609</schemaVersion>
    <documentType>4</documentType>
    <periodOfReport>2026-11-06</periodOfReport>
    {issuer}
    {owners}
    <aff10b5One>0</aff10b5One>
    <nonDerivativeTable>{rows}</nonDerivativeTable>
    <footnotes>{footnotes}</footnotes>
</ownershipDocument>"""


TSMC_ESPP = document(
    owner("0002113717", "Wei Che-Chia", "Chairman and CEO", director="1"),
    purchase(
        "Common Shares (2330.TW)", "155", "70.50", nature="By ESPP Trust", indirect=True,
        date_note='<footnoteId id="F1"/>', price_note='<footnoteId id="F2"/>',
    ),
    """<footnote id="F1">Common Shares purchased by the administrator of the issuer's Employee Stock Purchase Plan (&quot;ESPP&quot;) on behalf of the filer pursuant to terms predetermined by the issuer.</footnote>
       <footnote id="F2">The price was translated from the average purchase price of NT$2,309.9996 in New Taiwan dollars, at the rate of NT$32.768 to US$1.</footnote>""",
)

TSMC_TAIWAN_BUY = document(
    owner("0002113800", "Yuan Lipen"),
    purchase("Common Shares (2330.TW)", "1000", "71.49", date="2026-11-01", price_note='<footnoteId id="F1"/>'),
    '<footnote id="F1">The price per share was translated from New Taiwan dollars, NT$2,330, at the rate of NT$32.592 to US$1.</footnote>',
)

TSMC_ADR_BUY = document(
    owner("0001188935", "SPLINTER MICHAEL R", title="", director="1"),
    purchase("American Depositary Shares (TSM)", "840", "357", date="2026-11-05"),
    '<footnote id="F1">Each American Depositary Share represents five (5) Common Shares.</footnote>',
)

US_ISSUER = """
    <issuer><issuerCik>0000320193</issuerCik><issuerName>Apple Inc.</issuerName><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>"""


def docs_for(xml: str, accession: str = "0001046179-26-000779", symbol: str = "TSM") -> list[tuple[str, dict[str, Any]]]:
    return form4.build_trade_docs(
        form4.parse_form4(xml), symbol=symbol, company="Taiwan Semiconductor", accession=accession,
        filing_date="2026-11-10", accepted_at="2026-11-10T06:38:04", url="https://www.sec.gov/x", captured_at="2026-11-11T00:00:00Z",
    )


class IssuerPlanPurchases(unittest.TestCase):
    def test_tsmc_espp_purchase_is_not_an_open_market_buy(self) -> None:
        parsed = form4.parse_form4(TSMC_ESPP)
        self.assertTrue(parsed["transactions"][0]["issuer_plan"])
        self.assertEqual(form4.summarize_open_market(parsed), [])
        self.assertEqual(docs_for(TSMC_ESPP), [])

    def test_espp_wording_in_the_ownership_nature_alone_is_enough(self) -> None:
        xml = document(owner("1", "Doe Jane"), purchase("Common Stock", "50", "20", nature="By ESPP"), "", issuer=US_ISSUER)
        self.assertEqual(form4.summarize_open_market(form4.parse_form4(xml)), [])

    def test_a_footnote_on_the_holdings_after_the_trade_does_not_make_it_a_plan_buy(self) -> None:
        xml = document(
            owner("1", "Doe Jane"),
            purchase("Common Stock", "5000", "20", after_note='<footnoteId id="F1"/>'),
            '<footnote id="F1">Includes 120 shares acquired under the Employee Stock Purchase Plan.</footnote>',
            issuer=US_ISSUER,
        )
        lines = form4.summarize_open_market(form4.parse_form4(xml))
        self.assertEqual([(line["tx_type"], line["shares"], line["foreign_line"]) for line in lines], [("buy", 5000.0, False)])

    def test_selling_shares_held_in_a_plan_is_still_a_sale(self) -> None:
        sale = purchase("Common Stock", "301", "155.295", nature="By 401(k) Plan", indirect=True).replace(
            "<transactionCode>P</transactionCode>", "<transactionCode>S</transactionCode>"
        ).replace("<value>A</value>", "<value>D</value>")
        lines = form4.summarize_open_market(form4.parse_form4(document(owner("1", "Doe Jane", "SVP, CFO"), sale, "", issuer=US_ISSUER)))
        self.assertEqual([(line["tx_type"], line["shares"]) for line in lines], [("sell", 301.0)])

    def test_plan_wording(self) -> None:
        self.assertTrue(form4.is_issuer_plan("", ["Shares bought through the dividend reinvestment plan."]))
        self.assertTrue(form4.is_issuer_plan("By 401(k) Plan", []))
        self.assertFalse(form4.is_issuer_plan("By Spouse", ["The price reported is a weighted average."]))


class ForeignLines(unittest.TestCase):
    def test_taiwan_shares_are_a_foreign_line_and_the_adr_is_not(self) -> None:
        taiwan = docs_for(TSMC_TAIWAN_BUY, "0001046179-26-000732")
        self.assertEqual(len(taiwan), 1)
        path, data = taiwan[0]
        self.assertEqual(path, "tm_insider_trades/0001046179-26-000732__2113800__P")
        self.assertTrue(data["foreign_line"])
        self.assertEqual(data["security"], "Common Shares (2330.TW)")
        self.assertNotIn("id_suffix", data)
        adr = docs_for(TSMC_ADR_BUY, "0001046179-26-000734")
        self.assertFalse(adr[0][1]["foreign_line"])
        self.assertEqual(adr[0][1]["price"], 357.0)

    def test_a_us_issuer_is_never_a_foreign_line(self) -> None:
        self.assertFalse(form4.is_foreign_line("Common Stock", ""))
        self.assertFalse(form4.is_foreign_line("American Depositary Shares", "2330.TW"))
        self.assertTrue(form4.is_foreign_line("Ordinary Shares", "ASML.AS"))

    def test_one_filing_with_both_lines_keeps_them_apart(self) -> None:
        xml = document(
            owner("0002113800", "Yuan Lipen"),
            purchase("Common Shares (2330.TW)", "1000", "71.49") + purchase("American Depositary Shares (TSM)", "100", "357"),
            "",
        )
        docs = docs_for(xml, "0001046179-26-000900")
        ids = sorted(path.rsplit("__", 1)[1] for path, _ in docs)
        self.assertEqual(ids, ["P", "PF"])
        by_id = {path.rsplit("__", 1)[1]: data for path, data in docs}
        self.assertEqual(by_id["P"]["price"], 357.0)
        self.assertEqual(by_id["PF"]["price"], 71.49)


class PriceChecks(unittest.TestCase):
    RANGES = {"TSM": (223.7, 479.0)}

    def test_price_is_off(self) -> None:
        self.assertTrue(form4.price_is_off(70.5, 223.7, 479.0))
        self.assertFalse(form4.price_is_off(357.0, 223.7, 479.0))
        self.assertFalse(form4.price_is_off(150.0, 223.7, 479.0))  # within the slack: a fast fall, not a unit error
        self.assertFalse(form4.price_is_off(None, 223.7, 479.0))
        self.assertFalse(form4.price_is_off(70.5, None, None))

    def test_a_foreign_line_stays_but_its_price_does_not_compare(self) -> None:
        kept, dropped = form4.check_prices(docs_for(TSMC_TAIWAN_BUY, "0001046179-26-000732"), self.RANGES)
        self.assertEqual(dropped, [])
        self.assertFalse(kept[0][1]["price_comparable"])
        self.assertEqual(kept[0][1]["value"], 71490.0)

    def test_a_foreign_line_without_a_range_is_not_compared_either(self) -> None:
        kept, _ = form4.check_prices(docs_for(TSMC_TAIWAN_BUY, "0001046179-26-000732"), {})
        self.assertFalse(kept[0][1]["price_comparable"])

    def test_a_listed_line_far_off_the_range_is_dropped(self) -> None:
        listed = [("tm_insider_trades/a__1__P", {"id": "a__1__P", "symbol": "TSM", "price": 70.5, "foreign_line": False})]
        kept, dropped = form4.check_prices(listed, self.RANGES)
        self.assertEqual(kept, [])
        self.assertEqual(len(dropped), 1)

    def test_ordinary_shares_far_off_an_adr_range_stay_without_a_price(self) -> None:
        line = [("tm_insider_trades/b__1__S", {"id": "b__1__S", "symbol": "VNET", "price": 0.5472, "security": "Class A Ordinary Shares", "foreign_line": False})]
        kept, dropped = form4.check_prices(line, {"VNET": (2.0, 12.0)})
        self.assertEqual(dropped, [])
        self.assertTrue(kept[0][1]["foreign_line"])
        self.assertFalse(kept[0][1]["price_comparable"])

    def test_an_adr_line_inside_the_range_is_kept_and_comparable(self) -> None:
        kept, dropped = form4.check_prices(docs_for(TSMC_ADR_BUY, "0001046179-26-000734"), self.RANGES)
        self.assertEqual(dropped, [])
        self.assertTrue(kept[0][1]["price_comparable"])


class StaleDocuments(unittest.TestCase):
    def test_every_id_a_filing_could_produce(self) -> None:
        ids = form4.possible_doc_ids(form4.parse_form4(TSMC_ESPP), "0001046179-26-000779")
        self.assertIn("0001046179-26-000779__2113717__P", ids)
        self.assertEqual(len(ids), 4)

    def test_instrument_id(self) -> None:
        self.assertEqual(form4.instrument_id("TSM"), "US_TSM")
        self.assertEqual(form4.instrument_id("brk.b"), "US_BRK_B")

    def test_delete_refuses_anything_but_a_trade_document(self) -> None:
        class Store:
            mode = "http"

            def _request(self, *_args: Any) -> None:
                raise AssertionError("must not be called")

        with self.assertRaises(ValueError):
            form4.delete_docs(Store(), ["tm_insider_meta/run"])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            form4.delete_docs(Store(), ["tm_insider_trades/../users/x"])  # type: ignore[arg-type]

    def test_delete_sends_one_batch_of_deletes(self) -> None:
        calls: list[tuple[str, str, Any]] = []

        class Store:
            mode = "http"

            def _request(self, method: str, path: str, body: Any) -> dict[str, Any]:
                calls.append((method, path, body))
                return {}

        path = "tm_insider_trades/0001046179-26-000779__2113717__P"
        self.assertEqual(form4.delete_docs(Store(), [path]), 1)  # type: ignore[arg-type]
        self.assertEqual(calls, [("POST", "/documents:batchWrite", {"operations": [{"op": "delete", "path": path}]})])

    def test_a_line_dropped_for_its_price_is_not_removed(self) -> None:
        reread = {"tm_insider_trades/a__1__P", "tm_insider_trades/b__2__P", "tm_insider_trades/c__3__S"}
        produced = {"tm_insider_trades/c__3__S"}
        # b was dropped only because its price sits far off today's range (a split, say): keep what is stored.
        dropped = [("tm_insider_trades/b__2__P", {"price": 900.0})]
        self.assertEqual(form4.stale_paths(reread, produced, dropped), ["tm_insider_trades/a__1__P"])


if __name__ == "__main__":
    unittest.main()


class ClusterPoolTests(unittest.TestCase):
    """The hourly run reads seven days of filings; clusters need the stored buys of the last 30."""

    @staticmethod
    def buy(trade_id: str, insider: str, day: str, symbol: str = "LKQ") -> dict[str, Any]:
        return {"id": trade_id, "symbol": symbol, "tx_type": "buy", "insider_id": insider, "insider": insider,
                "transaction_date": day, "shares": 100, "value": 1000.0, "filed_at": day}

    def test_cluster_across_runs_is_found(self) -> None:
        run = [self.buy("c", "carol", "2026-11-09")]
        stored = [
            ("tm_insider_trades/a", self.buy("a", "alice", "2026-10-25")),
            ("tm_insider_trades/b", self.buy("b", "bob", "2026-10-28")),
            ("tm_insider_trades/c", self.buy("c", "carol", "2026-11-09")),  # this run's own line, counted once
        ]
        pool = form4.cluster_pool(run, stored, skip=set(), since="2026-10-12")
        self.assertEqual(len(pool), 3)
        clusters = form4.detect_clusters(pool)
        self.assertEqual([(item["symbol"], item["insiders"], item["filings"]) for item in clusters], [("LKQ", 3, 3)])

    def test_skipped_old_and_sold_lines_are_left_out(self) -> None:
        sell = dict(self.buy("s", "sam", "2026-11-01"), tx_type="sell")
        stored = [
            ("tm_insider_trades/old", self.buy("old", "olga", "2026-09-01")),
            ("tm_insider_trades/gone", self.buy("gone", "gus", "2026-11-02")),
            ("tm_insider_trades/s", sell),
        ]
        pool = form4.cluster_pool([], stored, skip={"tm_insider_trades/gone"}, since="2026-10-12")
        self.assertEqual(pool, [])
