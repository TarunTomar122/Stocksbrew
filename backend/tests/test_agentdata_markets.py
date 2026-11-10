import unittest

from backend.agentdata import markets


TREASURY_CSV = (
    'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","6 Mo","1 Yr","2 Yr","5 Yr","10 Yr","30 Yr"\n'
    "11/06/2026,4.02,4.07,4.15,4.19,4.23,4.33,4.51,4.64,4.86,5.26\n"
    "11/05/2026,4.03,,4.15,4.17,4.19,4.28,4.46,4.59,4.84,5.25\n"
    "not a date,1,2,3,4,5,6,7,8,9,10\n"
    "11/05/2026,4.03,,4.15,4.17,4.19,4.28,4.46,4.59,4.84,5.25\n"
)


class TreasuryParserTest(unittest.TestCase):
    def test_rows_are_sorted_deduped_and_blank_cells_are_unknown(self):
        rows = markets.parse_treasury_csv(TREASURY_CSV)
        self.assertEqual([row["date"] for row in rows], ["2026-11-05", "2026-11-06"])
        self.assertEqual(rows[1]["yields"]["10 Yr"], 4.86)
        self.assertNotIn("1.5 Month", rows[0]["yields"])
        self.assertEqual(rows[1]["yields"]["1.5 Month"], 4.07)

    def test_empty_file(self):
        self.assertEqual(markets.parse_treasury_csv(""), [])


class ChangeTest(unittest.TestCase):
    def setUp(self):
        self.dates = ["2025-11-07", "2025-12-31", "2026-10-09", "2026-11-02", "2026-11-06", "2026-11-09"]
        self.values = [100.0, 110.0, 120.0, 125.0, 128.0, 132.0]

    def test_percent_changes(self):
        change = markets.compute_changes(self.dates, self.values)
        self.assertEqual(change["d1"], 3.12)  # 132 / 128
        self.assertEqual(change["w1"], 5.6)  # on or before Nov 2 -> 125
        self.assertEqual(change["m1"], 10.0)  # on or before Oct 10 -> 120
        self.assertEqual(change["ytd"], 20.0)  # last close of 2025 -> 110
        self.assertEqual(change["y1"], 32.0)  # on or before Nov 9 2025 -> 100

    def test_basis_point_changes_for_yields(self):
        change = markets.compute_changes(["2026-11-05", "2026-11-06"], [4.84, 4.86], "bps")
        self.assertEqual(change["d1"], 2.0)
        self.assertIsNone(change["w1"])
        self.assertIsNone(change["ytd"])

    def test_short_series_never_reports_a_longer_window(self):
        # Three weeks of history must not be passed off as a one-year change.
        change = markets.compute_changes(["2026-10-20", "2026-11-06", "2026-11-09"], [10.0, 11.0, 12.0])
        self.assertIsNone(change["y1"])
        self.assertIsNone(change["ytd"])
        self.assertIsNone(change["m1"])
        self.assertIsNotNone(change["d1"])

    def test_too_little_data(self):
        self.assertEqual(set(markets.compute_changes(["2026-11-09"], [1.0]).values()), {None})

    def test_downsample_keeps_both_ends(self):
        values = [float(index) for index in range(300)]
        sample = markets.downsample(values, 64)
        self.assertEqual(len(sample), 64)
        self.assertEqual((sample[0], sample[-1]), (0.0, 299.0))
        self.assertEqual(markets.downsample([1.0, 2.0], 64), [1.0, 2.0])

    def test_year_range(self):
        found = markets.year_range(self.dates, self.values)
        self.assertEqual((found["high_1y"], found["high_1y_date"]), (132.0, "2026-11-09"))
        # Nov 7 2025 is 367 days back, just outside the trailing year.
        self.assertEqual((found["low_1y"], found["low_1y_date"]), (110.0, "2025-12-31"))


