/**
 * TEST FIXTURES ONLY. NOT USER DATA.
 *
 * One made-up positions export per broker, written in the column layout each
 * broker's own download uses, so lib/import/brokers.test.ts can check that we
 * read every format. The account numbers, share counts and costs are invented;
 * no real person's holdings are in this file. Each fixture also carries the
 * lines a real export has around the positions (cash, money market, options,
 * totals, disclaimers), since those are what the parser must leave out.
 */

/** Fidelity, Positions > Download (Portfolio_Positions_Nov-12-2026.csv). Two accounts hold AAPL. */
export const FIDELITY_FIXTURE = `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
Z00000001,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$2310.55,,,,,4.10%,,,Cash,
Z00000001,Individual,AAPL,APPLE INC,40,$227.52,+$1.20,$9100.80,+$48.00,+0.53%,+$2300.80,+33.84%,16.20%,$6800.00,$170.00,Cash,
Z00000001,Individual,NVDA,NVIDIA CORPORATION,25,$145.10,-$2.10,$3627.50,-$52.50,-1.43%,+$627.50,+20.92%,6.45%,$3000.00,$120.00,Margin,
Z00000001,Individual,VOO,VANGUARD S&P 500 ETF,12.5,$540.00,+$2.00,$6750.00,+$25.00,+0.37%,+$1500.00,+28.57%,12.01%,$5250.00,$420.00,Cash,
Z00000001,Individual, -AAPL261218C250,AAPL DEC 18 2026 $250 CALL,1,$4.10,,$410.00,,,,,,$380.00,$3.80,Margin,
Z00000001,Individual,Pending Activity,,,,,-$12.00,,,,,,,,,
Z00000002,ROTH IRA,FDRXX**,FIDELITY GOVERNMENT CASH RESERVES,,,,$500.00,,,,,1.00%,,,Cash,
Z00000002,ROTH IRA,AAPL,APPLE INC,10,$227.52,+$1.20,$2275.20,+$12.00,+0.53%,+$575.20,+33.83%,40.00%,$1700.00,$170.00,Cash,
Z00000002,ROTH IRA,BRK B,BERKSHIRE HATHAWAY INC COM CL B,3,$470.00,,$1410.00,,,,,25.00%,$1200.00,$400.00,Cash,

"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution. The spreadsheet is provided for informational purposes only."

"Date downloaded Nov-12-2026 10:22 a.m ET"
`;

/** Schwab, Positions > Export (Individual-Positions-2026-11-12.csv). Cost Basis is the total. */
export const SCHWAB_FIXTURE = `"Positions for account Individual ...000 as of 10:22 AM ET, 2026/11/12"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Mkt Val (Market Value)","Day Chng % (Day Change %)","Day Chng $ (Day Change $)","Cost Basis","Gain % (Gain/Loss %)","Gain $ (Gain/Loss $)","Ratings","Reinvest Dividends?","Reinvest Capital Gains?","% Of Acct (% of Account)","Security Type"
"MSFT","MICROSOFT CORP","15","$420.00","0.5%","$2.10","$6,300.00","0.5%","$31.50","$4,500.00","40%","$1,800.00","B","No","N/A","35%","Equity"
"SCHD","SCHWAB US DIVIDEND EQUITY ETF","100","$28.00","0.1%","$0.03","$2,800.00","0.1%","$3.00","$2,600.00","7.69%","$200.00","--","Yes","N/A","15%","ETFs & Closed End Funds"
"JPM","JPMORGAN CHASE & CO","20","$240.00","-0.4%","-$0.96","$4,800.00","-0.4%","-$19.20","$3,000.00","60%","$1,800.00","A","No","N/A","27%","Equity"
"TSLA 12/18/2026 300.00 C","CALL TESLA INC $300 EXP 12/18/26","2","$12.00","--","--","$2,400.00","--","--","$2,000.00","20%","$400.00","--","N/A","N/A","13%","Option"
"912797LN5","US TREASURY BILL 0% 01/15/2027","1,000","$99.10","--","--","$991.00","--","--","$985.00","--","--","--","N/A","N/A","5%","Fixed Income"
"Cash & Cash Investments","--","--","--","--","--","$1,250.00","--","--","--","--","--","--","--","--","7%","Cash and Money Market"
"Account Total","--","--","--","--","--","$18,341.00","--","--","$12,085.00","--","--","--","--","--","--","--"
`;

