"""Expand the instrument universe to 150+ US and 150+ India stocks.

Run from project root:
    python -m backend.scripts.expand_universe

This script:
1. Updates instrument_universe.json with new US + India instruments
2. Updates tikrr_eval_universe.json with the full expanded symbol list
3. Seeds meta/stocks, meta/sectors, meta/tikrrEvalUniverse to Firestore
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNIVERSE_PATH = ROOT / "backend" / "config" / "instrument_universe.json"
EVAL_PATH = ROOT / "backend" / "config" / "tikrr_eval_universe.json"

NOW = "2026-04-16T08:00:00Z"

# ---------------------------------------------------------------------------
# NEW US instruments (to add on top of the existing 100)
# ---------------------------------------------------------------------------

NEW_US = [
    # Healthcare
    ("ABBV", "AbbVie Inc.", "Pharmaceuticals", "NASDAQ", ["S&P 500"], ["US_LLY", "US_BMY", "US_MRK"], "large"),
    ("AMGN", "Amgen Inc.", "Biotechnology", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_GILD", "US_REGN", "US_VRTX"], "mega"),
    ("GILD", "Gilead Sciences Inc.", "Biotechnology", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_AMGN", "US_ABBV", "US_BIIB"], "large"),
    ("REGN", "Regeneron Pharmaceuticals Inc.", "Biotechnology", "NASDAQ", ["S&P 500"], ["US_VRTX", "US_AMGN", "US_BIIB"], "large"),
    ("VRTX", "Vertex Pharmaceuticals Inc.", "Biotechnology", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_REGN", "US_AMGN", "US_GILD"], "large"),
    ("MRNA", "Moderna Inc.", "Biotechnology", "NASDAQ", ["S&P 500"], ["US_ABBV", "US_GILD", "US_PFE"], "large"),
    ("BMY", "Bristol-Myers Squibb Company", "Pharmaceuticals", "NYSE", ["S&P 500"], ["US_ABBV", "US_MRK", "US_PFE"], "large"),
    ("ZTS", "Zoetis Inc.", "Pharmaceuticals", "NYSE", ["S&P 500"], ["US_JNJ", "US_ABT", "US_MDT"], "large"),
    ("MDT", "Medtronic plc", "Medical Devices", "NYSE", ["S&P 500"], ["US_ABT", "US_SYK", "US_BSX"], "large"),
    ("ABT", "Abbott Laboratories", "Medical Devices", "NYSE", ["S&P 500"], ["US_MDT", "US_SYK", "US_BSX"], "mega"),
    ("SYK", "Stryker Corporation", "Medical Devices", "NYSE", ["S&P 500"], ["US_MDT", "US_ABT", "US_BSX"], "large"),
    ("BSX", "Boston Scientific Corporation", "Medical Devices", "NYSE", ["S&P 500"], ["US_SYK", "US_MDT", "US_ISRG"], "large"),
    ("ISRG", "Intuitive Surgical Inc.", "Medical Devices", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_BSX", "US_SYK", "US_MDT"], "mega"),
    ("TMO", "Thermo Fisher Scientific Inc.", "Life Sciences", "NYSE", ["S&P 500"], ["US_DHR", "US_ABT", "US_IQVIA"], "mega"),
    ("DHR", "Danaher Corporation", "Life Sciences", "NYSE", ["S&P 500"], ["US_TMO", "US_ABT", "US_IDXX"], "mega"),
    ("BIIB", "Biogen Inc.", "Biotechnology", "NASDAQ", ["S&P 500"], ["US_AMGN", "US_GILD", "US_REGN"], "large"),
    # Financials
    ("COF", "Capital One Financial Corporation", "Consumer Finance", "NYSE", ["S&P 500"], ["US_JPM", "US_BAC", "US_AXP"], "large"),
    ("USB", "U.S. Bancorp", "Banking", "NYSE", ["S&P 500"], ["US_JPM", "US_WFC", "US_PNC"], "large"),
    ("PNC", "PNC Financial Services Group Inc.", "Banking", "NYSE", ["S&P 500"], ["US_USB", "US_WFC", "US_TFC"], "large"),
    ("TFC", "Truist Financial Corporation", "Banking", "NYSE", ["S&P 500"], ["US_PNC", "US_USB", "US_WFC"], "large"),
    ("SPGI", "S&P Global Inc.", "Financial Data", "NYSE", ["S&P 500"], ["US_MCO", "US_ICE", "US_NDAQ"], "mega"),
    ("MCO", "Moody's Corporation", "Financial Data", "NYSE", ["S&P 500"], ["US_SPGI", "US_ICE", "US_NDAQ"], "large"),
    ("ICE", "Intercontinental Exchange Inc.", "Financial Exchanges", "NYSE", ["S&P 500"], ["US_CME", "US_NDAQ", "US_SPGI"], "mega"),
    ("CME", "CME Group Inc.", "Financial Exchanges", "NASDAQ", ["S&P 500"], ["US_ICE", "US_NDAQ", "US_CBOE"], "mega"),
    ("NDAQ", "Nasdaq Inc.", "Financial Exchanges", "NASDAQ", ["S&P 500"], ["US_ICE", "US_CME", "US_SPGI"], "large"),
    ("COIN", "Coinbase Global Inc.", "Financial Technology", "NASDAQ", ["S&P 500"], ["US_MSTR", "US_HOOD", "US_SQ"], "large"),
    ("MSTR", "MicroStrategy Incorporated", "Software", "NASDAQ", [], ["US_COIN", "US_MARA", "US_RIOT"], "large"),
    # Semiconductors / AI
    ("ARM", "Arm Holdings plc", "Semiconductors", "NASDAQ", ["S&P 500"], ["US_NVDA", "US_QCOM", "US_AVGO"], "mega"),
    ("SMCI", "Super Micro Computer Inc.", "Server Hardware", "NASDAQ", ["S&P 500"], ["US_NVDA", "US_AMD", "US_DELL"], "large"),
    ("MRVL", "Marvell Technology Inc.", "Semiconductors", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_AVGO", "US_QCOM", "US_AMD"], "large"),
    ("TXN", "Texas Instruments Incorporated", "Semiconductors", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_QCOM", "US_ADI", "US_MCHP"], "mega"),
    ("INTU", "Intuit Inc.", "Software", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_ADBE", "US_MSFT", "US_CRM"], "mega"),
    ("SNPS", "Synopsys Inc.", "Software", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_CDNS", "US_ANSYS", "US_ADBE"], "large"),
    ("CDNS", "Cadence Design Systems Inc.", "Software", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_SNPS", "US_ANSYS", "US_ADBE"], "large"),
    ("FTNT", "Fortinet Inc.", "Cybersecurity", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_PANW", "US_CRWD", "US_ZS"], "large"),
    ("OKTA", "Okta Inc.", "Cybersecurity", "NASDAQ", ["S&P 500"], ["US_CRWD", "US_ZS", "US_PANW"], "large"),
    ("WDAY", "Workday Inc.", "Software", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_NOW", "US_CRM", "US_VEEV"], "large"),
    ("VEEV", "Veeva Systems Inc.", "Software", "NYSE", ["S&P 500"], ["US_WDAY", "US_CRM", "US_NOW"], "large"),
    ("HUBS", "HubSpot Inc.", "Software", "NYSE", ["S&P 500"], ["US_CRM", "US_WDAY", "US_DDOG"], "large"),
    ("IONQ", "IonQ Inc.", "Quantum Computing", "NYSE", [], ["US_NVDA", "US_IBM", "US_QCOM"], "small"),
    # Consumer Staples
    ("KO", "Coca-Cola Company", "Beverages", "NYSE", ["S&P 500", "Dow Jones"], ["US_PEP", "US_MDLZ", "US_STZ"], "mega"),
    ("PEP", "PepsiCo Inc.", "Beverages", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_KO", "US_MDLZ", "US_COST"], "mega"),
    ("PG", "Procter & Gamble Co.", "Consumer Staples", "NYSE", ["S&P 500", "Dow Jones"], ["US_CL", "US_KMB", "US_CHD"], "mega"),
    ("PM", "Philip Morris International Inc.", "Tobacco", "NYSE", ["S&P 500"], ["US_MO", "US_BTI", "US_PM"], "large"),
    ("MO", "Altria Group Inc.", "Tobacco", "NYSE", ["S&P 500"], ["US_PM", "US_BTI", "US_LO"], "large"),
    # Utilities / Clean Energy
    ("NEE", "NextEra Energy Inc.", "Utilities", "NYSE", ["S&P 500"], ["US_DUK", "US_SO", "US_D"], "mega"),
    ("DUK", "Duke Energy Corporation", "Utilities", "NYSE", ["S&P 500"], ["US_NEE", "US_SO", "US_SRE"], "large"),
    ("SO", "Southern Company", "Utilities", "NYSE", ["S&P 500"], ["US_NEE", "US_DUK", "US_AEP"], "large"),
    # REITs
    ("AMT", "American Tower Corporation", "REITs", "NYSE", ["S&P 500"], ["US_EQIX", "US_CCI", "US_PLD"], "mega"),
    ("PLD", "Prologis Inc.", "REITs", "NYSE", ["S&P 500"], ["US_AMT", "US_EQIX", "US_SPG"], "mega"),
    ("EQIX", "Equinix Inc.", "REITs", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_AMT", "US_PLD", "US_DLR"], "mega"),
    # Materials
    ("FCX", "Freeport-McMoRan Inc.", "Metals & Mining", "NYSE", ["S&P 500"], ["US_NEM", "US_AA", "US_CLF"], "large"),
    ("NEM", "Newmont Corporation", "Metals & Mining", "NYSE", ["S&P 500"], ["US_FCX", "US_GFI", "US_AU"], "large"),
    ("LIN", "Linde plc", "Chemicals", "NASDAQ", ["S&P 500", "NASDAQ 100"], ["US_APD", "US_DOW", "US_DD"], "mega"),
]

# ---------------------------------------------------------------------------
# NEW India instruments (to add on top of existing 10)
# ---------------------------------------------------------------------------

NEW_IN = [
    # IT / Tech
    ("WIPRO", "Wipro Ltd", "IT Services", ["NIFTY 50", "SENSEX"], ["IN_TCS", "IN_INFY", "IN_HCLTECH"], "large"),
    ("HCLTECH", "HCL Technologies Ltd", "IT Services", ["NIFTY 50", "SENSEX"], ["IN_TCS", "IN_WIPRO", "IN_TECHM"], "mega"),
    ("TECHM", "Tech Mahindra Ltd", "IT Services", ["NIFTY 50"], ["IN_WIPRO", "IN_HCLTECH", "IN_MPHASIS"], "large"),
    ("LTIM", "LTIMindtree Ltd", "IT Services", ["NIFTY 50"], ["IN_MPHASIS", "IN_PERSISTENT", "IN_COFORGE"], "large"),
    ("LTTS", "L&T Technology Services Ltd", "IT Services", [], ["IN_LTIM", "IN_TATAELXSI", "IN_KPITTECH"], "mid"),
    ("MPHASIS", "Mphasis Ltd", "IT Services", [], ["IN_LTIM", "IN_PERSISTENT", "IN_COFORGE"], "mid"),
    ("PERSISTENT", "Persistent Systems Ltd", "IT Services", [], ["IN_MPHASIS", "IN_COFORGE", "IN_LTIM"], "mid"),
    ("COFORGE", "Coforge Ltd", "IT Services", [], ["IN_PERSISTENT", "IN_MPHASIS", "IN_MASTEK"], "mid"),
    ("TATAELXSI", "Tata Elxsi Ltd", "IT Services", [], ["IN_LTTS", "IN_KPITTECH", "IN_CYIENT"], "mid"),
    ("KPITTECH", "KPIT Technologies Ltd", "Software", [], ["IN_TATAELXSI", "IN_LTTS", "IN_CYIENT"], "mid"),
    ("CYIENT", "Cyient Ltd", "Engineering Services", [], ["IN_LTTS", "IN_KPITTECH", "IN_TATAELXSI"], "mid"),
    ("BIRLASOFT", "Birlasoft Ltd", "IT Services", [], ["IN_COFORGE", "IN_PERSISTENT", "IN_MASTEK"], "small"),
    ("MASTEK", "Mastek Ltd", "IT Services", [], ["IN_BIRLASOFT", "IN_COFORGE", "IN_PERSISTENT"], "small"),
    ("HEXAWARE", "Hexaware Technologies Ltd", "IT Services", [], ["IN_MPHASIS", "IN_COFORGE", "IN_LTIM"], "mid"),
    # Banking
    ("AXISBANK", "Axis Bank Ltd", "Banking", ["NIFTY 50", "SENSEX"], ["IN_HDFCBANK", "IN_ICICIBANK", "IN_KOTAKBANK"], "large"),
    ("KOTAKBANK", "Kotak Mahindra Bank Ltd", "Banking", ["NIFTY 50", "SENSEX"], ["IN_HDFCBANK", "IN_ICICIBANK", "IN_AXISBANK"], "mega"),
    ("INDUSINDBK", "IndusInd Bank Ltd", "Banking", ["NIFTY 50"], ["IN_AXISBANK", "IN_FEDERALBNK", "IN_IDFCFIRSTB"], "large"),
    ("BANKBARODA", "Bank of Baroda", "Banking", ["NIFTY 500"], ["IN_PNB", "IN_CANBK", "IN_UNIONBANK"], "large"),
    ("PNB", "Punjab National Bank", "Banking", ["NIFTY 500"], ["IN_BANKBARODA", "IN_CANBK", "IN_UNIONBANK"], "mid"),
    ("IDFCFIRSTB", "IDFC First Bank Ltd", "Banking", ["NIFTY 500"], ["IN_INDUSINDBK", "IN_FEDERALBNK", "IN_RBLBANK"], "mid"),
    ("FEDERALBNK", "Federal Bank Ltd", "Banking", [], ["IN_IDFCFIRSTB", "IN_INDUSINDBK", "IN_AUBANK"], "mid"),
    ("CANBK", "Canara Bank", "Banking", ["NIFTY 500"], ["IN_BANKBARODA", "IN_PNB", "IN_UNIONBANK"], "mid"),
    ("BANDHANBNK", "Bandhan Bank Ltd", "Banking", ["NIFTY 500"], ["IN_AUBANK", "IN_IDFCFIRSTB", "IN_FEDERALBNK"], "mid"),
    ("RBLBANK", "RBL Bank Ltd", "Banking", [], ["IN_FEDERALBNK", "IN_IDFCFIRSTB", "IN_BANDHANBNK"], "small"),
    ("UNIONBANK", "Union Bank of India", "Banking", ["NIFTY 500"], ["IN_BANKBARODA", "IN_PNB", "IN_CANBK"], "mid"),
    ("YESBANK", "Yes Bank Ltd", "Banking", [], ["IN_RBLBANK", "IN_IDFCFIRSTB", "IN_BANDHANBNK"], "small"),
    ("AUBANK", "AU Small Finance Bank Ltd", "Banking", ["NIFTY 500"], ["IN_FEDERALBNK", "IN_BANDHANBNK", "IN_IDFCFIRSTB"], "mid"),
    ("KARURVYSYA", "Karur Vysya Bank Ltd", "Banking", [], ["IN_FEDERALBNK", "IN_DCBBANK", "IN_RBLBANK"], "small"),
    # Auto
    ("TATAMOTORS", "Tata Motors Ltd", "Automobiles", ["NIFTY 50", "SENSEX"], ["IN_MARUTI", "IN_M&M", "IN_BAJAJ-AUTO"], "large"),
    ("MARUTI", "Maruti Suzuki India Ltd", "Automobiles", ["NIFTY 50", "SENSEX"], ["IN_TATAMOTORS", "IN_M&M", "IN_EICHERMOT"], "mega"),
    ("M&M", "Mahindra & Mahindra Ltd", "Automobiles", ["NIFTY 50", "SENSEX"], ["IN_MARUTI", "IN_TATAMOTORS", "IN_BAJAJ-AUTO"], "mega"),
    ("BAJAJ-AUTO", "Bajaj Auto Ltd", "Automobiles", ["NIFTY 50"], ["IN_EICHERMOT", "IN_TVSMOTOR", "IN_HEROMOTOCO"], "large"),
    ("EICHERMOT", "Eicher Motors Ltd", "Automobiles", ["NIFTY 50"], ["IN_BAJAJ-AUTO", "IN_TVSMOTOR", "IN_HEROMOTOCO"], "large"),
    ("ASHOKLEY", "Ashok Leyland Ltd", "Commercial Vehicles", ["NIFTY 500"], ["IN_TATAMOTORS", "IN_M&M", "IN_BAJAJ-AUTO"], "mid"),
    ("TVSMOTOR", "TVS Motor Company Ltd", "Automobiles", ["NIFTY 500"], ["IN_BAJAJ-AUTO", "IN_HEROMOTOCO", "IN_EICHERMOT"], "large"),
    ("HEROMOTOCO", "Hero MotoCorp Ltd", "Automobiles", ["NIFTY 50"], ["IN_BAJAJ-AUTO", "IN_TVSMOTOR", "IN_EICHERMOT"], "large"),
    ("MOTHERSON", "Samvardhana Motherson International Ltd", "Auto Parts", ["NIFTY 500"], ["IN_APOLLOTYRE", "IN_MRF", "IN_BALKRISIND"], "large"),
    ("APOLLOTYRE", "Apollo Tyres Ltd", "Tires & Rubber", ["NIFTY 500"], ["IN_MRF", "IN_BALKRISIND", "IN_CEAT"], "mid"),
    ("MRF", "MRF Ltd", "Tires & Rubber", ["NIFTY 500"], ["IN_APOLLOTYRE", "IN_BALKRISIND", "IN_CEAT"], "large"),
    ("BALKRISIND", "Balkrishna Industries Ltd", "Tires & Rubber", ["NIFTY 500"], ["IN_MRF", "IN_APOLLOTYRE", "IN_CEAT"], "mid"),
    # Energy & Power
    ("NTPC", "NTPC Ltd", "Power Generation", ["NIFTY 50", "SENSEX"], ["IN_POWERGRID", "IN_COALINDIA", "IN_TATAPOWER"], "mega"),
    ("POWERGRID", "Power Grid Corporation of India Ltd", "Power Transmission", ["NIFTY 50", "SENSEX"], ["IN_NTPC", "IN_NHPC", "IN_TATAPOWER"], "large"),
    ("COALINDIA", "Coal India Ltd", "Mining", ["NIFTY 50", "SENSEX"], ["IN_NTPC", "IN_POWERGRID", "IN_ONGC"], "mega"),
    ("ONGC", "Oil and Natural Gas Corporation Ltd", "Oil & Gas", ["NIFTY 50", "SENSEX"], ["IN_BPCL", "IN_IOC", "IN_GAIL"], "mega"),
    ("BPCL", "Bharat Petroleum Corporation Ltd", "Oil & Gas Refining", ["NIFTY 50", "SENSEX"], ["IN_ONGC", "IN_IOC", "IN_GAIL"], "large"),
    ("IOC", "Indian Oil Corporation Ltd", "Oil & Gas Refining", ["NIFTY 50"], ["IN_BPCL", "IN_ONGC", "IN_GAIL"], "large"),
    ("GAIL", "GAIL (India) Ltd", "Oil & Gas", ["NIFTY 50"], ["IN_ONGC", "IN_BPCL", "IN_IOC"], "large"),
    ("TATAPOWER", "Tata Power Company Ltd", "Power", ["NIFTY 500"], ["IN_NTPC", "IN_POWERGRID", "IN_ADANIPOWER"], "large"),
    ("ADANIENT", "Adani Enterprises Ltd", "Conglomerate", ["NIFTY 50", "SENSEX"], ["IN_RELIANCE", "IN_ADANIPORTS", "IN_ADANIPOWER"], "mega"),
    ("ADANIGREEN", "Adani Green Energy Ltd", "Renewable Energy", ["NIFTY 500"], ["IN_TATAPOWER", "IN_NTPC", "IN_SJVN"], "large"),
    ("ADANIPORTS", "Adani Ports and Special Economic Zone Ltd", "Ports", ["NIFTY 50", "SENSEX"], ["IN_CONCOR", "IN_ADANIENT", "IN_JSWINFRA"], "large"),
    ("ADANIPOWER", "Adani Power Ltd", "Power Generation", ["NIFTY 500"], ["IN_NTPC", "IN_TATAPOWER", "IN_TORNTPOWER"], "large"),
    ("TORNTPOWER", "Torrent Power Ltd", "Power", [], ["IN_TATAPOWER", "IN_ADANIPOWER", "IN_NTPC"], "mid"),
    ("NHPC", "NHPC Ltd", "Hydropower", [], ["IN_NTPC", "IN_POWERGRID", "IN_SJVN"], "mid"),
    ("SJVN", "SJVN Ltd", "Hydropower", [], ["IN_NHPC", "IN_NTPC", "IN_ADANIGREEN"], "small"),
    # Pharma
    ("DRREDDY", "Dr. Reddy's Laboratories Ltd", "Pharmaceuticals", ["NIFTY 50", "SENSEX"], ["IN_CIPLA", "IN_DIVISLAB", "IN_LUPIN"], "large"),
    ("CIPLA", "Cipla Ltd", "Pharmaceuticals", ["NIFTY 50", "SENSEX"], ["IN_DRREDDY", "IN_DIVISLAB", "IN_LUPIN"], "large"),
    ("DIVISLAB", "Divi's Laboratories Ltd", "Pharmaceuticals", ["NIFTY 50"], ["IN_DRREDDY", "IN_CIPLA", "IN_LUPIN"], "large"),
    ("LUPIN", "Lupin Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_CIPLA", "IN_DRREDDY", "IN_AUROPHARMA"], "large"),
    ("AUROPHARMA", "Aurobindo Pharma Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_LUPIN", "IN_CIPLA", "IN_DRREDDY"], "mid"),
    ("TORNTPHARM", "Torrent Pharmaceuticals Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_CIPLA", "IN_LUPIN", "IN_DRREDDY"], "mid"),
    ("BIOCON", "Biocon Ltd", "Biotechnology", ["NIFTY 500"], ["IN_DRREDDY", "IN_CIPLA", "IN_AUROPHARMA"], "mid"),
    ("MANKIND", "Mankind Pharma Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_CIPLA", "IN_LUPIN", "IN_DRREDDY"], "large"),
    ("ABBOTINDIA", "Abbott India Ltd", "Pharmaceuticals", [], ["IN_NESTLEIND", "IN_PFIZERINDIA", "IN_SANOFI"], "mid"),
    ("ALKEM", "Alkem Laboratories Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_LUPIN", "IN_CIPLA", "IN_DRREDDY"], "mid"),
    ("IPCALAB", "IPCA Laboratories Ltd", "Pharmaceuticals", [], ["IN_CIPLA", "IN_LUPIN", "IN_AUROPHARMA"], "small"),
    ("LAURUSLABS", "Laurus Labs Ltd", "Pharmaceuticals", ["NIFTY 500"], ["IN_AUROPHARMA", "IN_CIPLA", "IN_LUPIN"], "mid"),
    ("GLENMARK", "Glenmark Pharmaceuticals Ltd", "Pharmaceuticals", [], ["IN_CIPLA", "IN_LUPIN", "IN_AUROPHARMA"], "mid"),
    # FMCG
    ("ITC", "ITC Ltd", "FMCG", ["NIFTY 50", "SENSEX"], ["IN_HINDUNILVR", "IN_GODREJCP", "IN_DABUR"], "mega"),
    ("NESTLEIND", "Nestle India Ltd", "FMCG", ["NIFTY 50"], ["IN_ITC", "IN_HINDUNILVR", "IN_BRITANNIA"], "large"),
    ("BRITANNIA", "Britannia Industries Ltd", "FMCG", ["NIFTY 500"], ["IN_NESTLEIND", "IN_ITC", "IN_HINDUNILVR"], "large"),
    ("DABUR", "Dabur India Ltd", "FMCG", ["NIFTY 500"], ["IN_HINDUNILVR", "IN_GODREJCP", "IN_MARICO"], "large"),
    ("GODREJCP", "Godrej Consumer Products Ltd", "FMCG", ["NIFTY 50"], ["IN_HINDUNILVR", "IN_DABUR", "IN_MARICO"], "large"),
    ("COLPAL", "Colgate-Palmolive (India) Ltd", "FMCG", ["NIFTY 500"], ["IN_HINDUNILVR", "IN_DABUR", "IN_MARICO"], "large"),
    ("MARICO", "Marico Ltd", "FMCG", ["NIFTY 500"], ["IN_GODREJCP", "IN_DABUR", "IN_HINDUNILVR"], "large"),
    ("TATACONSUM", "Tata Consumer Products Ltd", "FMCG", ["NIFTY 50"], ["IN_ITC", "IN_HINDUNILEVR", "IN_BRITANNIA"], "large"),
    ("UBL", "United Breweries Ltd", "Beverages", [], ["IN_UNITDSPR", "IN_RADICO", "IN_VBL"], "mid"),
    ("VBL", "Varun Beverages Ltd", "Beverages", ["NIFTY 500"], ["IN_UBL", "IN_UNITDSPR", "IN_NESTLEIND"], "large"),
    ("UNITDSPR", "United Spirits Ltd", "Beverages", ["NIFTY 500"], ["IN_UBL", "IN_RADICO", "IN_VBL"], "mid"),
    ("RADICO", "Radico Khaitan Ltd", "Beverages", [], ["IN_UNITDSPR", "IN_UBL", "IN_GLOBUSSPR"], "small"),
    ("EMAMILTD", "Emami Ltd", "FMCG", [], ["IN_DABUR", "IN_MARICO", "IN_GODREJCP"], "mid"),
    ("JYOTHYLAB", "Jyothy Labs Ltd", "FMCG", [], ["IN_EMAMILTD", "IN_MARICO", "IN_DABUR"], "small"),
    # Metals & Mining
    ("TATASTEEL", "Tata Steel Ltd", "Steel", ["NIFTY 50", "SENSEX"], ["IN_JSWSTEEL", "IN_SAIL", "IN_JINDALSTEL"], "large"),
    ("JSWSTEEL", "JSW Steel Ltd", "Steel", ["NIFTY 50", "SENSEX"], ["IN_TATASTEEL", "IN_SAIL", "IN_JINDALSTEL"], "large"),
    ("HINDALCO", "Hindalco Industries Ltd", "Aluminium", ["NIFTY 50", "SENSEX"], ["IN_VEDL", "IN_NATIONALUM", "IN_HINDZINC"], "large"),
    ("VEDL", "Vedanta Ltd", "Metals & Mining", ["NIFTY 500"], ["IN_HINDALCO", "IN_HINDZINC", "IN_NATIONALUM"], "large"),
    ("NMDC", "NMDC Ltd", "Mining", ["NIFTY 500"], ["IN_COALINDIA", "IN_MOIL", "IN_VEDL"], "mid"),
    ("JINDALSTEL", "Jindal Steel & Power Ltd", "Steel", ["NIFTY 500"], ["IN_TATASTEEL", "IN_JSWSTEEL", "IN_SAIL"], "mid"),
    ("SAIL", "Steel Authority of India Ltd", "Steel", ["NIFTY 500"], ["IN_TATASTEEL", "IN_JSWSTEEL", "IN_JINDALSTEL"], "mid"),
    ("HINDZINC", "Hindustan Zinc Ltd", "Zinc Mining", [], ["IN_VEDL", "IN_HINDALCO", "IN_NATIONALUM"], "large"),
    ("NATIONALUM", "National Aluminium Company Ltd", "Aluminium", [], ["IN_HINDALCO", "IN_VEDL", "IN_HINDZINC"], "mid"),
    ("JSWINFRA", "JSW Infrastructure Ltd", "Ports", [], ["IN_ADANIPORTS", "IN_CONCOR", "IN_JSWSTEEL"], "mid"),
    # Industrials / Capital Goods
    ("SIEMENS", "Siemens Ltd", "Electrical Equipment", ["NIFTY 500"], ["IN_ABB", "IN_CGPOWER", "IN_HAVELLS"], "large"),
    ("ABB", "ABB India Ltd", "Electrical Equipment", ["NIFTY 500"], ["IN_SIEMENS", "IN_CGPOWER", "IN_SCHNEIDER"], "large"),
    ("BEL", "Bharat Electronics Ltd", "Defense Electronics", ["NIFTY 50", "SENSEX"], ["IN_HAL", "IN_BHEL", "IN_ASTRAZENECA"], "large"),
    ("BHEL", "Bharat Heavy Electricals Ltd", "Power Equipment", ["NIFTY 500"], ["IN_BEL", "IN_SIEMENS", "IN_ABB"], "mid"),
    ("HAL", "Hindustan Aeronautics Ltd", "Aerospace & Defense", ["NIFTY 50", "SENSEX"], ["IN_BEL", "IN_BHEL", "IN_BHARAT"], "large"),
    ("CGPOWER", "CG Power and Industrial Solutions Ltd", "Electrical Equipment", ["NIFTY 500"], ["IN_SIEMENS", "IN_ABB", "IN_HAVELLS"], "mid"),
    ("POLYCAB", "Polycab India Ltd", "Cables & Wires", ["NIFTY 500"], ["IN_KEI", "IN_FINOLEX", "IN_HAVELLS"], "large"),
    ("KEI", "KEI Industries Ltd", "Cables & Wires", ["NIFTY 500"], ["IN_POLYCAB", "IN_FINOLEX", "IN_HAVELLS"], "mid"),
    ("HAVELLS", "Havells India Ltd", "Electrical Equipment", ["NIFTY 500"], ["IN_POLYCAB", "IN_SIEMENS", "IN_CGPOWER"], "large"),
    ("VOLTAS", "Voltas Ltd", "Consumer Electronics", ["NIFTY 500"], ["IN_HAVELLS", "IN_CGPOWER", "IN_BLUESTAR"], "mid"),
    ("THERMAX", "Thermax Ltd", "Industrial Machinery", [], ["IN_SIEMENS", "IN_ABB", "IN_BHEL"], "mid"),
    ("SCHAEFFLER", "Schaeffler India Ltd", "Auto Components", [], ["IN_BOSCHLTD", "IN_TIINDIA", "IN_MOTHERSON"], "mid"),
    ("BOSCHLTD", "Bosch Ltd", "Auto Components", [], ["IN_SCHAEFFLER", "IN_TIINDIA", "IN_MOTHERSON"], "mid"),
    ("TIINDIA", "Tube Investments of India Ltd", "Auto Components", ["NIFTY 500"], ["IN_BOSCHLTD", "IN_SCHAEFFLER", "IN_MOTHERSON"], "mid"),
    ("DIXON", "Dixon Technologies (India) Ltd", "Electronics", ["NIFTY 500"], ["IN_AMBER", "IN_KAYNES", "IN_PGEL"], "mid"),
    ("AMBER", "Amber Enterprises India Ltd", "Electronics", [], ["IN_DIXON", "IN_KAYNES", "IN_HAVELLS"], "small"),
    ("KAYNES", "Kaynes Technology India Ltd", "Electronics", [], ["IN_DIXON", "IN_AMBER", "IN_AVALON"], "small"),
    # Financial Services
    ("BAJFINANCE", "Bajaj Finance Ltd", "NBFC", ["NIFTY 50", "SENSEX"], ["IN_BAJAJFINSV", "IN_CHOLAFIN", "IN_SHRIRAMFIN"], "mega"),
    ("BAJAJFINSV", "Bajaj Finserv Ltd", "Financial Conglomerate", ["NIFTY 50", "SENSEX"], ["IN_BAJFINANCE", "IN_HDFCLIFE", "IN_SBILIFE"], "mega"),
    ("HDFCLIFE", "HDFC Life Insurance Company Ltd", "Life Insurance", ["NIFTY 50", "SENSEX"], ["IN_SBILIFE", "IN_ICICIPRULI", "IN_LICI"], "large"),
    ("SBILIFE", "SBI Life Insurance Company Ltd", "Life Insurance", ["NIFTY 50", "SENSEX"], ["IN_HDFCLIFE", "IN_ICICIPRULI", "IN_LICI"], "large"),
    ("ICICIPRULI", "ICICI Prudential Life Insurance Company Ltd", "Life Insurance", ["NIFTY 500"], ["IN_HDFCLIFE", "IN_SBILIFE", "IN_LICI"], "large"),
    ("RECLTD", "REC Ltd", "Power Finance", ["NIFTY 50", "SENSEX"], ["IN_PFC", "IN_IRFC", "IN_PNB"], "large"),
    ("PFC", "Power Finance Corporation Ltd", "Power Finance", ["NIFTY 50", "SENSEX"], ["IN_RECLTD", "IN_IRFC", "IN_NTPC"], "large"),
    ("CHOLAFIN", "Cholamandalam Investment and Finance Company Ltd", "NBFC", ["NIFTY 500"], ["IN_BAJFINANCE", "IN_SHRIRAMFIN", "IN_MUTHOOTFIN"], "large"),
    ("SHRIRAMFIN", "Shriram Finance Ltd", "NBFC", ["NIFTY 50"], ["IN_CHOLAFIN", "IN_BAJFINANCE", "IN_MUTHOOTFIN"], "large"),
    ("MUTHOOTFIN", "Muthoot Finance Ltd", "NBFC", ["NIFTY 500"], ["IN_SHRIRAMFIN", "IN_CHOLAFIN", "IN_MANAPPURAM"], "large"),
    ("MANAPPURAM", "Manappuram Finance Ltd", "NBFC", [], ["IN_MUTHOOTFIN", "IN_CHOLAFIN", "IN_SHRIRAMFIN"], "mid"),
    ("IRFC", "Indian Railway Finance Corporation Ltd", "Infrastructure Finance", ["NIFTY 500"], ["IN_RECLTD", "IN_PFC", "IN_NHPC"], "mid"),
    ("LICHSGFIN", "LIC Housing Finance Ltd", "Housing Finance", [], ["IN_HDFC", "IN_BAJFINANCE", "IN_CHOLAFIN"], "mid"),
    # Consumer / Retail
    ("TITAN", "Titan Company Ltd", "Jewellery & Watches", ["NIFTY 50", "SENSEX"], ["IN_KALYANKJIL", "IN_MANYAVAR", "IN_ASIANPAINT"], "large"),
    ("ASIANPAINT", "Asian Paints Ltd", "Paints", ["NIFTY 50", "SENSEX"], ["IN_BERGEPAINT", "IN_PIDILITIND", "IN_INDIGOPNTS"], "mega"),
    ("PIDILITIND", "Pidilite Industries Ltd", "Specialty Chemicals", ["NIFTY 50"], ["IN_ASIANPAINT", "IN_BERGEPAINT", "IN_SRF"], "large"),
    ("BERGEPAINT", "Berger Paints India Ltd", "Paints", ["NIFTY 500"], ["IN_ASIANPAINT", "IN_PIDILITIND", "IN_INDIGOPNTS"], "large"),
    ("TRENT", "Trent Ltd", "Retail", ["NIFTY 50", "SENSEX"], ["IN_AVENUESUPM", "IN_DMART", "IN_NYKAA"], "large"),
    ("AVENUESUPM", "Avenue Supermarts Ltd", "Retail", ["NIFTY 500"], ["IN_TRENT", "IN_DMART", "IN_JUBLFOOD"], "mega"),
    ("JUBLFOOD", "Jubilant FoodWorks Ltd", "Restaurants", ["NIFTY 500"], ["IN_DEVYANI", "IN_WESTLIFE", "IN_SAPPHIRE"], "mid"),
    ("PAGEIND", "Page Industries Ltd", "Apparel", [], ["IN_TRENT", "IN_MANYAVAR", "IN_VEDANT"], "mid"),
    ("INDIGOPNTS", "Indigo Paints Ltd", "Paints", [], ["IN_ASIANPAINT", "IN_BERGEPAINT", "IN_KANSAINER"], "small"),
    ("KALYANKJIL", "Kalyan Jewellers India Ltd", "Jewellery", ["NIFTY 500"], ["IN_TITAN", "IN_MANYAVAR", "IN_PCJEWELLER"], "mid"),
    ("MANYAVAR", "Vedant Fashions Ltd", "Apparel", [], ["IN_TRENT", "IN_PAGEIND", "IN_KALYANKJIL"], "mid"),
    ("NYKAA", "FSN E-Commerce Ventures Ltd", "E-Commerce", ["NIFTY 500"], ["IN_ZOMATO", "IN_PAYTM", "IN_TRENT"], "mid"),
    ("ZOMATO", "Zomato Ltd", "Food Delivery", ["NIFTY 50", "SENSEX"], ["IN_SWIGGY", "IN_NYKAA", "IN_DELHIVERY"], "large"),
    ("DELHIVERY", "Delhivery Ltd", "Logistics", ["NIFTY 500"], ["IN_CONCOR", "IN_BLUEDART", "IN_ZOMATO"], "mid"),
    ("IRCTC", "Indian Railway Catering and Tourism Corporation Ltd", "Tourism", ["NIFTY 500"], ["IN_EASEMYTRIP", "IN_INDIGO", "IN_RELAXO"], "large"),
    ("PAYTM", "One97 Communications Ltd", "Fintech", [], ["IN_NYKAA", "IN_ZOMATO", "IN_POLICYBZR"], "mid"),
    ("POLICYBZR", "PB Fintech Ltd", "Fintech", ["NIFTY 500"], ["IN_PAYTM", "IN_NYKAA", "IN_ZOMATO"], "mid"),
    ("DEVYANI", "Devyani International Ltd", "Restaurants", [], ["IN_JUBLFOOD", "IN_WESTLIFE", "IN_SAPPHIRE"], "mid"),
    ("WESTLIFE", "Westlife Foodworld Ltd", "Restaurants", [], ["IN_JUBLFOOD", "IN_DEVYANI", "IN_SAPPHIRE"], "small"),
    # Telecom / Media
    ("INDUSTOWER", "Indus Towers Ltd", "Telecom Infrastructure", ["NIFTY 500"], ["IN_BHARTIARTL", "IN_TATACOMM", "IN_AMT"], "large"),
    ("TATACOMM", "Tata Communications Ltd", "Telecom", [], ["IN_BHARTIARTL", "IN_INDUSTOWER", "IN_MTNL"], "mid"),
    ("SUNTV", "Sun TV Network Ltd", "Media", [], ["IN_ZEEL", "IN_PVRINOX", "IN_SHREYANS"], "mid"),
    ("ZEEL", "Zee Entertainment Enterprises Ltd", "Media", ["NIFTY 500"], ["IN_SUNTV", "IN_PVRINOX", "IN_SAREGAMA"], "small"),
    ("PVRINOX", "PVR INOX Ltd", "Entertainment", [], ["IN_ZEEL", "IN_SUNTV", "IN_MANYAVAR"], "mid"),
    # Cement / Infrastructure
    ("ULTRACEMCO", "UltraTech Cement Ltd", "Cement", ["NIFTY 50", "SENSEX"], ["IN_GRASIM", "IN_AMBUJACEM", "IN_ACC"], "mega"),
    ("GRASIM", "Grasim Industries Ltd", "Cement & Textiles", ["NIFTY 50", "SENSEX"], ["IN_ULTRACEMCO", "IN_AMBUJACEM", "IN_ACC"], "large"),
    ("AMBUJACEM", "Ambuja Cements Ltd", "Cement", ["NIFTY 500"], ["IN_ULTRACEMCO", "IN_ACC", "IN_GRASIM"], "large"),
    ("ACC", "ACC Ltd", "Cement", ["NIFTY 500"], ["IN_AMBUJACEM", "IN_ULTRACEMCO", "IN_GRASIM"], "large"),
    ("SHREECEM", "Shree Cement Ltd", "Cement", ["NIFTY 500"], ["IN_ULTRACEMCO", "IN_GRASIM", "IN_AMBUJACEM"], "large"),
    ("CONCOR", "Container Corporation of India Ltd", "Logistics", ["NIFTY 500"], ["IN_DELHIVERY", "IN_ADANIPORTS", "IN_JSWINFRA"], "mid"),
    ("INDIGO", "InterGlobe Aviation Ltd", "Airlines", ["NIFTY 50", "SENSEX"], ["IN_EASEMYTRIP", "IN_SPICEJET", "IN_AIRINDIA"], "large"),
    ("EASEMYTRIP", "Easy Trip Planners Ltd", "Travel", [], ["IN_IRCTC", "IN_INDIGO", "IN_MAKEMYTRIP"], "small"),
    ("CDSL", "Central Depository Services (India) Ltd", "Financial Services", ["NIFTY 500"], ["IN_BSE", "IN_NSEIFSC", "IN_MCXINDIA"], "mid"),
    ("MCXINDIA", "Multi Commodity Exchange of India Ltd", "Financial Exchanges", [], ["IN_CDSL", "IN_BSE", "IN_NSEIFSC"], "mid"),
]


def make_us_instrument(ticker: str, name: str, industry: str, exchange: str,
                        indices: list[str], peers: list[str], cap: str) -> dict:
    instrument_id = f"US_{ticker}"
    return {
        "instrument_id": instrument_id,
        "market": "US",
        "ticker": ticker,
        "name": name,
        "exchange": exchange,
        "country": "US",
        "currency": "USD",
        "sector": _us_sector(industry),
        "industry": industry,
        "description": f"{name} tracked in the US core universe.",
        "logo_url": "",
        "index_memberships": indices,
        "peer_ids": peers,
        "aliases": [ticker, name.split(" ")[0]],
        "support_tier": "core" if cap in ("mega", "large") else "standard",
        "universes": ["us_core_155"],
        "status": "active",
        "updated_at": NOW,
    }


def make_in_instrument(ticker: str, name: str, industry: str,
                        indices: list[str], peers: list[str], cap: str) -> dict:
    instrument_id = f"IN_{ticker.replace('&', 'AND').replace('-', '_')}"
    return {
        "instrument_id": instrument_id,
        "market": "IN",
        "ticker": ticker,
        "quote_symbol": ticker,
        "quote_exchange": "NSE",
        "name": name,
        "exchange": "NSE",
        "country": "IN",
        "currency": "INR",
        "sector": _in_sector(industry),
        "industry": industry,
        "description": f"{name} tracked in the India core universe.",
        "logo_url": "",
        "index_memberships": indices,
        "peer_ids": peers,
        "aliases": [ticker, name.split(" ")[0], name],
        "support_tier": "core" if cap in ("mega", "large") else "standard",
        "universes": ["in_core_150"],
        "status": "active",
        "updated_at": NOW,
    }


def _us_sector(industry: str) -> str:
    industry_lower = industry.lower()
    if any(x in industry_lower for x in ["software", "semiconductor", "it", "tech", "computing", "quantum", "cyber", "server"]):
        return "Technology"
    if any(x in industry_lower for x in ["pharma", "biotech", "medical", "life sci", "health"]):
        return "Healthcare"
    if any(x in industry_lower for x in ["bank", "finance", "insurance", "reit", "exchange", "fintech"]):
        return "Financials"
    if any(x in industry_lower for x in ["energy", "oil", "gas", "mining", "utilities", "power", "renewabl"]):
        return "Energy"
    if any(x in industry_lower for x in ["consumer", "beverage", "tobacco", "fmcg", "restaurant", "retail"]):
        return "Consumer"
    if any(x in industry_lower for x in ["industrial", "aerospace", "defense", "auto", "chemical", "material", "metal"]):
        return "Industrials"
    return "Technology"


def _in_sector(industry: str) -> str:
    industry_lower = industry.lower()
    if any(x in industry_lower for x in ["it", "software", "tech", "engineering serv"]):
        return "IT"
    if any(x in industry_lower for x in ["bank", "nбfc", "nbfc", "housing finance", "micro", "muthoot"]):
        return "Banking"
    if any(x in industry_lower for x in ["pharma", "biotech"]):
        return "Pharma"
    if any(x in industry_lower for x in ["auto", "tires", "tyre", "vehicle", "commercial"]):
        return "Auto"
    if any(x in industry_lower for x in ["fmcg", "beverage", "tobacco", "consumer staple"]):
        return "FMCG"
    if any(x in industry_lower for x in ["steel", "aluminium", "zinc", "mining", "metal", "copper"]):
        return "Metals"
    if any(x in industry_lower for x in ["power", "energy", "oil", "gas", "coal", "electricity", "hydro", "renewabl", "solar"]):
        return "Energy"
    if any(x in industry_lower for x in ["insurance", "finance", "nbfc", "fintech", "exchange", "depository"]):
        return "Financial Services"
    if any(x in industry_lower for x in ["cement", "infra", "port", "logistic", "airline", "transport"]):
        return "Industrials"
    if any(x in industry_lower for x in ["telecom", "media", "entertainment"]):
        return "Telecom"
    if any(x in industry_lower for x in ["capital goods", "electrical", "defense", "aerospace", "heavy", "cable", "wire", "electronic"]):
        return "Industrials"
    if any(x in industry_lower for x in ["retail", "jewellery", "paint", "restaurant", "apparel", "e-commerce", "food delivery", "travel", "tourism"]):
        return "Consumer"
    return "Consumer"


def main() -> None:
    data = json.loads(UNIVERSE_PATH.read_text(encoding="utf-8"))

    # --- US ---
    existing_us_ids = {inst["instrument_id"] for inst in data["markets"]["US"]["instruments"]}
    existing_us_tickers = {inst["ticker"] for inst in data["markets"]["US"]["instruments"]}
    new_us_instruments = []
    new_us_ids = []
    for row in NEW_US:
        ticker = row[0]
        if ticker in existing_us_tickers:
            print(f"[US] {ticker} already exists, skipping instrument")
            # Still include in universe
            candidate_id = f"US_{ticker}"
            if candidate_id in existing_us_ids:
                new_us_ids.append(candidate_id)
            continue
        inst = make_us_instrument(*row)
        new_us_instruments.append(inst)
        new_us_ids.append(inst["instrument_id"])
        existing_us_ids.add(inst["instrument_id"])
        existing_us_tickers.add(ticker)

    data["markets"]["US"]["instruments"].extend(new_us_instruments)

    # Build us_core_155 = all existing us_core_100 + new ones + anything new
    existing_core_100 = list(data["markets"]["US"]["universes"].get("us_core_100", []))
    all_us_ids = existing_core_100 + [uid for uid in new_us_ids if uid not in existing_core_100]
    data["markets"]["US"]["universes"]["us_core_155"] = all_us_ids

    # --- India ---
    existing_in_ids = {inst["instrument_id"] for inst in data["markets"]["IN"]["instruments"]}
    existing_in_tickers = {inst["ticker"] for inst in data["markets"]["IN"]["instruments"]}
    new_in_instruments = []
    new_in_ids = []

    # Start with current IN universe
    existing_in_core = list(data["markets"]["IN"]["universes"].get("in_test_10", []))

    for row in NEW_IN:
        ticker = row[0]
        if ticker in existing_in_tickers:
            print(f"[IN] {ticker} already exists, skipping instrument")
            safe_ticker = ticker.replace("&", "AND").replace("-", "_")
            candidate_id = f"IN_{safe_ticker}"
            if candidate_id in existing_in_ids:
                new_in_ids.append(candidate_id)
            continue
        inst = make_in_instrument(*row)
        new_in_instruments.append(inst)
        new_in_ids.append(inst["instrument_id"])
        existing_in_ids.add(inst["instrument_id"])
        existing_in_tickers.add(ticker)

    data["markets"]["IN"]["instruments"].extend(new_in_instruments)

    # Build in_core_150 = existing IN stocks + new ones
    all_in_ids = existing_in_core + [uid for uid in new_in_ids if uid not in existing_in_core]
    data["markets"]["IN"]["universes"]["in_core_150"] = all_in_ids

    # Write updated instrument_universe.json
    UNIVERSE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n✓ instrument_universe.json updated")
    print(f"  US: us_core_155 member list refreshed")
    print(f"  IN: in_core_150 member list refreshed")

    # --- Update tikrr_eval_universe.json ---
    # Get all US tickers in the new universe
    us_ticker_map = {inst["instrument_id"]: inst["ticker"] for inst in data["markets"]["US"]["instruments"]}
    in_ticker_map = {inst["instrument_id"]: inst["ticker"] for inst in data["markets"]["IN"]["instruments"]}

    us_symbols = [us_ticker_map[uid] for uid in all_us_ids if uid in us_ticker_map]
    in_symbols = [in_ticker_map[uid] for uid in all_in_ids if uid in in_ticker_map]

    eval_data = {
        "US": us_symbols,
        "IN": in_symbols,
    }
    EVAL_PATH.write_text(json.dumps(eval_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✓ tikrr_eval_universe.json updated (US + IN)")


if __name__ == "__main__":
    main()