class YahooParserTest(unittest.TestCase):
    def test_last_bar_is_pinned_to_the_live_quote_and_nulls_are_dropped(self):
        result = {
            "meta": {"regularMarketPrice": 101.5, "regularMarketTime": 1794253391, "currency": "USD", "shortName": "X"},
            "timestamp": [1794000600, 1794087000, 1794173400, 1794253391],
            "indicators": {"quote": [{"close": [99.0, None, 100.0, 101.2]}]},
        }
        parsed = markets.parse_yahoo_chart(result)
        self.assertEqual(parsed["closes"], [99.0, 100.0, 101.5])
        self.assertEqual(parsed["price"], 101.5)
        self.assertEqual(parsed["as_of"][:10], parsed["dates"][-1])

    def test_no_price_is_none(self):
        self.assertIsNone(markets.parse_yahoo_chart({"meta": {}, "timestamp": [], "indicators": {}}))


class FuturesCurveTest(unittest.TestCase):
    def test_contract_label(self):
        self.assertEqual(markets.parse_contract_label("Crude Oil Dec 26"), (2026, 12))
        self.assertIsNone(markets.parse_contract_label("Gold"))
        self.assertIsNone(markets.parse_contract_label(None))

    def test_monthly_contracts_roll_over_the_year(self):
        contracts = markets.later_contracts("CL", "NYM", "FGHJKMNQUVXZ", (2026, 12))
        self.assertEqual(
            [(c["symbol"], c["label"], c["months_out"]) for c in contracts],
            [("CLH27.NYM", "Mar 27", 3), ("CLM27.NYM", "Jun 27", 6), ("CLZ27.NYM", "Dec 27", 12)],
        )

    def test_sparse_contract_months_pick_the_nearest_listed(self):
        contracts = markets.later_contracts("GC", "CMX", "GJMQVZ", (2026, 12))
        self.assertEqual([c["symbol"] for c in contracts], ["GCG27.CMX", "GCM27.CMX", "GCZ27.CMX"])

    def test_structure(self):
        front = {"label": "Dec 26", "months_out": 0, "price": 85.55}
        self.assertEqual(
            markets.curve_structure([front, {"label": "Dec 27", "months_out": 12, "price": 73.74}])["state"],
            "backwardation",
        )
        self.assertEqual(
            markets.curve_structure([front, {"label": "Dec 27", "months_out": 12, "price": 90.0}])["state"],
            "contango",
        )
        self.assertEqual(
            markets.curve_structure([front, {"label": "Dec 27", "months_out": 12, "price": 85.7}])["state"], "flat"
        )
        self.assertIsNone(markets.curve_structure([front]))


def _kalshi_market(label, bid, ask, last, **extra):
    return {
        "status": "active",
        "yes_sub_title": label,
        "yes_bid_dollars": bid,
        "yes_ask_dollars": ask,
        "last_price_dollars": last,
        "volume_fp": "1000.50",
        "volume_24h_fp": "10.00",
        "close_time": "2026-12-09T18:59:00Z",
        **extra,
    }


