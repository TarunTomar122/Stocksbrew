import { FREE_COVERED_STOCKS } from "@/lib/entitlements";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";

export type ComparisonRow = {
  dimension: string;
  stocksbrew: string;
  competitor: string;
};

export type ComparisonPage = {
  slug: string;
  competitorName: string;
  title: string;
  description: string;
  verdict: string;
  /** One honest thing stocksbrew does worse for this reader, said in the first paragraph. */
  ourDrawback: string;
  competitorUrl: string;
  competitorPricingUrl?: string;
  stocksbrewBestFor: string;
  competitorBestFor: string;
  bothScenario: string;
  rows: ComparisonRow[];
  stocksbrewStrengths: string[];
  competitorStrengths: string[];
  workflow: { title: string; body: string }[];
  faqs: { question: string; answer: string }[];
};

/**
 * The other product's prices, read off its own pricing page. `checked` is the
 * day we read it, or null when the page could not be read (blocked, rendered
 * only in a browser, or no prices published): then the page says so and quotes
 * no number. Recheck by opening `source` and update the day.
 */
export type PriceCheck = {
  /** The page the prices were read from. */
  source: string;
  /** YYYY-MM-DD, or null for "not checked". */
  checked: string | null;
  /** The prices as a sentence, with the competitor's name. Empty when not checked. */
  text: string;
  /** When not checked: what we found instead, as a sentence (replaces "we could not read"). */
  note?: string;
};

const CHECKED_ON = "2026-11-11";

export const PRICE_CHECKS: Record<string, PriceCheck> = {
  "stocksbrew-vs-tickertape": {
    source: "https://www.tickertape.in/pricing",
    checked: CHECKED_ON,
    text: "Tickertape has a free plan, and Pro costs ₹399 for a month, ₹899 for three months or ₹2,999 for a year (Indian rupees)",
  },
  "stocksbrew-vs-seeking-alpha": { source: "https://seekingalpha.com/premium", checked: null, text: "" },
  "stocksbrew-vs-tradingview": {
    source: "https://www.tradingview.com/pricing/",
    checked: CHECKED_ON,
    text: "TradingView has a free Basic plan, and paid plans run from $14.95 a month (Essential) to $239.95 a month (Ultimate), less per month when billed yearly",
  },
  "stocksbrew-vs-yahoo-finance": {
    source: "https://finance.yahoo.com/about/plans/select-plan/introduction",
    checked: CHECKED_ON,
    text: "Yahoo Finance is free to use, and its paid plans billed yearly are Bronze at $95.40, Silver at $239.40 and Gold at $479.40 a year",
  },
  // prospero.ai/pricing answered 404 on 2026-11-11 and the site published no prices.
  "stocksbrew-vs-prospero": {
    source: "https://www.prospero.ai",
    checked: null,
    text: "",
    note: "Prospero's site listed no prices when we looked on November 11, 2026, so this page quotes none",
  },
  "stocksbrew-vs-morningstar": { source: "https://www.morningstar.com/products/investor", checked: null, text: "" },
  "stocksbrew-vs-finviz": {
    source: "https://finviz.com/elite",
    checked: CHECKED_ON,
    text: "Finviz is free with delayed data, and Elite costs $39.50 a month or $299.50 a year",
  },
  "stocksbrew-vs-zacks": {
    source: "https://www.zacks.com/premium",
    checked: CHECKED_ON,
    text: "Zacks Premium costs $249 a year after a 30-day free trial",
  },
  "stocksbrew-vs-motley-fool": {
    source: "https://www.fool.com/services/stock-advisor/",
    checked: CHECKED_ON,
    text: "Motley Fool Stock Advisor lists at $199 a year, with a lower price for a new member's first year",
  },
  "stocksbrew-vs-tipranks": {
    source: "https://www.tipranks.com/plans",
    checked: CHECKED_ON,
    text: "TipRanks showed Premium at $30 a month and Ultimate at $50 a month as a 75% off offer on yearly plans, without saying what a renewal costs",
  },
  "stocksbrew-vs-stockanalysis": {
    source: "https://stockanalysis.com/pro/",
    checked: CHECKED_ON,
    text: "StockAnalysis is free to use, and Pro costs $9.99 a month or $79 a year",
  },
  "stocksbrew-vs-danelfin": { source: "https://danelfin.com/pricing", checked: null, text: "" },
};

function fmtCheckDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[(month ?? 1) - 1]} ${date}, ${year}`;
}

/** The other product's prices in one sentence, or an honest "we could not read them". */
export function competitorPriceSentence(slug: string, competitorName: string): string {
  const check = PRICE_CHECKS[slug];
  if (!check || !check.checked || !check.text) {
    return check?.note ?? `We could not read ${competitorName}'s current prices from its own site, so this page quotes none: check its pricing page`;
  }
  return `${check.text}, per its pricing page on ${fmtCheckDay(check.checked)}`;
}

