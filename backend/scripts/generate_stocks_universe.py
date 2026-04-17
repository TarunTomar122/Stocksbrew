"""Generate lib/stocks-universe.ts from config files.

Run from project root:
    python3 -m backend.scripts.generate_stocks_universe

Produces a TypeScript module with the full stock list baked in — no Firestore
needed for search/autocomplete.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL_PATH = ROOT / "backend" / "config" / "tikrr_eval_universe.json"
OUT_PATH = ROOT / "lib" / "stocks-universe.ts"

# ---------------------------------------------------------------------------
# Full name map (US + India) — keep in sync with seed_tikrr_meta.py
# ---------------------------------------------------------------------------
NAME_MAP: dict[str, str] = {
    # US
    "AAPL": "Apple Inc.", "MSFT": "Microsoft Corporation", "NVDA": "NVIDIA Corporation",
    "AMZN": "Amazon.com, Inc.", "META": "Meta Platforms, Inc.", "GOOGL": "Alphabet Inc.",
    "TSLA": "Tesla, Inc.", "AMD": "Advanced Micro Devices, Inc.", "AVGO": "Broadcom Inc.",
    "MU": "Micron Technology, Inc.", "QCOM": "Qualcomm Incorporated", "CRM": "Salesforce, Inc.",
    "NOW": "ServiceNow, Inc.", "PLTR": "Palantir Technologies Inc.", "LMT": "Lockheed Martin Corporation",
    "RTX": "RTX Corporation", "NOC": "Northrop Grumman Corporation", "GD": "General Dynamics Corporation",
    "BA": "The Boeing Company", "JPM": "JPMorgan Chase & Co.", "GS": "Goldman Sachs Group, Inc.",
    "MS": "Morgan Stanley", "BAC": "Bank of America Corporation", "XOM": "Exxon Mobil Corporation",
    "CVX": "Chevron Corporation", "SLB": "SLB (Schlumberger)", "LLY": "Eli Lilly and Company",
    "UNH": "UnitedHealth Group Incorporated", "PFE": "Pfizer Inc.", "COST": "Costco Wholesale Corporation",
    "ORCL": "Oracle Corporation", "ADBE": "Adobe Inc.", "INTC": "Intel Corporation",
    "TSM": "Taiwan Semiconductor Manufacturing", "ASML": "ASML Holding N.V.",
    "AMAT": "Applied Materials, Inc.", "LRCX": "Lam Research Corporation",
    "KLAC": "KLA Corporation", "MAR": "Marriott International, Inc.", "BKNG": "Booking Holdings Inc.",
    "ABNB": "Airbnb, Inc.", "EXPE": "Expedia Group, Inc.", "RIVN": "Rivian Automotive, Inc.",
    "F": "Ford Motor Company", "GM": "General Motors Company", "WMT": "Walmart Inc.",
    "TGT": "Target Corporation", "HD": "Home Depot, Inc.", "LOW": "Lowe's Companies, Inc.",
    "NKE": "Nike, Inc.", "LULU": "Lululemon Athletica Inc.", "DECK": "Deckers Outdoor Corporation",
    "ONON": "On Holding AG", "JNJ": "Johnson & Johnson", "MRK": "Merck & Co., Inc.",
    "CVS": "CVS Health Corporation", "CI": "The Cigna Group", "ELV": "Elevance Health, Inc.",
    "CAT": "Caterpillar Inc.", "DE": "Deere & Company", "ETN": "Eaton Corporation plc",
    "GE": "GE Aerospace", "HON": "Honeywell International Inc.", "EMR": "Emerson Electric Co.",
    "ROK": "Rockwell Automation, Inc.", "CMI": "Cummins Inc.", "BLK": "BlackRock, Inc.",
    "SCHW": "Charles Schwab Corporation", "C": "Citigroup Inc.", "WFC": "Wells Fargo & Company",
    "AXP": "American Express Company", "V": "Visa Inc.", "MA": "Mastercard Incorporated",
    "PYPL": "PayPal Holdings, Inc.", "COP": "ConocoPhillips", "EOG": "EOG Resources, Inc.",
    "HAL": "Halliburton Company", "BKR": "Baker Hughes Company", "MPC": "Marathon Petroleum Corporation",
    "PBF": "PBF Energy Inc.", "VAL": "Valaris Limited", "DIS": "The Walt Disney Company",
    "NFLX": "Netflix, Inc.", "CMCSA": "Comcast Corporation", "T": "AT&T Inc.",
    "VZ": "Verizon Communications Inc.", "TMUS": "T-Mobile US, Inc.",
    "UBER": "Uber Technologies, Inc.", "DASH": "DoorDash, Inc.", "LYFT": "Lyft, Inc.",
    "SNOW": "Snowflake Inc.", "MDB": "MongoDB, Inc.", "DDOG": "Datadog, Inc.",
    "NET": "Cloudflare, Inc.", "PANW": "Palo Alto Networks, Inc.",
    "CRWD": "CrowdStrike Holdings, Inc.", "ZS": "Zscaler, Inc.",
    "SHOP": "Shopify Inc.", "SQ": "Block, Inc.",
    # New US
    "ABBV": "AbbVie Inc.", "AMGN": "Amgen Inc.", "GILD": "Gilead Sciences, Inc.",
    "REGN": "Regeneron Pharmaceuticals, Inc.", "VRTX": "Vertex Pharmaceuticals Incorporated",
    "MRNA": "Moderna, Inc.", "BMY": "Bristol-Myers Squibb Company", "ZTS": "Zoetis Inc.",
    "MDT": "Medtronic plc", "ABT": "Abbott Laboratories", "SYK": "Stryker Corporation",
    "BSX": "Boston Scientific Corporation", "ISRG": "Intuitive Surgical, Inc.",
    "TMO": "Thermo Fisher Scientific Inc.", "DHR": "Danaher Corporation", "BIIB": "Biogen Inc.",
    "COF": "Capital One Financial Corporation", "USB": "U.S. Bancorp",
    "PNC": "PNC Financial Services Group, Inc.", "TFC": "Truist Financial Corporation",
    "SPGI": "S&P Global Inc.", "MCO": "Moody's Corporation",
    "ICE": "Intercontinental Exchange, Inc.", "CME": "CME Group Inc.", "NDAQ": "Nasdaq, Inc.",
    "COIN": "Coinbase Global, Inc.", "MSTR": "MicroStrategy Incorporated",
    "ARM": "Arm Holdings plc", "SMCI": "Super Micro Computer, Inc.",
    "MRVL": "Marvell Technology, Inc.", "TXN": "Texas Instruments Incorporated",
    "INTU": "Intuit Inc.", "SNPS": "Synopsys, Inc.", "CDNS": "Cadence Design Systems, Inc.",
    "FTNT": "Fortinet, Inc.", "OKTA": "Okta, Inc.", "WDAY": "Workday, Inc.",
    "VEEV": "Veeva Systems Inc.", "HUBS": "HubSpot, Inc.", "IONQ": "IonQ, Inc.",
    "KO": "The Coca-Cola Company", "PEP": "PepsiCo, Inc.",
    "PG": "The Procter & Gamble Company", "PM": "Philip Morris International Inc.",
    "MO": "Altria Group, Inc.", "SBUX": "Starbucks Corporation", "MCD": "McDonald's Corporation",
    "NEE": "NextEra Energy, Inc.", "DUK": "Duke Energy Corporation", "SO": "The Southern Company",
    "AMT": "American Tower Corporation", "PLD": "Prologis, Inc.", "EQIX": "Equinix, Inc.",
    "FCX": "Freeport-McMoRan Inc.", "NEM": "Newmont Corporation", "LIN": "Linde plc",
    "MARA": "MARA Holdings, Inc.", "RIOT": "Riot Platforms, Inc.",
    "RGTI": "Rigetti Computing, Inc.", "DATADOG": "Datadog, Inc.",
    "SOFI": "SoFi Technologies, Inc.", "AFRM": "Affirm Holdings, Inc.",
    "UPST": "Upstart Holdings, Inc.", "HOOD": "Robinhood Markets, Inc.",
    "PLUG": "Plug Power Inc.", "FCEL": "FuelCell Energy, Inc.",
    "CMG": "Chipotle Mexican Grill, Inc.", "LCID": "Lucid Group, Inc.", "NIO": "NIO Inc.",
    "ABB": "ABB Ltd.", "SBUX": "Starbucks Corporation", "MCD": "McDonald's Corporation",
    # India
    "RELIANCE": "Reliance Industries Ltd", "TCS": "Tata Consultancy Services Ltd",
    "INFY": "Infosys Ltd", "HCLTECH": "HCL Technologies Ltd", "WIPRO": "Wipro Ltd",
    "TECHM": "Tech Mahindra Ltd", "LTIM": "LTIMindtree Ltd",
    "LTTS": "L&T Technology Services Ltd", "MPHASIS": "Mphasis Ltd",
    "PERSISTENT": "Persistent Systems Ltd", "COFORGE": "Coforge Ltd",
    "TATAELXSI": "Tata Elxsi Ltd", "KPITTECH": "KPIT Technologies Ltd",
    "CYIENT": "Cyient Ltd", "BIRLASOFT": "Birlasoft Ltd", "MASTEK": "Mastek Ltd",
    "HEXAWARE": "Hexaware Technologies Ltd",
    "HDFCBANK": "HDFC Bank Ltd", "ICICIBANK": "ICICI Bank Ltd",
    "SBIN": "State Bank of India", "AXISBANK": "Axis Bank Ltd",
    "KOTAKBANK": "Kotak Mahindra Bank Ltd", "INDUSINDBK": "IndusInd Bank Ltd",
    "BANKBARODA": "Bank of Baroda", "PNB": "Punjab National Bank",
    "IDFCFIRSTB": "IDFC First Bank Ltd", "FEDERALBNK": "Federal Bank Ltd",
    "CANBK": "Canara Bank", "BANDHANBNK": "Bandhan Bank Ltd", "RBLBANK": "RBL Bank Ltd",
    "UNIONBANK": "Union Bank of India", "YESBANK": "Yes Bank Ltd",
    "AUBANK": "AU Small Finance Bank Ltd", "KARURVYSYA": "Karur Vysya Bank Ltd",
    "TATAMOTORS": "Tata Motors Ltd", "MARUTI": "Maruti Suzuki India Ltd",
    "M&M": "Mahindra & Mahindra Ltd", "BAJAJ-AUTO": "Bajaj Auto Ltd",
    "EICHERMOT": "Eicher Motors Ltd", "ASHOKLEY": "Ashok Leyland Ltd",
    "TVSMOTOR": "TVS Motor Company Ltd", "HEROMOTOCO": "Hero MotoCorp Ltd",
    "MOTHERSON": "Samvardhana Motherson International Ltd",
    "APOLLOTYRE": "Apollo Tyres Ltd", "MRF": "MRF Ltd",
    "BALKRISIND": "Balkrishna Industries Ltd", "CUMMINSIND": "Cummins India Ltd",
    "NTPC": "NTPC Ltd", "POWERGRID": "Power Grid Corporation of India Ltd",
    "COALINDIA": "Coal India Ltd", "ONGC": "Oil and Natural Gas Corporation Ltd",
    "BPCL": "Bharat Petroleum Corporation Ltd", "IOC": "Indian Oil Corporation Ltd",
    "GAIL": "GAIL (India) Ltd", "TATAPOWER": "Tata Power Company Ltd",
    "ADANIENT": "Adani Enterprises Ltd", "ADANIGREEN": "Adani Green Energy Ltd",
    "ADANIPORTS": "Adani Ports and SEZ Ltd", "ADANIPOWER": "Adani Power Ltd",
    "TORNTPOWER": "Torrent Power Ltd", "NHPC": "NHPC Ltd", "SJVN": "SJVN Ltd",
    "SUNPHARMA": "Sun Pharmaceutical Industries Ltd",
    "DRREDDY": "Dr. Reddy's Laboratories Ltd", "CIPLA": "Cipla Ltd",
    "DIVISLAB": "Divi's Laboratories Ltd", "LUPIN": "Lupin Ltd",
    "AUROPHARMA": "Aurobindo Pharma Ltd", "TORNTPHARM": "Torrent Pharmaceuticals Ltd",
    "BIOCON": "Biocon Ltd", "MANKIND": "Mankind Pharma Ltd",
    "ABBOTINDIA": "Abbott India Ltd", "ALKEM": "Alkem Laboratories Ltd",
    "IPCALAB": "IPCA Laboratories Ltd", "LAURUSLABS": "Laurus Labs Ltd",
    "GLENMARK": "Glenmark Pharmaceuticals Ltd",
    "HINDUNILVR": "Hindustan Unilever Ltd", "ITC": "ITC Ltd",
    "NESTLEIND": "Nestle India Ltd", "BRITANNIA": "Britannia Industries Ltd",
    "DABUR": "Dabur India Ltd", "GODREJCP": "Godrej Consumer Products Ltd",
    "COLPAL": "Colgate-Palmolive (India) Ltd", "MARICO": "Marico Ltd",
    "TATACONSUM": "Tata Consumer Products Ltd", "UBL": "United Breweries Ltd",
    "VBL": "Varun Beverages Ltd", "UNITDSPR": "United Spirits Ltd",
    "RADICO": "Radico Khaitan Ltd", "EMAMILTD": "Emami Ltd", "JYOTHYLAB": "Jyothy Labs Ltd",
    "TATASTEEL": "Tata Steel Ltd", "JSWSTEEL": "JSW Steel Ltd",
    "HINDALCO": "Hindalco Industries Ltd", "VEDL": "Vedanta Ltd",
    "NMDC": "NMDC Ltd", "JINDALSTEL": "Jindal Steel & Power Ltd",
    "SAIL": "Steel Authority of India Ltd", "HINDZINC": "Hindustan Zinc Ltd",
    "NATIONALUM": "National Aluminium Company Ltd", "JSWINFRA": "JSW Infrastructure Ltd",
    "LT": "Larsen & Toubro Ltd", "SIEMENS": "Siemens Ltd", "ABB": "ABB India Ltd",
    "BEL": "Bharat Electronics Ltd", "BHEL": "Bharat Heavy Electricals Ltd",
    "HAL": "Hindustan Aeronautics Ltd", "CGPOWER": "CG Power and Industrial Solutions Ltd",
    "POLYCAB": "Polycab India Ltd", "KEI": "KEI Industries Ltd",
    "HAVELLS": "Havells India Ltd", "VOLTAS": "Voltas Ltd", "THERMAX": "Thermax Ltd",
    "SCHAEFFLER": "Schaeffler India Ltd", "BOSCHLTD": "Bosch Ltd",
    "TIINDIA": "Tube Investments of India Ltd", "DIXON": "Dixon Technologies (India) Ltd",
    "AMBER": "Amber Enterprises India Ltd", "KAYNES": "Kaynes Technology India Ltd",
    "AMBUJACEM": "Ambuja Cements Ltd", "ACC": "ACC Ltd", "SHREECEM": "Shree Cement Ltd",
    "ULTRACEMCO": "UltraTech Cement Ltd", "GRASIM": "Grasim Industries Ltd",
    "CONCOR": "Container Corporation of India Ltd",
    "INDIGO": "InterGlobe Aviation Ltd", "EASEMYTRIP": "Easy Trip Planners Ltd",
    "BAJFINANCE": "Bajaj Finance Ltd", "BAJAJFINSV": "Bajaj Finserv Ltd",
    "HDFCLIFE": "HDFC Life Insurance Company Ltd", "SBILIFE": "SBI Life Insurance Company Ltd",
    "ICICIPRULI": "ICICI Prudential Life Insurance Company Ltd",
    "RECLTD": "REC Ltd", "PFC": "Power Finance Corporation Ltd",
    "CHOLAFIN": "Cholamandalam Investment and Finance Company Ltd",
    "SHRIRAMFIN": "Shriram Finance Ltd", "MUTHOOTFIN": "Muthoot Finance Ltd",
    "MANAPPURAM": "Manappuram Finance Ltd",
    "IRFC": "Indian Railway Finance Corporation Ltd",
    "LICHSGFIN": "LIC Housing Finance Ltd",
    "CDSL": "Central Depository Services (India) Ltd",
    "MCXINDIA": "Multi Commodity Exchange of India Ltd",
    "TITAN": "Titan Company Ltd", "ASIANPAINT": "Asian Paints Ltd",
    "PIDILITIND": "Pidilite Industries Ltd", "BERGEPAINT": "Berger Paints India Ltd",
    "TRENT": "Trent Ltd", "AVENUESUPM": "Avenue Supermarts Ltd",
    "JUBLFOOD": "Jubilant FoodWorks Ltd", "PAGEIND": "Page Industries Ltd",
    "INDIGOPNTS": "Indigo Paints Ltd", "KALYANKJIL": "Kalyan Jewellers India Ltd",
    "MANYAVAR": "Vedant Fashions Ltd", "NYKAA": "FSN E-Commerce Ventures Ltd",
    "ZOMATO": "Zomato Ltd", "DELHIVERY": "Delhivery Ltd",
    "IRCTC": "Indian Railway Catering and Tourism Corporation Ltd",
    "PAYTM": "One97 Communications Ltd", "POLICYBZR": "PB Fintech Ltd",
    "DEVYANI": "Devyani International Ltd", "WESTLIFE": "Westlife Foodworld Ltd",
    "BHARTIARTL": "Bharti Airtel Ltd", "INDUSTOWER": "Indus Towers Ltd",
    "TATACOMM": "Tata Communications Ltd", "SUNTV": "Sun TV Network Ltd",
    "ZEEL": "Zee Entertainment Enterprises Ltd", "PVRINOX": "PVR INOX Ltd",
}

SECTOR_MAP: dict[str, str] = {
    # US sectors (simplified)
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology", "AMZN": "Technology",
    "META": "Technology", "GOOGL": "Technology", "TSLA": "Consumer", "AMD": "Technology",
    "AVGO": "Technology", "MU": "Technology", "QCOM": "Technology", "CRM": "Technology",
    "NOW": "Technology", "ORCL": "Technology", "ADBE": "Technology", "INTC": "Technology",
    "TSM": "Technology", "ASML": "Technology", "AMAT": "Technology", "LRCX": "Technology",
    "KLAC": "Technology", "PLTR": "Technology", "SNOW": "Technology", "DDOG": "Technology",
    "NET": "Technology", "PANW": "Technology", "CRWD": "Technology", "ZS": "Technology",
    "SHOP": "Technology", "SQ": "Technology", "ARM": "Technology", "SMCI": "Technology",
    "MRVL": "Technology", "TXN": "Technology", "INTU": "Technology", "SNPS": "Technology",
    "CDNS": "Technology", "FTNT": "Technology", "OKTA": "Technology", "WDAY": "Technology",
    "VEEV": "Technology", "HUBS": "Technology", "MDB": "Technology", "IONQ": "Technology",
    "COIN": "Financials", "MSTR": "Technology", "MARA": "Technology", "RIOT": "Technology",
    "JPM": "Financials", "GS": "Financials", "MS": "Financials", "BAC": "Financials",
    "WFC": "Financials", "C": "Financials", "BLK": "Financials", "SCHW": "Financials",
    "AXP": "Financials", "V": "Financials", "MA": "Financials", "PYPL": "Financials",
    "COF": "Financials", "USB": "Financials", "PNC": "Financials", "TFC": "Financials",
    "SPGI": "Financials", "MCO": "Financials", "ICE": "Financials", "CME": "Financials",
    "NDAQ": "Financials", "SOFI": "Financials", "AFRM": "Financials", "UPST": "Financials",
    "HOOD": "Financials", "AMT": "Financials", "PLD": "Financials", "EQIX": "Financials",
    "LLY": "Healthcare", "UNH": "Healthcare", "PFE": "Healthcare", "JNJ": "Healthcare",
    "MRK": "Healthcare", "ABBV": "Healthcare", "AMGN": "Healthcare", "GILD": "Healthcare",
    "REGN": "Healthcare", "VRTX": "Healthcare", "MRNA": "Healthcare", "BMY": "Healthcare",
    "ZTS": "Healthcare", "MDT": "Healthcare", "ABT": "Healthcare", "SYK": "Healthcare",
    "BSX": "Healthcare", "ISRG": "Healthcare", "TMO": "Healthcare", "DHR": "Healthcare",
    "BIIB": "Healthcare", "CVS": "Healthcare", "CI": "Healthcare", "ELV": "Healthcare",
    "XOM": "Energy", "CVX": "Energy", "SLB": "Energy", "COP": "Energy", "EOG": "Energy",
    "HAL": "Energy", "BKR": "Energy", "MPC": "Energy", "PBF": "Energy", "VAL": "Energy",
    "NEE": "Energy", "DUK": "Energy", "SO": "Energy", "PLUG": "Energy", "FCEL": "Energy",
    "FCX": "Materials", "NEM": "Materials", "LIN": "Materials",
    "LMT": "Defense", "RTX": "Defense", "NOC": "Defense", "GD": "Defense", "BA": "Industrials",
    "CAT": "Industrials", "DE": "Industrials", "ETN": "Industrials", "GE": "Industrials",
    "HON": "Industrials", "EMR": "Industrials", "ROK": "Industrials", "CMI": "Industrials",
    "TMUS": "Telecom", "T": "Telecom", "VZ": "Telecom", "CMCSA": "Telecom",
    "WMT": "Consumer", "COST": "Consumer", "HD": "Consumer", "TGT": "Consumer",
    "LOW": "Consumer", "NKE": "Consumer", "LULU": "Consumer", "ABNB": "Consumer",
    "DIS": "Consumer", "NFLX": "Consumer", "UBER": "Consumer", "DASH": "Consumer",
    "LYFT": "Consumer", "KO": "Consumer", "PEP": "Consumer", "PG": "Consumer",
    "PM": "Consumer", "MO": "Consumer", "CMG": "Consumer", "SBUX": "Consumer",
    "MCD": "Consumer", "MAR": "Consumer", "BKNG": "Consumer", "EXPE": "Consumer",
    "DECK": "Consumer", "ONON": "Consumer",
    "TSLA": "Auto", "RIVN": "Auto", "LCID": "Auto", "NIO": "Auto", "F": "Auto", "GM": "Auto",
}


def main() -> None:
    eval_data = json.loads(EVAL_PATH.read_text(encoding="utf-8"))
    us_symbols: list[str] = eval_data.get("US", [])
    in_symbols: list[str] = eval_data.get("IN", [])

    entries: list[dict] = []
    for sym in us_symbols:
        entries.append({
            "symbol": sym,
            "name": NAME_MAP.get(sym, sym),
            "market": "US",
            "sector": SECTOR_MAP.get(sym, ""),
        })
    for sym in in_symbols:
        entries.append({
            "symbol": sym,
            "name": NAME_MAP.get(sym, sym),
            "market": "IN",
            "sector": "",
        })

    # Build TS source
    lines = [
        "// AUTO-GENERATED by backend/scripts/generate_stocks_universe.py — do not edit by hand.",
        "// Re-run the script whenever the universe changes.",
        "",
        "export interface StockEntry {",
        "  symbol: string;",
        "  name: string;",
        "  market: \"US\" | \"IN\";",
        "  sector: string;",
        "}",
        "",
        f"// {len(us_symbols)} US + {len(in_symbols)} India = {len(entries)} total",
        "export const STOCKS_UNIVERSE: StockEntry[] = [",
    ]
    for e in entries:
        name_escaped = e["name"].replace("'", "\\'")
        lines.append(
            f"  {{ symbol: \"{e['symbol']}\", name: \"{name_escaped}\","
            f" market: \"{e['market']}\", sector: \"{e['sector']}\" }},"
        )
    lines += [
        "];",
        "",
        "const _bySymbol = new Map<string, StockEntry>(STOCKS_UNIVERSE.map((s) => [s.symbol.toUpperCase(), s]));",
        "",
        "export function lookupStock(symbol: string): StockEntry | undefined {",
        "  return _bySymbol.get(symbol.toUpperCase());",
        "}",
        "",
        "export function searchStocksUniverse(query: string, limit = 8): StockEntry[] {",
        "  if (!query.trim()) return [];",
        "  const q = query.toLowerCase();",
        "  const results: StockEntry[] = [];",
        "  const exact: StockEntry[] = [];",
        "  const startsWith: StockEntry[] = [];",
        "  const contains: StockEntry[] = [];",
        "  for (const s of STOCKS_UNIVERSE) {",
        "    const symLower = s.symbol.toLowerCase();",
        "    const nameLower = s.name.toLowerCase();",
        "    if (symLower === q) { exact.push(s); continue; }",
        "    if (symLower.startsWith(q)) { startsWith.push(s); continue; }",
        "    if (nameLower.startsWith(q) || symLower.includes(q)) { startsWith.push(s); continue; }",
        "    if (nameLower.includes(q)) { contains.push(s); }",
        "  }",
        "  return [...exact, ...startsWith, ...contains].slice(0, limit);",
        "}",
    ]

    OUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✓ Written {OUT_PATH}")
    print(f"  {len(us_symbols)} US + {len(in_symbols)} India = {len(entries)} total stocks")


if __name__ == "__main__":
    main()