class KalshiParserTest(unittest.TestCase):
    def test_exclusive_event(self):
        event = {
            "event_ticker": "KXFEDDECISION-26DEC",
            "series_ticker": "KXFEDDECISION",
            "title": "Fed decision in Dec 2026?",
            "sub_title": "On Dec 9, 2026",
            "mutually_exclusive": True,
            "markets": [
                _kalshi_market("Fed maintains rate", "0.1900", "0.2000", "0.2000"),
                _kalshi_market("Hike 25bps", "0.8000", "0.8100", "0.8100"),
                _kalshi_market("Cut 25bps", "0.0000", "0.0100", "0.0100"),
                {**_kalshi_market("Settled", "0.5", "0.5", "0.5"), "status": "finalized"},
            ],
        }
        doc = markets.parse_kalshi_event(event, "fed", "2026-11-09T20:00:00+00:00")
        self.assertEqual(doc["id"], "kalshi-kxfeddecision-26dec")
        self.assertEqual(doc["kind"], "exclusive")
        self.assertEqual(doc["source_url"], "https://kalshi.com/markets/kxfeddecision")
        self.assertEqual(
            [(o["label"], o["probability"]) for o in doc["outcomes"]],
            [("Fed maintains rate", 0.195), ("Hike 25bps", 0.805)],
        )
        self.assertEqual(doc["outcome_count"], 3)
        self.assertEqual(doc["volume"], 3001.5)
        self.assertEqual(doc["volume_unit"], "contracts")
        self.assertEqual(doc["close_time"], "2026-12-09T18:59:00Z")

    def test_single_market_is_binary(self):
        event = {
            "event_ticker": "KXRECSSNBER-26",
            "series_ticker": "KXRECSSNBER",
            "title": "Recession this year?",
            "markets": [_kalshi_market("Starts", "0.0100", "0.0200", "0.0100")],
        }
        doc = markets.parse_kalshi_event(event, "recession", "now")
        self.assertEqual(doc["kind"], "binary")
        self.assertEqual(doc["outcomes"], [{"label": "Yes", "probability": 0.015}, {"label": "No", "probability": 0.985}])

    def test_ladder_reports_where_even_odds_sit(self):
        strikes = [(3.5, "0.86"), (3.6, "0.735"), (3.7, "0.455"), (3.8, "0.235")]
        event = {
            "event_ticker": "KXCPIYOY-26NOV",
            "series_ticker": "KXCPIYOY",
            "title": "CPI YoY in November",
            "mutually_exclusive": False,
            "markets": [
                _kalshi_market(f"Above {strike}%", None, None, price, strike_type="greater", floor_strike=strike)
                for strike, price in reversed(strikes)
            ],
        }
        doc = markets.parse_kalshi_event(event, "inflation", "now")
        self.assertEqual(doc["kind"], "ladder")
        self.assertEqual([o["strike"] for o in doc["outcomes"]], [3.5, 3.6, 3.7, 3.8])
        self.assertEqual(doc["implied_range"], {"low": 3.6, "high": 3.7})

    def test_wide_book_falls_back_to_last_trade(self):
        self.assertEqual(markets._probability("0.10", "0.60", "0.30"), 0.3)
        self.assertEqual(markets._probability("0.40", "0.44", "0.90"), 0.42)
        self.assertIsNone(markets._probability(None, None, None))

    def test_event_without_live_markets_is_dropped(self):
        self.assertIsNone(markets.parse_kalshi_event({"event_ticker": "X", "markets": []}, "fed", "now"))


class PolymarketParserTest(unittest.TestCase):
    def test_grouped_event(self):
        event = {
            "id": "770450",
            "slug": "fed-decision-in-december",
            "title": "Fed Decision in December?",
            "negRisk": True,
            "volume": 17492311.054,
            "volume24hr": 798293.76,
            "endDate": "2026-12-10T04:59:00Z",
            "markets": [
                {"groupItemTitle": "No change", "groupItemThreshold": "2", "outcomes": '["Yes", "No"]',
                 "outcomePrices": '["0.175", "0.825"]', "active": True, "closed": False},
                {"groupItemTitle": "25 bps increase", "groupItemThreshold": "3", "outcomes": '["Yes", "No"]',
                 "outcomePrices": '["0.805", "0.195"]', "active": True, "closed": False},
                {"groupItemTitle": "Resolved", "groupItemThreshold": "1", "outcomes": '["Yes", "No"]',
                 "outcomePrices": '["0", "1"]', "active": True, "closed": True},
            ],
        }
        doc = markets.parse_polymarket_event(event, "now")
        self.assertEqual(doc["id"], "poly-770450")
        self.assertEqual(doc["topic"], "fed")
        self.assertEqual(doc["kind"], "exclusive")
        self.assertEqual([o["label"] for o in doc["outcomes"]], ["No change", "25 bps increase"])
        self.assertEqual(doc["volume_unit"], "usd")
        self.assertEqual(doc["source_url"], "https://polymarket.com/event/fed-decision-in-december")

    def test_binary_event(self):
        event = {
            "id": "1", "slug": "another-hike", "title": "Another Fed rate hike in 2026?", "endDate": "2026-12-10T04:59:00Z",
            "markets": [{"outcomes": '["Yes", "No"]', "outcomePrices": '["0.795", "0.205"]', "active": True}],
        }
        doc = markets.parse_polymarket_event(event, "now")
        self.assertEqual(doc["kind"], "binary")
        self.assertEqual(doc["outcomes"][0], {"label": "Yes", "probability": 0.795})

    def test_malformed_prices_drop_the_event(self):
        event = {"id": "1", "slug": "x", "title": "Fed?", "markets": [{"outcomes": "oops", "outcomePrices": "[]"}]}
        self.assertIsNone(markets.parse_polymarket_event(event, "now"))

    def test_relevance_filter(self):
        self.assertTrue(markets.polymarket_relevant("Fed Decision in December?"))
        self.assertTrue(markets.polymarket_relevant("October Inflation US - Annual"))
        self.assertFalse(markets.polymarket_relevant("Bank of Russia decision in December?"))
        self.assertFalse(markets.polymarket_relevant("Mexico Annual Inflation 2026"))
        self.assertFalse(markets.polymarket_relevant("Strait of Hormuz traffic returns to normal?"))