/**
 * What these pages say about stocksbrew, kept in one place so every page says
 * the same thing and the numbers come from the files the product enforces
 * (lib/entitlements.ts, lib/pricing.ts). Statements about the other product
 * are desk research from its official pages and carry no prices unless the
 * page was rechecked (see COMPARISON_RECHECKED in lib/docs/compare.ts).
 */
const FREE_TIER = `Every stock report and call is free to read. Free covers ${FREE_COVERED_STOCKS} stocks in full`;
const PRO_PRICE = `$${US_PRO_MONTHLY} a month or $${US_PRO_YEARLY} a year`;
const PRICE_ROW = `${FREE_TIER}. Pro is ${PRO_PRICE}`;

/** The call in the words a reader sees on the stock page. */
const CALL_WORDS = `${CALL_PLAIN.Add}, ${CALL_PLAIN.Hold} or ${CALL_PLAIN.Trim}`;
const CALL = `A ${CALL_WORDS} call on each stock we cover, with the reason and the date`;
const BRIEFING = "A daily briefing in the app about the stocks you follow: what moved, the reason when we confirmed one, and what is coming up";
const ALERTS = "Email alerts on a price level, a zone or a changed call (Pro)";
const FOLLOW = "13F funds, House trade disclosures and Form 4 insiders as pages with a record measured from the filing date";
const SCREENER = "A screener over the several hundred US stocks we cover, not the whole market";
const NO_ADS = "No ads";

const S_CALL = "A call on each covered stock with its reason and date, free to read";
const S_BRIEFING = "A daily briefing about your own stocks, ordered by what needs you";
const S_NO_REASON = "Gives a reason for a price move only when a dated source backs it";
const S_FOLLOW = "Fund, Congress and insider filings measured from the day they became public";
const S_BACKTEST = "Backtests labelled as backtests, with their caveats on the same page";
const S_ALERTS = "Email alerts on price levels, zones and changed calls (Pro)";

const MORNING = {
  title: "Each market day: read the briefing",
  body: "Open the briefing. It lists what needs you first, then smaller updates, then what is coming up, then the names where nothing happened.",
};
const COST_ANSWER = (slug: string, other: string) =>
  `stocksbrew is free to read, Free covers ${FREE_COVERED_STOCKS} stocks in full, and Pro is ${PRO_PRICE}. ${competitorPriceSentence(slug, other)}.`;
/** The "Price" row's other column: the checked sentence, or a pointer to the vendor's page. */
const PRICE_CELL = (slug: string, other: string) => `${competitorPriceSentence(slug, other)}.`;

/**
 * The first paragraph of a comparison: who each product is for, what each
 * costs and one thing stocksbrew does worse, so the answer comes before the table.
 */
export function comparisonAnswer(page: ComparisonPage): { who: string; cost: string } {
  return {
    who: page.verdict,
    cost: `stocksbrew is free to read, and Pro is ${PRO_PRICE}. ${competitorPriceSentence(page.slug, page.competitorName)}. Where stocksbrew falls short: ${page.ourDrawback}`,
  };
}

