import { headingId } from "@/lib/docs/build";
import type { GlossaryTerm } from "@/lib/docs/types";

/** Term, plain definition, and the guide that goes deeper. Kept in A to Z order by the export below. */
const RAW: [term: string, text: string, see?: string][] = [
  ["10-K", "A US company's audited annual report to the SEC: the business, its risks and its full accounts.", "research/filings"],
  ["10-Q", "A US company's unaudited quarterly report to the SEC.", "research/filings"],
  ["13F", "A quarterly SEC filing listing an institutional manager's US-listed long positions at quarter end. Due within 45 days, so it is always at least six weeks old.", "follow/what-a-13f-is"],
  ["8-K", "An SEC filing a company makes when something material happens between regular reports: results, a deal, an executive change.", "research/filings"],
  ["Add zone", "The price at or below which our call says a stock is better bought. Shown as Add below on the stock report, on Pro and on the stocks a Free account follows.", "methodology/calls-and-zones"],
  ["Adjusted close", "A daily closing price restated for splits and dividends, so that a series of them gives a total return.", "methodology/data-sources"],
  ["Agent", "A standing job in stocksbrew: one rule on a schedule, an event or a price, checked at most once per market day, with every check written to a run log. It only tells you. It never trades.", "agents/triggers"],
  ["Analyst target", "The price a brokerage analyst expects a stock to reach, usually within twelve months. We show the range and the average, as other people's opinions.", "start/read-a-stock-report"],
  ["As-of time", "The time a number is from. Every figure in the product has one nearby. It is the time of the data, not the time you loaded the page."],
  ["Backtest", "Fixed rules applied to past prices to see what a portfolio would have done. Nobody held it. Always labelled with its period and caveats.", "strategies/what-a-backtest-tells-you"],
  ["Basis point", "One hundredth of a percent. Ten basis points is 0.10%. Trading costs in our backtests are set in basis points.", "strategies/costs"],
  ["Benchmark", "What a result is compared with. Ours is usually SPY, the S&P 500 fund, bought on the first day and held with dividends reinvested."],
  ["Briefing", "The daily read of what happened to your names, ordered by what needs you.", "start/read-a-briefing"],
  ["CAGR", "Compound annual growth rate: the steady yearly return that turns a starting value into an ending value over a period.", "tools/cagr"],
  ["Call", "Our rule-based read on a stock: add, hold, trim, watch or avoid, with a confidence and price zones.", "methodology/calls-and-zones"],
  ["Cluster buy", "Three or more different insiders making open-market purchases of the same stock within 30 days.", "follow/insiders"],
  ["Consensus estimate", "The average of analysts' forecasts for a company's revenue or earnings in an upcoming report."],
  ["Covered weight", "The share of a disclosed portfolio that we could price. Positions without a price series are dropped and the rest scaled up, and this figure says how much was kept.", "follow/filing-date-performance"],
  ["CUSIP", "A nine-character identifier for a US security. 13F filings list positions by CUSIP, which we map to tickers.", "follow/what-a-13f-is"],
  ["Drawdown", "The fall from the highest value reached so far. Max drawdown is the largest such fall over a record.", "tools/drawdown-recovery"],
  ["EDGAR", "The SEC's public database of company and fund filings. The primary source for filings, 13Fs and Form 4s."],
  ["EPS", "Earnings per share: a company's profit divided by its share count."],
  ["ETF", "Exchange-traded fund: a fund that trades like a stock and usually tracks an index or a sector."],
  ["Filing date", "The day a filing became public. Follow records and Congress signals are measured from this date, never from the trade date.", "follow/filing-date-performance"],
  ["Form 4", "The SEC form an officer, director or 10% owner files within two business days of trading their own company's stock.", "follow/insiders"],
  ["Forward P/E", "Price divided by the earnings analysts expect over the next twelve months, instead of the last twelve."],
  ["Free cash flow", "Cash from operations minus capital spending: the cash a business produces after keeping itself running."],
  ["Free cash flow yield", "Free cash flow divided by market value. A way to compare how much cash a company produces for its price."],
  ["Guidance", "A company's own forecast for coming quarters, usually given with its earnings report."],
  ["Hit rate", "In a backtest, the number of calendar years the strategy beat its comparison.", "strategies/how-the-numbers-are-computed"],
  ["Holding", "A stock you own and have entered with a size. Distinct from a watched name.", "portfolio/adding-holdings"],
  ["Implied volatility", "The size of future price moves that option prices are pricing in. High implied volatility usually means an event is expected."],
  ["Live record", "A strategy's results from the day it was published, valued from baskets frozen at the time. It cannot be revised afterwards.", "strategies/what-a-backtest-tells-you"],
  ["Lookahead", "A backtest error where a decision uses information from after the decision was made.", "strategies/lookahead"],
  ["Market cap", "Share price times shares outstanding: what the market values the whole company at."],
  ["Momentum", "A stock's return over a past window, used as a ranking signal. Often measured over 12 months, skipping the latest month.", "strategies/how-a-strategy-picks"],
  ["Moving average", "The average closing price over the last N sessions. Price above a long moving average is the usual definition of an uptrend."],
  ["Operating margin", "Operating profit as a percent of revenue: what is left after the costs of running the business, before interest and tax."],
  ["P/E ratio", "Share price divided by earnings per share over the last twelve months. What you pay for a dollar of profit."],
  ["Practice account", "A paper account with $100,000 of pretend money, filled at the latest daily close.", "portfolio/practice-account"],
  ["PTR", "Periodic transaction report: the form a member of Congress files to disclose a trade, due within 45 days of it.", "follow/congress"],
  ["Put/call ratio", "The volume of put options traded divided by the volume of calls. A rough gauge of whether options traders are buying protection."],
  ["Rebalance", "Resetting a portfolio to its rules or its target weights on a schedule.", "strategies/how-a-strategy-picks"],
  ["Return on capital", "Operating profit after tax divided by the capital invested in the business. A measure of how well a company turns money into profit."],
  ["RSI", "Relative strength index: a 0 to 100 gauge of recent gains against recent losses, usually over 14 days. Readings above 70 or below 30 are treated as extremes."],
  ["Run log", "The record of every check an agent made, including the days it found nothing.", "agents/run-log"],
  ["Sharpe ratio", "Return per unit of volatility. Ours uses daily returns scaled to a year and a 0% risk-free rate.", "strategies/how-the-numbers-are-computed"],
  ["STOCK Act", "The 2012 US law requiring members of Congress to publicly report their securities trades.", "follow/congress"],
  ["Survivorship bias", "The flattering effect of testing only on companies that still exist, with the failures missing.", "strategies/survivorship-bias"],
  ["Ticker", "The short symbol a security trades under, such as AAPL."],
  ["Total return", "Return including dividends, not only the change in price."],
  ["Trim zone", "The price above which our call suggests a position is better reduced than added to. Shown as Trim above.", "methodology/calls-and-zones"],
  ["Turnover", "How much of a portfolio is replaced at a rebalance or over a year. Higher turnover means higher costs.", "strategies/costs"],
  ["Unusual mover", "A stock whose day change is large against its own recent behaviour and the market.", "research/signals"],
  ["VIX", "The Cboe index of implied volatility on the S&P 500 over the next 30 days. Often called the fear gauge."],
  ["Volatility", "How much returns vary. Ours is the standard deviation of daily returns scaled to a year.", "strategies/how-the-numbers-are-computed"],
  ["Watching", "A stock you follow without owning. It appears in your briefing and is left out of analytics.", "portfolio/adding-holdings"],
  ["Yield curve", "Treasury yields plotted from short maturities to long ones. When short yields are above long ones the curve is called inverted.", "research/markets"],
];

function sortKey(term: string): string {
  // Numbers first, then letters, ignoring case.
  return term.toLowerCase();
}

export const GLOSSARY: GlossaryTerm[] = RAW.map(([term, text, see]) => ({ term, text, see, id: headingId(term) })).sort((a, b) =>
  sortKey(a.term).localeCompare(sortKey(b.term), "en", { numeric: true }),
);

/** "#" for terms that start with a digit, otherwise the first letter. */
export function glossaryLetter(term: string): string {
  const first = term.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}