class AssetDocTest(unittest.TestCase):
    def test_slim_doc_and_series_doc(self):
        dates = [f"2026-{month:02d}-{day:02d}" for month in range(1, 11) for day in range(1, 29)]
        values = [100.0 + index for index in range(len(dates))]
        asset, series = markets.build_asset_doc(
            asset_id="spy", asset_class="etf", name="SPY", symbol="SPY", dates=dates, values=values,
            price=values[-1], unit="USD", source="yahoo", source_url="https://example.test",
            as_of="2026-10-28T20:00:00+00:00", fetched_at="2026-10-28T20:01:00+00:00",
        )
        self.assertEqual(len(asset["spark"]), 64)
        self.assertEqual(asset["spark"][-1], asset["price"])
        self.assertEqual(series["dates"][-1], "2026-10-28")
        self.assertEqual(len(series["dates"]), len(series["values"]))
        self.assertEqual(asset["source_name"], "Yahoo Finance")
        self.assertEqual(asset["as_of"], "2026-10-28T20:00:00+00:00")


class AbsoluteChangeTest(unittest.TestCase):
    def test_ratio_changes_are_plain_differences(self):
        dates = ["2026-10-07", "2026-10-30", "2026-11-05", "2026-11-06"]
        change = markets.compute_changes(dates, [0.63, 0.66, 0.89, 0.59], "abs")
        self.assertEqual(change["d1"], -0.3)
        self.assertEqual(change["w1"], -0.07)
        self.assertEqual(change["m1"], -0.04)
        self.assertIsNone(change["y1"])