export const COMPARISON_PAGES: ComparisonPage[] = [
  {
    slug: "stocksbrew-vs-tickertape",
    competitorName: "Tickertape",
    title: "stocksbrew vs Tickertape",
    description: "Tickertape is built for Indian markets. stocksbrew covers US stocks: a call on each one, a daily briefing and filings you can follow.",
    verdict:
      "Tickertape is built for Indian retail investors: screeners and NSE and BSE data. stocksbrew covers US-listed stocks: a call on each one, a daily briefing on the names you follow, and public filings turned into pages.",
    ourDrawback: "it has no Indian stocks at all, so it cannot replace Tickertape for NSE and BSE names.",
    competitorUrl: "https://www.tickertape.in",
    competitorPricingUrl: "https://www.tickertape.in/pricing",
    stocksbrewBestFor: "You hold US stocks and want one daily read of what changed for them.",
    competitorBestFor: "You invest mainly in Indian equities and want screeners and data for NSE and BSE names.",
    bothScenario: "Use Tickertape for Indian stocks and stocksbrew for US ones. The two do not overlap much.",
    rows: [
      { dimension: "Primary market", stocksbrew: "US-listed stocks", competitor: "India (NSE and BSE)" },
      { dimension: "Core output", stocksbrew: CALL, competitor: "Screens, scores and market data" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "Stock pages and screeners you open yourself" },
      { dimension: "Alerts", stocksbrew: ALERTS, competitor: "See its site" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-tickertape", "Tickertape") },
    ],
    stocksbrewStrengths: [S_CALL, S_BRIEFING, S_FOLLOW, S_ALERTS],
    competitorStrengths: ["Screeners and stock scores for Indian markets", "Coverage of NSE and BSE names, which stocksbrew does not have", "Built for Indian retail investors"],
    workflow: [
      { title: "Day one: add what you own", body: `Add your US holdings and watched names to Portfolio. Free covers ${FREE_COVERED_STOCKS} stocks in full. Each one gets a call and price zones.` },
      MORNING,
      { title: "When you have a new idea", body: "Open its stock report, read the call and the reason, and check the calendar for its next earnings date." },
    ],
    faqs: [
      { question: "Is stocksbrew a Tickertape alternative?", answer: "Only for US stocks. Tickertape covers Indian markets, which stocksbrew does not." },
      { question: "Does stocksbrew cover Indian stocks?", answer: "No. The docs and the product cover US-listed stocks and funds." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-tickertape", "Tickertape") },
    ],
  },
  {
    slug: "stocksbrew-vs-seeking-alpha",
    competitorName: "Seeking Alpha",
    title: "stocksbrew vs Seeking Alpha",
    description: "Seeking Alpha is a library of contributor analysis with Quant ratings. stocksbrew is a daily briefing and a rule-based call on the stocks you follow.",
    verdict:
      "Seeking Alpha is a large library of contributor analysis, transcripts and Quant ratings that you read. stocksbrew is a short daily briefing on your own stocks plus a rule-based call on each one. One is depth on a single stock. The other is a check on what changed.",
    ourDrawback: "it has no earnings call transcripts, no contributor analysis and no dividend grades.",
    competitorUrl: "https://seekingalpha.com",
    competitorPricingUrl: "https://seekingalpha.com/premium",
    stocksbrewBestFor: "You want one place that tells you what changed for the stocks you follow, with the source and the time.",
    competitorBestFor: "You want long written analysis, earnings call transcripts, factor grades and Quant, author and sell-side ratings on a specific stock.",
    bothScenario: "Read the stocksbrew briefing to see what changed. When a stock needs a decision, read the longer analysis on Seeking Alpha.",
    rows: [
      { dimension: "Research approach", stocksbrew: "Rule-based calls and model-written reads built from dated sources", competitor: "Contributor analysis plus Quant and sell-side ratings" },
      { dimension: "Daily output", stocksbrew: BRIEFING, competitor: "A news feed and new articles to read" },
      { dimension: "Dividend analysis", stocksbrew: "Dividend yield, payout and growth as screener fields. No dividend grades", competitor: "Dividend grades and history" },
      { dimension: "Filings", stocksbrew: FOLLOW, competitor: "See its site" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-seeking-alpha", "Seeking Alpha") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["Long written analysis with more than one point of view", "Earnings call transcripts", "Quant ratings and factor grades", "Dividend grades and payout history"],
    workflow: [
      MORNING,
      { title: "When something needs a decision", body: "Open the stock report for the call, the reason and the sources. For a second, longer opinion, read what Seeking Alpha contributors have written." },
      { title: "End of the week", body: "Check which calls changed during the week and whether any stock you follow reports earnings next week." },
    ],
    faqs: [
      { question: "What is the difference between stocksbrew and Seeking Alpha?", answer: "Seeking Alpha is a library of analysis and ratings. stocksbrew is a daily briefing and a rule-based call for the stocks you follow. They do different jobs." },
      { question: "Can stocksbrew replace Seeking Alpha?", answer: "Not for long written analysis, transcripts or dividend grades. It can replace opening several tabs each morning to see what changed." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-seeking-alpha", "Seeking Alpha") },
    ],
  },
  {
    slug: "stocksbrew-vs-tradingview",
    competitorName: "TradingView",
    title: "stocksbrew vs TradingView",
    description: "TradingView is a charting, screening and alerting workspace. stocksbrew is a daily briefing and a written call on the stocks you follow.",
    verdict:
      "TradingView is a charting, screening, alerting and trading workspace across asset classes. stocksbrew does not try to replace that. It gives a written call and a daily briefing for a list of US stocks. They fit different stages of the work.",
    ourDrawback: "it has one simple price chart per stock, with no indicators, drawings or scripts.",
    competitorUrl: "https://www.tradingview.com",
    competitorPricingUrl: "https://www.tradingview.com/pricing/",
    stocksbrewBestFor: "You want to know what changed for your stocks without watching charts.",
    competitorBestFor: "You work in charts: indicators, drawings, several timeframes and Pine scripts.",
    bothScenario: "Read the stocksbrew briefing first. Open TradingView when a stock needs chart work.",
    rows: [
      { dimension: "Core function", stocksbrew: "A daily briefing and a written call per stock", competitor: "Charting and technical analysis" },
      { dimension: "Charting", stocksbrew: "A price chart on each stock report. No drawing tools or custom indicators", competitor: "Multi-timeframe charts, drawings, indicators and Pine" },
      { dimension: "Alerts", stocksbrew: ALERTS, competitor: "Price, technical, drawing and Pine-based alerts" },
      { dimension: "Screening", stocksbrew: SCREENER, competitor: "A screener with technical and fundamental filters" },
      { dimension: "Brokerage", stocksbrew: "None. stocksbrew cannot place a trade", competitor: "Chart trading through broker connections" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-tradingview", "TradingView") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["Charting with a large indicator library", "Pine scripts and community scripts", "Covers stocks, crypto, currencies and futures", "A screener with technical filters"],
    workflow: [
      MORNING,
      { title: "When a stock needs chart work", body: "Open it in TradingView for trendlines, indicators and levels. stocksbrew's zones come from support, options data and analyst targets, not from drawings." },
      { title: "Weekly: look for new names", body: "Screen in either product. Add the names you want to keep reading about to your stocksbrew portfolio." },
    ],
    faqs: [
      { question: "Can stocksbrew replace TradingView?", answer: "No. stocksbrew is not a charting tool. It shows a price chart on each stock report and nothing more." },
      { question: "Does stocksbrew have charts?", answer: "Each stock report has a price chart, and backtests and records have their own. There are no drawing tools, custom indicators or scripts." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-tradingview", "TradingView") },
    ],
  },
  {
    slug: "stocksbrew-vs-yahoo-finance",
    competitorName: "Yahoo Finance",
    title: "stocksbrew vs Yahoo Finance",
    description: "Yahoo Finance is a free portal for quotes, statements and news. stocksbrew reads the market for the stocks you follow and reports what changed.",
    verdict:
      "Yahoo Finance is a free financial portal you navigate yourself: quotes, statements, news per ticker. stocksbrew reads for you and reports back in one daily briefing, with a call on each stock. Some of stocksbrew's own price data comes from Yahoo Finance.",
    ourDrawback: "it covers several hundred US stocks, not the whole market, and shows the main figures rather than years of full statements.",
    competitorUrl: "https://finance.yahoo.com",
    stocksbrewBestFor: "You want one daily read of what changed for your stocks, with the reason when there is a confirmed one.",
    competitorBestFor: "You want quick lookups, long financial statement history and a familiar free portfolio tracker.",
    bothScenario: "Use the stocksbrew briefing to see what changed and Yahoo Finance when you need to look up a specific number.",
    rows: [
      { dimension: "Approach", stocksbrew: "Reports to you: a briefing ordered by what needs you", competitor: "A portal: you go and look" },
      { dimension: "News", stocksbrew: "A wire of publisher headlines tagged to tickers on a strict match", competitor: "Broad coverage with per-ticker feeds" },
      { dimension: "Financial data", stocksbrew: "Key figures, margins, cash and debt on the stock report", competitor: "Full statements and ratios" },
      { dimension: "Alerts", stocksbrew: ALERTS, competitor: "See its site" },
      { dimension: "Ads", stocksbrew: NO_ADS, competitor: "Ad-supported" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-yahoo-finance", "Yahoo Finance") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW, NO_ADS],
    competitorStrengths: ["Broad free financial data and statement history", "Portfolio tracking with news per holding", "Familiar to almost everyone", "Covers far more tickers than stocksbrew does"],
    workflow: [
      MORNING,
      { title: "When you need a number", body: "The stock report has the main figures with their source and date. For full statements going back years, Yahoo Finance has more." },
      { title: "On Pro: set alerts", body: "Set an email alert on a price level so you do not need to check a quote page." },
    ],
    faqs: [
      { question: "Can stocksbrew replace Yahoo Finance?", answer: "For the morning check on your own stocks, yes. For full financial statements, a wide ticker universe and quick quotes, no." },
      { question: "Is stocksbrew free like Yahoo Finance?", answer: `Reading is free: stock reports, calls, the wire, the calendar, filings. Free covers ${FREE_COVERED_STOCKS} stocks in full. Pro is ${PRO_PRICE}. There are no ads on either plan.` },
      { question: "Which has better financial data?", answer: "Yahoo Finance has more of it. stocksbrew shows the main figures and says where each came from." },
    ],
  },
  {
    slug: "stocksbrew-vs-prospero",
    competitorName: "Prospero",
    title: "stocksbrew vs Prospero",
    description: "Prospero publishes model-driven signals on stocks. stocksbrew gives a rule-based call and a daily briefing on the stocks you follow, and does not forecast.",
    verdict:
      "Prospero publishes model-driven signals meant to point at stocks. stocksbrew does not forecast. It gives a rule-based call with its reason, and a daily briefing on the stocks you already follow.",
    ourDrawback: "it does less to help you find new ideas, and it publishes no track record for its calls.",
    competitorUrl: "https://www.prospero.ai",
    stocksbrewBestFor: "You already know which stocks you follow and want to know what changed for them.",
    competitorBestFor: "You want model-driven signals to help find stocks.",
    bothScenario: "Find ideas wherever you like. Add the ones you want to keep reading about to your stocksbrew portfolio.",
    rows: [
      { dimension: "Aim", stocksbrew: "Explain what changed. No forecasts", competitor: "Signals meant to point at stocks" },
      { dimension: "Daily output", stocksbrew: BRIEFING, competitor: "See its site" },
      { dimension: "Track record", stocksbrew: "No win rate is published for calls, because we have not measured one we would stand behind", competitor: "See its site" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-prospero", "Prospero") },
    ],
    stocksbrewStrengths: [S_CALL, S_BRIEFING, S_NO_REASON, S_BACKTEST],
    competitorStrengths: ["Built around signals for finding stocks", "Aimed at discovery, which stocksbrew does less of"],
    workflow: [
      { title: "Find an idea", body: "Use any discovery tool, or stocksbrew's own screener and themes." },
      { title: "Follow it", body: `Add it to Portfolio. Free covers ${FREE_COVERED_STOCKS} stocks in full.` },
      MORNING,
    ],
    faqs: [
      { question: "What is the difference between stocksbrew and Prospero?", answer: "Prospero publishes signals. stocksbrew publishes a rule-based call with its reason and a daily briefing, and does not forecast prices." },
      { question: "Does stocksbrew predict which stocks will go up?", answer: "No. A call describes the evidence today. It is not a forecast, and no win rate is published for it." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-prospero", "Prospero") },
    ],
  },
  {
    slug: "stocksbrew-vs-morningstar",
    competitorName: "Morningstar",
    title: "stocksbrew vs Morningstar",
    description: "Morningstar publishes analyst research with fair value estimates and moat ratings. stocksbrew is a daily briefing and a rule-based call on the stocks you follow.",
    verdict:
      "Morningstar publishes analyst research: fair value estimates, moat ratings and fund data. stocksbrew has no analysts. It gives a rule-based call on each stock it covers and a daily briefing on the ones you follow. For long-term fundamental research on a company, Morningstar goes deeper.",
    ourDrawback: "it has no analysts, no fair value estimates, no moat ratings and no fund research.",
    competitorUrl: "https://www.morningstar.com",
    competitorPricingUrl: "https://www.morningstar.com/products/investor",
    stocksbrewBestFor: "You want a daily check on what changed for the stocks you follow.",
    competitorBestFor: "You want analyst research with fair value estimates and moat ratings, and fund analysis.",
    bothScenario: "Use the stocksbrew briefing day to day. Read Morningstar's analyst report when you are deciding on a position.",
    rows: [
      { dimension: "Research type", stocksbrew: "Rule-based calls and model-written reads from dated sources", competitor: "Analyst research" },
      { dimension: "Coverage", stocksbrew: "Several hundred US-listed stocks", competitor: "Stocks and funds. See its site for the list" },
      { dimension: "Fair value", stocksbrew: "None. The report shows multiples and P/E against the stock's own history", competitor: "Analyst fair value estimates" },
      { dimension: "Moat ratings", stocksbrew: "None", competitor: "Wide, narrow or none" },
      { dimension: "Portfolio analysis", stocksbrew: "Allocation, concentration and performance against the S&P 500", competitor: "See its site" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-morningstar", "Morningstar") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_FOLLOW, S_ALERTS],
    competitorStrengths: ["Analyst research with a published method", "Fair value estimates", "Moat ratings", "Fund and ETF analysis"],
    workflow: [
      MORNING,
      { title: "When a stock needs a decision", body: "Read the stock report for the call and its reason. Read Morningstar's analyst report for a fair value view." },
      { title: "Now and then: look at the whole portfolio", body: "Portfolio analytics shows allocation, concentration and how your holdings did against the S&P 500." },
    ],
    faqs: [
      { question: "Is stocksbrew a replacement for Morningstar?", answer: "No. Morningstar publishes analyst research. stocksbrew publishes rule-based calls and a daily briefing. They answer different questions." },
      { question: "Does stocksbrew have fair value estimates?", answer: "No. It shows valuation multiples and where today's P/E sits against the stock's own history." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-morningstar", "Morningstar") },
    ],
  },
  {
    slug: "stocksbrew-vs-finviz",
    competitorName: "Finviz",
    title: "stocksbrew vs Finviz",
    description: "Finviz is a stock screener with market maps. stocksbrew is a daily briefing and a written call on the stocks you follow. How to pick.",
    verdict:
      "Finviz is designed for screening US stocks and scanning dense market maps. stocksbrew is designed to follow a list of stocks with written calls, earnings, news and alerts. Use Finviz to narrow the market. Use stocksbrew once a name becomes a serious candidate or a holding.",
    ourDrawback: "it screens only the several hundred stocks it covers, not the whole US market, and has no real-time data.",
    competitorUrl: "https://finviz.com",
    competitorPricingUrl: "https://finviz.com/elite",
    stocksbrewBestFor: "You already know what you own and want to be told what changed.",
    competitorBestFor: "You want to screen the whole US market with technical and fundamental filters and see sectors on a map.",
    bothScenario: "Screen on Finviz to find candidates. Add the serious ones to your stocksbrew portfolio.",
    rows: [
      { dimension: "Core function", stocksbrew: "A daily briefing and a written call per stock", competitor: "Stock screener and market maps" },
      { dimension: "Screening", stocksbrew: SCREENER, competitor: "Broad fundamental and technical filters. Advanced custom filters on Elite" },
      { dimension: "Heat maps", stocksbrew: "A sector map inside the screener", competitor: "S&P 500 and market heat maps" },
      { dimension: "Alerts", stocksbrew: ALERTS, competitor: "Elite price, news, ratings, insider, filing, portfolio and screener alerts" },
      { dimension: "Written context", stocksbrew: CALL, competitor: "Market data and alerts, not a written call" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-finviz", "Finviz") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW, "Lower price for the narrower job"],
    competitorStrengths: ["Screens the whole US market, which stocksbrew does not", "Dense market maps", "Real-time data on Elite", "No account needed for basic screening"],
    workflow: [
      { title: "Screen on Finviz", body: "Filter the market down to a shortlist." },
      { title: "Follow the shortlist", body: `Add the names to your stocksbrew portfolio. Free tracks as many as you like and covers ${FREE_COVERED_STOCKS} in full, Pro covers all of them. Each gets a call.` },
      MORNING,
    ],
    faqs: [
      { question: "Is stocksbrew a Finviz alternative?", answer: "Not for screening the whole market. Finviz finds stocks. stocksbrew follows the ones you chose." },
      { question: "Which is better for screening?", answer: "Finviz. stocksbrew's screener only covers the several hundred stocks we keep data for." },
      { question: "How much does each cost?", answer: `${COST_ANSWER("stocksbrew-vs-finviz", "Finviz")} They charge for different jobs.` },
    ],
  },
  {
    slug: "stocksbrew-vs-zacks",
    competitorName: "Zacks",
    title: "stocksbrew vs Zacks",
    description: "Zacks ranks stocks on earnings estimate revisions. stocksbrew gives a rule-based call from several kinds of evidence and a daily briefing.",
    verdict:
      "Zacks is known for the Zacks Rank, a 1 to 5 rank built on earnings estimate revisions. stocksbrew's call uses several inputs (news, setup, options activity, the market) and comes with a written reason. Zacks gives one number per stock. stocksbrew gives a call and what changed.",
    ourDrawback: "it does not track earnings estimate revisions, and it publishes no win rate for its calls.",
    competitorUrl: "https://www.zacks.com",
    competitorPricingUrl: "https://www.zacks.com/premium",
    stocksbrewBestFor: "You want a daily read on your own stocks with the reason behind each call.",
    competitorBestFor: "You want a simple rank driven by earnings estimate revisions.",
    bothScenario: "Use the Zacks Rank as one input. Read the stocksbrew report for what else changed.",
    rows: [
      { dimension: "Signal", stocksbrew: "A fixed scoring rule over news, setup, options activity and the market", competitor: "Earnings estimate revisions" },
      { dimension: "Output", stocksbrew: CALL, competitor: "A 1 to 5 rank" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "Market commentary" },
      { dimension: "Earnings", stocksbrew: "Dates, estimates and a pre-earnings read on the stocks you follow", competitor: "Estimate tracking" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-zacks", "Zacks") },
    ],
    stocksbrewStrengths: [S_CALL, S_BRIEFING, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["A simple rank anyone can read", "Earnings estimate and consensus data", "A long history as a ranking system"],
    workflow: [
      MORNING,
      { title: "Cross-check with the rank", body: "If you use the Zacks Rank, compare it with the stocksbrew call. Where they disagree, read the reasons." },
      { title: "Before earnings", body: "The calendar shows the date and estimates for every stock. The pre-earnings read is shown for the stocks you follow." },
    ],
    faqs: [
      { question: "What is the difference between stocksbrew and Zacks?", answer: "Zacks ranks stocks on estimate revisions. stocksbrew scores several kinds of evidence with a fixed rule and shows the reason." },
      { question: "Can stocksbrew replace Zacks?", answer: "Not if the Zacks Rank is your main signal. stocksbrew does not rank on estimate revisions." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-zacks", "Zacks") },
    ],
  },
  {
    slug: "stocksbrew-vs-motley-fool",
    competitorName: "Motley Fool",
    title: "stocksbrew vs Motley Fool",
    description: "Motley Fool sells stock picks for long-term holding. stocksbrew does not pick stocks for you. It follows the ones you chose.",
    verdict:
      "Motley Fool's paid services recommend stocks to buy and hold. stocksbrew does not recommend stocks for your situation. It gives a rule-based call on each stock it covers and a daily briefing on the ones you follow. One gives you picks. The other tells you what changed.",
    ourDrawback: "it does not hand you a list of stocks to buy, and it has no member community.",
    competitorUrl: "https://www.fool.com",
    competitorPricingUrl: "https://www.fool.com/services/stock-advisor/",
    stocksbrewBestFor: "You already have a portfolio and want to know what changed for it.",
    competitorBestFor: "You want analysts to recommend stocks for long-term holding.",
    bothScenario: "Take ideas from Motley Fool. Add the ones you buy to your stocksbrew portfolio.",
    rows: [
      { dimension: "Core service", stocksbrew: "A daily briefing and a call on the stocks you follow", competitor: "Stock recommendations" },
      { dimension: "Who chooses", stocksbrew: "You choose what to follow", competitor: "Analysts choose" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "Articles and commentary" },
      { dimension: "Community", stocksbrew: "None", competitor: "Member community" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-motley-fool", "Motley Fool") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["Stock recommendations with a written thesis", "A buy-and-hold approach that is simple to follow", "A member community", "Educational writing"],
    workflow: [
      { title: "Read the recommendation", body: "Read the thesis and decide whether it fits your portfolio." },
      { title: "Add what you buy", body: "Add it to your stocksbrew portfolio as a holding, with shares and cost." },
      MORNING,
    ],
    faqs: [
      { question: "Is stocksbrew a Motley Fool alternative?", answer: "Not for stock picks. stocksbrew follows the stocks you chose and tells you what changed." },
      { question: "Does stocksbrew pick stocks?", answer: `It publishes a ${CALL_WORDS} call on each stock it covers, from a fixed rule. It is not advice for your situation and no win rate is published for it.` },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-motley-fool", "Motley Fool") },
    ],
  },
  {
    slug: "stocksbrew-vs-tipranks",
    competitorName: "TipRanks",
    title: "stocksbrew vs TipRanks",
    description: "TipRanks tracks analysts, insiders and hedge funds. stocksbrew follows your stocks day to day and turns fund, Congress and insider filings into pages.",
    verdict:
      "TipRanks is built around what analysts, insiders and hedge funds are doing, with analysts ranked by their record. stocksbrew covers some of the same filings (13F funds, Form 4 insiders, House disclosures) and adds a daily briefing and a call on your own stocks. TipRanks goes deeper on analysts.",
    ourDrawback: "it does not rank analysts by their record, and it follows a fixed list of funds rather than every hedge fund.",
    competitorUrl: "https://www.tipranks.com",
    competitorPricingUrl: "https://www.tipranks.com/plans",
    stocksbrewBestFor: "You want a daily read on your stocks, and filing records measured from the day they became public.",
    competitorBestFor: "You want ranked analysts, detailed insider data and hedge fund tracking.",
    bothScenario: "Use the stocksbrew briefing day to day. Use TipRanks when you want to know which analysts cover a stock and how they have done.",
    rows: [
      { dimension: "Focus", stocksbrew: "Your stocks, day to day", competitor: "Analysts, insiders and hedge funds" },
      { dimension: "Analysts", stocksbrew: "Price targets and ratings by month on the stock report. Analysts are not ranked", competitor: "Analysts ranked by their record" },
      { dimension: "Insiders", stocksbrew: "Form 4 open-market buys and sells over recent weeks, with cluster buys flagged", competitor: "Insider transaction tracking" },
      { dimension: "Funds", stocksbrew: "A fixed list of 13F funds, each with a record from the filing date", competitor: "Hedge fund portfolio tracking" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "Rating changes and transaction feeds" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-tipranks", "TipRanks") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_FOLLOW, "House trade disclosures alongside funds and insiders"],
    competitorStrengths: ["Analysts ranked by their record", "Deeper insider data", "Wider hedge fund coverage than stocksbrew's fixed list", "A combined score per stock"],
    workflow: [
      MORNING,
      { title: "Check who is trading it", body: "The stock report lists which followed funds hold the stock and any disclosed insider and House trades, with trade and filing dates side by side." },
      { title: "For the analyst view", body: "The stock report shows the range of targets. For who the analysts are and how they have done, use TipRanks." },
    ],
    faqs: [
      { question: "What does TipRanks do that stocksbrew does not?", answer: "It ranks analysts by their record and goes deeper on insider and hedge fund data. stocksbrew reads a fixed list of funds." },
      { question: "Can stocksbrew replace TipRanks?", answer: "Not for analyst rankings. For following a list of stocks day to day, it does a different job." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-tipranks", "TipRanks") },
    ],
  },
  {
    slug: "stocksbrew-vs-stockanalysis",
    competitorName: "StockAnalysis",
    title: "stocksbrew vs StockAnalysis",
    description: "StockAnalysis is a fast financial data site with a screener. stocksbrew reads for the stocks you follow and reports what changed.",
    verdict:
      "StockAnalysis is a clean financial data site: statements, estimates, a screener and news. stocksbrew does not compete on raw data. It gives a call on each stock it covers and a daily briefing on the ones you follow. StockAnalysis gives you data to analyse. stocksbrew tells you what changed.",
    ourDrawback: "it has far less raw financial data, with no full income statements, balance sheets or cash flows going back years.",
    competitorUrl: "https://stockanalysis.com",
    competitorPricingUrl: "https://stockanalysis.com/pro/",
    stocksbrewBestFor: "You want to be told what changed for your stocks, with a call and its reason.",
    competitorBestFor: "You want fast access to financial statements, analyst estimates and a screener.",
    bothScenario: "Use StockAnalysis for statements and screening. Use stocksbrew for the daily read on what you follow.",
    rows: [
      { dimension: "Approach", stocksbrew: "Reports what changed for your stocks", competitor: "Financial data you analyse yourself" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "None. You look things up" },
      { dimension: "Financial data", stocksbrew: "Key figures, margins, cash and debt on the stock report", competitor: "Income statement, balance sheet, cash flow and ratios" },
      { dimension: "Screening", stocksbrew: SCREENER, competitor: "Fundamental and technical filters over a wider universe" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-stockanalysis", "StockAnalysis") },
    ],
    stocksbrewStrengths: [S_BRIEFING, S_CALL, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["Fast, clean financial data", "Full statements and ratios", "A screener over a wider universe", "Analyst estimates"],
    workflow: [
      MORNING,
      { title: "When you need the statements", body: "Open StockAnalysis for the full income statement, balance sheet and cash flow." },
      { title: "Look for new names", body: "Screen in either product. Add the serious ones to your stocksbrew portfolio." },
    ],
    faqs: [
      { question: "Is stocksbrew a StockAnalysis alternative?", answer: "No. StockAnalysis is a data site. stocksbrew is a daily briefing and a call on the stocks you follow." },
      { question: "Which has better financial data?", answer: "StockAnalysis has more of it. stocksbrew shows the main figures with their source." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-stockanalysis", "StockAnalysis") },
    ],
  },
  {
    slug: "stocksbrew-vs-danelfin",
    competitorName: "Danelfin",
    title: "stocksbrew vs Danelfin",
    description: "Danelfin gives each stock a 1 to 10 score. stocksbrew gives a call with its reason and a daily briefing on the stocks you follow.",
    verdict:
      `Danelfin gives each stock a score from 1 to 10. stocksbrew gives a ${CALL_WORDS} call with the reason and the date, and a daily briefing on what changed. A score tells you where a stock stands. The briefing tells you what happened.`,
    ourDrawback: "it does not score ETFs, and it publishes no track record for its calls.",
    competitorUrl: "https://danelfin.com",
    competitorPricingUrl: "https://danelfin.com/pricing",
    stocksbrewBestFor: "You want to know what changed for your stocks and why the call is what it is.",
    competitorBestFor: "You want one score per stock for a quick check.",
    bothScenario: "Use a score for a first look at a new name. Follow the stocks you own in stocksbrew.",
    rows: [
      { dimension: "Output", stocksbrew: CALL, competitor: "A 1 to 10 score" },
      { dimension: "Who writes the number", stocksbrew: "A fixed rule. A model writes the read, not the call or the zones", competitor: "A model score" },
      { dimension: "Daily read", stocksbrew: BRIEFING, competitor: "None. You look up scores" },
      { dimension: "Track record", stocksbrew: "No win rate is published for calls", competitor: "See its site" },
      { dimension: "Price", stocksbrew: PRICE_ROW, competitor: PRICE_CELL("stocksbrew-vs-danelfin", "Danelfin") },
    ],
    stocksbrewStrengths: [S_CALL, S_BRIEFING, S_NO_REASON, S_FOLLOW],
    competitorStrengths: ["One score that is quick to read", "A score-based screener", "Scores for ETFs as well as stocks"],
    workflow: [
      { title: "First look at a new name", body: "Check the stock report: the call, the reason and the main risk." },
      { title: "Follow what you buy", body: `Add it to Portfolio. Free covers ${FREE_COVERED_STOCKS} stocks in full.` },
      MORNING,
    ],
    faqs: [
      { question: "What is the difference between stocksbrew and Danelfin?", answer: "Danelfin scores stocks from 1 to 10. stocksbrew gives a call with a written reason and a daily briefing on the stocks you follow." },
      { question: "Is the stocksbrew call written by a model?", answer: "No. A model summarises the evidence. A fixed rule turns that summary and the market data into the call and the zones." },
      { question: "How much does each cost?", answer: COST_ANSWER("stocksbrew-vs-danelfin", "Danelfin") },
    ],
  },
];

export function getComparisonPage(slug: string): ComparisonPage | undefined {
  return COMPARISON_PAGES.find((p) => p.slug === slug);
}