/** Vanguard, Download center > holdings (OfxDownload.csv). The trades section after the blank lines is not read. */
export const VANGUARD_FIXTURE = `Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,
00000001,VANGUARD FEDERAL MONEY MARKET INVESTOR CL,VMFXX,1520.33,1.00,1520.33,
00000001,VANGUARD TOTAL STOCK MARKET ETF,VTI,30,290.00,8700.00,
00000001,COSTCO WHOLESALE CORP,COST,4,920.00,3680.00,



Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,
00000001,2026-11-01,2026-11-04,Buy,Buy,COSTCO WHOLESALE CORP,COST,1,910.00,-910.00,0.00,-910.00,0.00,CASH,
00000001,2026-10-15,2026-10-15,Dividend,Dividend Received,VANGUARD TOTAL STOCK MARKET ETF,VTI,0.0000,1.0,22.10,0.0,22.10,0.0,CASH,
`;

/** Robinhood, Reports > Account activity. Trades, newest first; Description holds the name and CUSIP on two lines. */
export const ROBINHOOD_FIXTURE = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
"11/10/2026","11/10/2026","11/12/2026","AMD","Advanced Micro Devices
CUSIP: 007903107","Sell","5","$150.00","$750.00"
"11/03/2026","11/03/2026","11/04/2026","SOFI","SoFi Technologies
CUSIP: 83406F102","Sell","100","$15.00","$1,500.00"
"10/20/2026","10/20/2026","10/21/2026","","ACH Deposit","ACH","","","$2,000.00"
"10/15/2026","10/15/2026","10/17/2026","PLTR","PLTR 12/18/2026 Call $60.00","BTO","1","$3.20","($320.00)"
"10/02/2026","10/02/2026","10/02/2026","AMD","Cash Div: R/D 2026-09-15 P/D 2026-10-02","CDIV","","","$0.50"
"09/01/2026","09/01/2026","09/03/2026","AMD","Advanced Micro Devices
CUSIP: 007903107","Buy","10","$140.00","($1,400.00)"
"08/01/2026","08/01/2026","08/05/2026","AMD","Advanced Micro Devices
CUSIP: 007903107","Buy","10","$120.00","($1,200.00)"
"07/01/2026","07/01/2026","07/03/2026","SOFI","SoFi Technologies
CUSIP: 83406F102","Buy","100","$9.00","($900.00)"
"06/02/2026","06/02/2026","06/04/2026","HOOD","Robinhood Markets
CUSIP: 770700102","Buy","8.5","$40.00","($340.00)"

"The data provided is for informational purposes only."
`;

/** E*TRADE (Morgan Stanley), Portfolios > Download (PortfolioDownload.csv). Price Paid is per share. */
export const ETRADE_FIXTURE = `Account Summary
Account,Net Account Value,Total Gain $,Total Gain %,Day's Gain Unrealized $,Day's Gain Unrealized %,Available For Withdrawal,Cash Purchasing Power
Individual Brokerage -0001,15820.00,3120.00,24.57,85.00,0.54,1200.00,1200.00

View Summary - All Positions
Symbol,Last Price $,Change $,Change %,Qty #,Price Paid $,Day's Gain $,Total Gain $,Total Gain %,Value $
GOOGL,175.00,1.10,0.63,30,140.00,33.00,1050.00,25.00,5250.00
KO,62.00,-0.20,-0.32,50,55.00,-10.00,350.00,12.73,3100.00
META,580.00,4.00,0.69,10,410.00,40.00,1700.00,41.46,5800.00
CASH,,,,,,,,,1670.00
TOTAL,,,,,,63.00,3100.00,,15820.00