class PredictionDetailTest(unittest.TestCase):
    def test_kalshi_day_change_rules_and_settlement_source(self):
        market = {
            **_kalshi_market("Hike 25bps", "0.8000", "0.8100", "0.8100"),
            "ticker": "KXFEDDECISION-26DEC-H25",
            "previous_yes_bid_dollars": "0.7600",
            "previous_yes_ask_dollars": "0.7700",
            "previous_price_dollars": "0.7700",
            "rules_primary": "If the Fed hikes by 25bps, this resolves to Yes.",
            "rules_secondary": "Outcomes are mutually exclusive.",
        }
        other = {**_kalshi_market("Fed maintains rate", "0.1900", "0.2000", "0.2000"), "rules_primary": "Other rules."}
        event = {
            "event_ticker": "KXFEDDECISION-26DEC",
            "series_ticker": "KXFEDDECISION",
            "title": "Fed decision in Dec 2026?",
            "mutually_exclusive": True,
            "settlement_sources": [{"name": "Federal Reserve", "url": "https://www.federalreserve.gov"}, {"url": "x"}],
            "markets": [other, market],
        }
        doc = markets.parse_kalshi_event(event, "fed", "now")
        hike = next(outcome for outcome in doc["outcomes"] if outcome["label"] == "Hike 25bps")
        self.assertEqual(hike["change_24h"], 0.04)
        self.assertEqual(hike["ref"], "KXFEDDECISION-26DEC-H25")
        self.assertEqual(doc["rules"], "If the Fed hikes by 25bps, this resolves to Yes.\n\nOutcomes are mutually exclusive.")
        self.assertEqual(doc["rules_outcome"], "Hike 25bps")
        self.assertEqual(doc["settlement_sources"], [{"name": "Federal Reserve", "url": "https://www.federalreserve.gov"}])
        # The rules text is internal to the parser; it must not leak into the stored outcomes.
        self.assertTrue(all("_rules" not in outcome for outcome in doc["outcomes"]))

    def test_kalshi_binary_keeps_the_yes_rules_and_mirrors_the_change(self):
        market = {
            **_kalshi_market("Starts", "0.1900", "0.2000", "0.2000"),
            "previous_price_dollars": "0.2150",
            "rules_primary": "Resolves Yes if NBER dates a recession.",
        }
        event = {"event_ticker": "KXRECSSNBER-27", "series_ticker": "KXRECSSNBER", "title": "Recession in 2027?", "markets": [market]}
        doc = markets.parse_kalshi_event(event, "recession", "now")
        self.assertEqual([o.get("change_24h") for o in doc["outcomes"]], [-0.02, 0.02])
        self.assertEqual(doc["rules"], "Resolves Yes if NBER dates a recession.")
        self.assertNotIn("rules_outcome", doc)

    def test_polymarket_binary_change_and_rules(self):
        event = {
            "id": "1034268",
            "slug": "another-fed-rate-hike-in-2026",
            "title": "Another Fed rate hike in 2026?",
            "description": "Resolves Yes if the upper bound rises.",
            "endDate": "2026-12-10T04:59:00Z",
            "volume": 500000,
            "markets": [
                {
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.805", "0.195"]',
                    "clobTokenIds": '["111", "222"]',
                    "oneDayPriceChange": 0.05,
                    "resolutionSource": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
                }
            ],
        }
        doc = markets.parse_polymarket_event(event, "now")
        self.assertEqual([(o["label"], o["change_24h"], o["ref"]) for o in doc["outcomes"]], [("Yes", 0.05, "111"), ("No", -0.05, "222")])
        self.assertEqual(doc["rules"], "Resolves Yes if the upper bound rises.")
        self.assertEqual(doc["settlement_sources"][0]["name"], "federalreserve.gov")

    def test_topic_and_relevance_filters(self):
        self.assertEqual(markets.polymarket_topic("Presidential Election Winner 2028"), "election")
        self.assertTrue(markets.polymarket_relevant("Democratic Presidential Nominee 2028"))
        self.assertFalse(markets.polymarket_relevant("Next French Presidential Election"))
        self.assertFalse(markets.polymarket_relevant("Who will win the Super Bowl?"))

    def test_polymarket_history_keeps_one_point_a_day(self):
        payload = {"history": [{"t": 1785456023, "p": 0.027}, {"t": 1785459000, "p": 0.03}, {"t": 1785542414, "p": 0.0165}, {"t": 1, "p": 7}]}
        dates, values = markets.parse_polymarket_history(payload)
        self.assertEqual(dates, ["2026-07-31", "2026-08-01"])
        self.assertEqual(values, [0.03, 0.0165])
        self.assertEqual(markets.parse_polymarket_history(None), ([], []))

    def test_kalshi_candles_use_the_mid_then_the_last_trade(self):
        payload = {
            "candlesticks": [
                # 2026-11-01T00:00Z end stamp: the candle covers Oct 31.
                {"end_period_ts": 1793491200, "yes_bid": {"close_dollars": "0.7600"}, "yes_ask": {"close_dollars": "0.7800"}, "price": {}},
                {"end_period_ts": 1793577600, "yes_bid": {"close_dollars": "0.1000"}, "yes_ask": {"close_dollars": "0.9000"}, "price": {"close_dollars": "0.8000"}},
                {"end_period_ts": 1793664000, "yes_bid": {"close_dollars": "0.0000"}, "yes_ask": {"close_dollars": "1.0000"}, "price": {}},
            ]
        }
        dates, values = markets.parse_kalshi_candles(payload)
        self.assertEqual(dates, ["2026-10-31", "2026-11-01"])
        self.assertEqual(values, [0.77, 0.8])


class FundProfileTest(unittest.TestCase):
    RESULT = {
        "fundProfile": {
            "family": "ARK ETF Trust",
            "categoryName": "Mid-Cap Growth",
            "feesExpensesInvestment": {"annualReportExpenseRatio": {"raw": 0.0075}, "netExpRatio": {}},
        },
        "summaryDetail": {"totalAssets": {"raw": 6123425792}, "yield": {"raw": 0.0}},
        "topHoldings": {
            "holdings": [
                {"symbol": "COIN", "holdingName": "Coinbase", "holdingPercent": {"raw": 0.0395}},
                {"symbol": "TSLA", "holdingName": "Tesla Inc", "holdingPercent": {"raw": 0.1065168}},
                {"symbol": "", "holdingName": "", "holdingPercent": {"raw": 0.5}},
                {"symbol": "ZERO", "holdingName": "Zero", "holdingPercent": {}},
            ],
            "sectorWeightings": [{"realestate": {"raw": 0.0}}, {"consumer_cyclical": {"raw": 0.1385}}],
        },
    }

    def test_facts_are_read_and_holdings_ranked(self):
        profile = markets.parse_fund_profile(self.RESULT)
        self.assertEqual(profile["expense_ratio_pct"], 0.75)
        self.assertEqual(profile["fund_family"], "ARK ETF Trust")
        self.assertEqual(profile["total_assets"], 6123425792)
        self.assertEqual([h["symbol"] for h in profile["holdings"]], ["TSLA", "COIN"])
        self.assertEqual(profile["holdings"][0]["weight_pct"], 10.65)
        self.assertEqual(profile["holdings_weight_pct"], 14.6)
        self.assertEqual(profile["sectors"], [{"sector": "consumer cyclical", "weight_pct": 13.85}])

    def test_unreported_fields_are_absent_not_zero(self):
        profile = markets.parse_fund_profile(self.RESULT)
        self.assertNotIn("yield_pct", profile)  # a 0.0 yield is Yahoo's "none", not a fact
        self.assertEqual(markets.parse_fund_profile({}), {})
        self.assertEqual(markets.parse_fund_profile({"fundProfile": {"feesExpensesInvestment": {"annualReportExpenseRatio": {}}}}), {})


class CboeParserTest(unittest.TestCase):
    def test_history_reads_the_close_column(self):
        text = "DATE,OPEN,HIGH,LOW,CLOSE\n11/05/2026,26.3,26.5,22.0,24.6\n11/06/2026,24.0,24.4,23.1,24.3\nbad,1,2,3,4\n"
        self.assertEqual(markets.parse_cboe_history(text), (["2026-11-05", "2026-11-06"], [24.6, 24.3]))

    def test_history_reads_a_single_value_file(self):
        text = "DATE,SKEW\n11/05/2026,149.370000\n11/06/2026,153.550000\n"
        self.assertEqual(markets.parse_cboe_history(text), (["2026-11-05", "2026-11-06"], [149.37, 153.55]))
        self.assertEqual(markets.parse_cboe_history(""), ([], []))

    def test_daily_options_statistics(self):
        payload = {
            "ratios": [
                {"name": "TOTAL PUT/CALL RATIO", "value": "0.95"},
                {"name": "MXEA PUT/CALL RATIO", "value": "0.00"},
            ],
            "SUM OF ALL PRODUCTS": [
                {"name": "VOLUME", "call": 7752661, "put": 7339138, "total": 15091799},
                {"name": "OPEN INTEREST", "call": 1, "put": 2, "total": 3},
            ],
        }
        parsed = markets.parse_cboe_daily_options(payload)
        # A 0.00 ratio means nothing traded; it is not a reading.
        self.assertEqual(parsed["ratios"], {"TOTAL PUT/CALL RATIO": 0.95})
        self.assertEqual(parsed["volume"], {"SUM OF ALL PRODUCTS": {"call": 7752661.0, "put": 7339138.0}})
        self.assertEqual(markets.parse_cboe_daily_options("<Error/>"), {"ratios": {}, "volume": {}})

    def test_weekdays_back_skips_weekends(self):
        from datetime import date

        days = markets._weekdays_back(date(2026, 11, 9), 4)  # Monday, back to Thursday
        self.assertEqual([day.isoformat() for day in days], ["2026-11-05", "2026-11-06", "2026-11-09"])


if __name__ == "__main__":
    unittest.main()