Generated at Nov 12 2026 10:22 AM ET
`;

/** Morgan Stanley Online, Holdings > Export. Unit Cost is per share. */
export const MORGAN_STANLEY_FIXTURE = `"Holdings as of 11/12/2026"
"Symbol","Description","Quantity","Price","Value","Unit Cost","Total Cost","Unrealized Gain/Loss","% of Portfolio"
"PG","PROCTER & GAMBLE CO","25","$165.00","$4,125.00","$150.00","$3,750.00","$375.00","40%"
"UNH","UNITEDHEALTH GROUP INC","6","$520.00","$3,120.00","$560.00","$3,360.00","-$240.00","30%"
"MSBNK","MORGAN STANLEY BANK N.A. DEPOSIT","","","$3,050.00","","","","30%"
"Total","","","","$10,295.00","","$7,110.00","$135.00","100%"
`;

/** Interactive Brokers, Reports > Activity statement (CSV). Only Open Positions Summary lines count; one is in euros. */
export const IBKR_STATEMENT_FIXTURE = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers LLC
Statement,Data,Title,Activity Statement
Statement,Data,Period,"November 12, 2026"
Account Information,Header,Field Name,Field Value
Account Information,Data,Name,Example Account
Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code
Open Positions,Data,Summary,Stocks,USD,AMZN,20,1,150.00,3000.00,205.00,4100.00,1100.00,
Open Positions,Data,Lot,Stocks,USD,AMZN,20,1,150.00,3000.00,205.00,4100.00,1100.00,
Open Positions,Data,Summary,Stocks,USD,TSM,15,1,110.0,1650.0,190.0,2850.0,1200.0,
Open Positions,Data,Summary,Stocks,EUR,ASML,2,1,600.0,1200.0,700.0,1400.0,200.0,
Open Positions,Data,Summary,Equity and Index Options,USD,SPY 19DEC26 600 P,1,100,8.50,850.00,6.00,600.00,-250.00,
Open Positions,Total,,Stocks,USD,,,,,4650,,6950,2300,
Forex Balances,Header,Asset Category,Currency,Description,Quantity,Cost Price,Cost Basis in USD,Close Price,Value in USD,Unrealized P/L in USD,Code
Forex Balances,Data,Forex,USD,USD,2500.00,1,-2500,1,2500,0,
`;

/** Interactive Brokers, Flex Query with an Open Positions section. */
export const IBKR_FLEX_FIXTURE = `"ClientAccountID","CurrencyPrimary","AssetClass","Symbol","Description","Quantity","MarkPrice","PositionValue","CostBasisPrice","CostBasisMoney","LevelOfDetail"
"U0000001","USD","STK","V","VISA INC-CLASS A SHARES","12","310.00","3720.00","250.00","3000.00","SUMMARY"
"U0000001","USD","OPT","V     261218C00350000","V 18DEC26 350 C","1","4.00","400.00","3.00","300.00","SUMMARY"
"U0000001","USD","STK","SHOP","SHOPIFY INC - CLASS A","-10","110.00","-1100.00","100.00","-1000.00","SUMMARY"
`;

/** Webull, Orders > History > Export (Webull_Orders_Records.csv). Orders, newest first. */
export const WEBULL_FIXTURE = `Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time
Palantir Technologies,PLTR,Sell,Filled,10,10,@62.00,62.00,DAY,11/05/2026 10:01:12 EST,11/05/2026 10:01:13 EST
Intel,INTC,Buy,Cancelled,0,50,@20.00,,GTC,11/02/2026 09:45:00 EST,
Palantir Technologies,PLTR,Buy,Filled,30,30,@40.00,40.00,DAY,08/12/2026 11:20:40 EDT,08/12/2026 11:20:41 EDT
SPDR S&P 500 ETF,SPY261218P00550000,Buy,Filled,1,1,@7.00,7.00,DAY,08/01/2026 10:00:00 EDT,08/01/2026 10:00:01 EDT
Ford Motor,F,Buy,Filled,100,100,@11.00,11.00,DAY,07/09/2026 09:31:02 EDT,07/09/2026 09:31:02 EDT
`;

/** M1, Holdings > Download CSV. */
export const M1_FIXTURE = `Ticker,Name,Shares,Avg. Price,Cost Basis,Unrealized Gain,Unrealized Gain %,Value
VTI,Vanguard Total Stock Market ETF,14.2153,250.10,3555.25,567.19,15.95%,4122.44
O,Realty Income Corp,40.5,55.00,2227.50,202.50,9.09%,2430.00
QQQ,Invesco QQQ Trust,3.0002,430.00,1290.09,239.81,18.59%,1529.90
`;

/** A CSV from no broker we name, with headers we cannot place: the person picks the columns. */
export const UNKNOWN_FIXTURE = `My stocks spreadsheet
Stock,Owned,Paid each,Notes
AMZN,12,150,long term
AAPL,5,180.50,
CRM,3,,from work
`;
