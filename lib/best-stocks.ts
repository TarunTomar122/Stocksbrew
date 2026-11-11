import { fin, joinNames, median, pct, shortDay, signedPct } from "@/lib/insight-format";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { shortCompanyName } from "@/lib/plain-copy";
import { sectorSlug, type CallWord, type ScreenerRow } from "@/lib/screener-shared";
import { dayMinus, isIsoDay } from "@/lib/seo/families";
import { isFresh } from "@/lib/seo/stock-pages";

/**
 * "Best stocks for X" lists (/best/[slug]): a fixed set of plain rules over
 * the screener snapshot, plus Form 4 insider buys and 13F fund buys for the
 * two lists that need them. Pure functions only, so the page, its metadata,
 * the sitemap and the tests all read the same rules.
 *
 * Every list says its exact rule and what it is ranked by. None of them uses
 * our call or price zones to pick or order stocks (that is the Pro screener);
 * the call is only shown beside each row, the same call everyone sees.
 */

/* ── Thresholds ───────────────────────────────────────────────────────── */

/** A list is open to search engines with at least this many qualifying stocks... */
export const LIST_MIN_STOCKS = 5;
/** ...and prices from the last this many days. */
export const LIST_PRICE_MAX_AGE_DAYS = 10;
/** The fund list also needs its 13F quarter to have ended at most this many days ago. */
export const FUND_PERIOD_MAX_AGE_DAYS = 150;
/** Rows shown on a list page. The count of everything that qualifies is still stated. */
export const LIST_SHOW = 25;
/** Insider buys are counted from filings in this many days. */
export const INSIDER_LIST_DAYS = 60;
/** The least an insider list stock needs bought in that window, in dollars. */
export const INSIDER_LIST_MIN_VALUE = 100_000;
/** Funds that bought a stock in the quarter for it to make the fund list. */
export const FUND_LIST_MIN_FUNDS = 3;
/** Each fund's 13F digest keeps its this many largest new positions, and as many largest additions. */
export const FUND_DIGEST_TOP = 25;

/* ── Inputs ───────────────────────────────────────────────────────────── */

export type InsiderTally = {
  symbol: string;
  /** Dollars bought on the open market in the window. */
  value: number;
  /** Distinct insiders who bought, by name. */
  insiders: string[];
  trades: number;
  lastFiled: string;
};

export type FundTally = { symbol: string; opened: string[]; added: string[] };

export type BestInput = {
  /** Covered stocks (no benchmarks). */
  rows: readonly ScreenerRow[];
  /** The S&P 500 (SPY) row. */
  spy: ScreenerRow | null;
  /** The close the snapshot is from, YYYY-MM-DD. */
  priceDay: string | null;
  generatedAt: string | null;
  insiders: ReadonlyMap<string, InsiderTally>;
  /** The quarter-end day of the funds' 13F filings counted, YYYY-MM-DD. */
  fundPeriod: string | null;
  /** How many funds filed for that quarter. */
  fundCount: number;
  funds: ReadonlyMap<string, FundTally>;
};

export const EMPTY_INPUT: BestInput = {
  rows: [],
  spy: null,
  priceDay: null,
  generatedAt: null,
  insiders: new Map(),
  fundPeriod: null,
  fundCount: 0,
  funds: new Map(),
};

/* ── Who is in the industry lists ─────────────────────────────────────── */

/**
 * Chip designers, chip makers and the companies that sell them equipment and
 * materials. A fixed list, because the stored industry labels are too broad
 * for many of them ("Information Technology") and file a solar maker under
 * semiconductors.
 */
export const SEMICONDUCTOR_TICKERS: readonly string[] = [
  "NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "TXN", "ADI", "MRVL",
  "ARM", "ASML", "AMAT", "LRCX", "KLAC", "TER", "NXPI", "ON", "MCHP", "MPWR",
  "SWKS", "QRVO", "ENTG", "GFS", "LSCC", "ALAB", "CRDO", "AMKR", "ONTO", "FORM",
  "ACLS", "MTSI", "SLAB", "POWI", "RMBS", "SYNA", "CRUS", "DIOD", "AMBA", "SMTC",
  "KLIC", "WOLF", "SITM", "CAMT", "NVMI",
];

/**
 * Companies whose business is tied directly to AI: the chips and the
 * equipment to make them, the servers and networking in AI data centers, and
 * the cloud and software companies building and selling AI.
 */
export const AI_TICKERS: readonly string[] = [
  "NVDA", "AMD", "AVGO", "TSM", "MU", "MRVL", "ARM", "INTC", "QCOM", "ASML",
  "AMAT", "LRCX", "KLAC", "ALAB", "CRDO", "COHR", "LITE", "ANET", "VRT", "SMCI",
  "DELL", "HPE", "CLS", "CRWV", "NBIS", "IREN", "APLD", "MSFT", "GOOGL", "META",
  "AMZN", "ORCL", "IBM", "PLTR", "NOW", "CRM", "ADBE", "SNOW", "DDOG", "MDB",
  "NET", "APP", "PATH", "AI", "SOUN", "BBAI", "TEM",
];

const SEMIS = new Set(SEMICONDUCTOR_TICKERS);
const AI = new Set(AI_TICKERS);

/* ── Facts, said with the company as the subject ──────────────────────── */

const num = (row: ScreenerRow, key: keyof ScreenerRow): number | null => {
  const value = row[key];
  return fin(value) ? value : null;
};

const times = (value: number) => `${value.toFixed(1)} times`;

/** Market value in words: "$4.2 billion", "$812 million", "$1.3 trillion". */
export function moneyWords(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(abs / 1e12).toFixed(1)} trillion`;
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 1)} billion`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)} million`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)} thousand`;
  return `$${Math.round(abs)}`;
}

/** "$375.7M", "$1.9M", "$450K" for a cell. */
export function moneyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

type Fact = (row: ScreenerRow, input: BestInput) => string | null;

/** Growth of 900% or more: the figure is at least ten times what it was. */
const TENFOLD = 900;

const fact = {
  yield: ((row) => (fin(row.div_yield) ? `pays ${row.div_yield.toFixed(1)}% a year in dividends` : null)) as Fact,
  payout: ((row) => (fin(row.payout) && row.payout > 0 ? `pays out ${Math.round(row.payout)}% of its earnings` : null)) as Fact,
  divYears: ((row) => (fin(row.div_growth_years) && row.div_growth_years >= 1 ? `has raised its dividend ${Math.round(row.div_growth_years)} years in a row` : null)) as Fact,
  divGrowth: ((row) => (fin(row.div_growth) ? `has grown its dividend ${pct(row.div_growth)} a year` : null)) as Fact,
  epsGrowth: ((row) => {
    const value = num(row, "eps_growth");
    if (value === null) return null;
    // "grew 5135%" off a tiny base reads as junk; say the size of it instead.
    if (value >= TENFOLD) return "grew earnings per share tenfold or more over the past year";
    return value >= 0 ? `grew earnings per share ${pct(value)} over the past year` : `saw earnings per share fall ${pct(value)} over the past year`;
  }) as Fact,
  revGrowth: ((row) => {
    const value = num(row, "rev_growth");
    if (value === null) return null;
    if (value >= TENFOLD) return "grew sales tenfold or more over the past year";
    return value >= 0 ? `grew sales ${pct(value)} over the past year` : `saw sales fall ${pct(value)} over the past year`;
  }) as Fact,
  epsNext: ((row) => {
    const value = num(row, "eps_next_y");
    if (value === null) return null;
    return value >= 0 ? `is expected by analysts to grow earnings ${pct(value)} next year` : `is expected by analysts to earn ${pct(value)} less next year`;
  }) as Fact,
  pe: ((row) => (fin(row.pe) && row.pe > 0 ? `trades at ${times(row.pe)} the past year's earnings` : null)) as Fact,
  fwdPe: ((row) => (fin(row.fwd_pe) && row.fwd_pe > 0 ? `trades at ${times(row.fwd_pe)} next year's expected earnings` : null)) as Fact,
  peg: ((row) => (fin(row.peg) && row.peg > 0 ? `has a PEG of ${row.peg.toFixed(2)}` : null)) as Fact,
  fcfYield: ((row) => {
    const value = fcfYield(row);
    return value === null ? null : `makes free cash equal to ${pct(value)} of its market value a year`;
  }) as Fact,
  ytd: ((row) => {
    const value = num(row, "ret_ytd");
    if (value === null) return null;
    if (Math.abs(value) < 0.05) return "is flat this year";
    return `is ${value > 0 ? "up" : "down"} ${pct(value)} this year`;
  }) as Fact,
  fromLow: ((row) => {
    const value = num(row, "from_lo_pct");
    if (value === null) return null;
    if (value < 0) return "trades at a new 52-week low";
    return value < 0.05 ? "trades at its 52-week low" : `trades ${pct(value)} above its 52-week low`;
  }) as Fact,
  fromHigh: ((row) => {
    const value = num(row, "from_hi_pct");
    if (value === null) return null;
    if (value > 0) return "trades at a new 52-week high";
    return value > -0.05 ? "trades at its 52-week high" : `trades ${pct(value)} below its 52-week high`;
  }) as Fact,
  buyPct: ((row) =>
    fin(row.buy_pct) && fin(row.analyst_count) && row.analyst_count > 0
      ? `has buy ratings from ${Math.round(row.buy_pct)}% of its ${Math.round(row.analyst_count)} analysts`
      : null) as Fact,
  upside: ((row) => {
    const value = num(row, "upside");
    if (value === null) return null;
    return value >= 0 ? `has an average analyst target ${pct(value)} above the price` : `has an average analyst target ${pct(value)} below the price`;
  }) as Fact,
  rsi: ((row) => (fin(row.rsi) ? `has a 14-day RSI of ${Math.round(row.rsi)}` : null)) as Fact,
  ret1m: ((row) => {
    const value = num(row, "ret_1m");
    if (value === null || Math.abs(value) < 0.05) return null;
    return `${value > 0 ? "rose" : "fell"} ${pct(value)} over the past month`;
  }) as Fact,
  short: ((row) => (fin(row.short_float) ? `has ${pct(row.short_float)} of its tradable shares sold short` : null)) as Fact,
  roic: ((row) => (fin(row.roic) ? `earns ${pct(row.roic)} a year on the money invested in it` : null)) as Fact,
  opMargin: ((row) => (fin(row.op_margin) ? `keeps ${pct(row.op_margin)} of sales as operating profit` : null)) as Fact,
  cap: ((row) => (fin(row.market_cap) && row.market_cap > 0 ? `is worth ${moneyWords(row.market_cap)}` : null)) as Fact,
  insiders: ((row, input) => {
    const tally = input.insiders.get(row.symbol.toUpperCase());
    if (!tally) return null;
    const who = tally.insiders.length === 1 ? "one insider" : `${tally.insiders.length} insiders`;
    const when = shortDay(tally.lastFiled);
    // "in filings through Nov 7": the newest Form 4 in the count.
    return `had ${who} buy ${moneyWords(tally.value)} of shares on the open market${when ? (tally.trades === 1 ? ` in a filing on ${when}` : ` in filings through ${when}`) : ""}`;
  }) as Fact,
  funds: ((row, input) => {
    const tally = input.funds.get(row.symbol.toUpperCase());
    if (!tally) return null;
    const total = tally.opened.length + tally.added.length;
    if (total === 0) return null;
    const fresh = tally.opened.length === 0 ? "" : tally.opened.length === total ? " as new positions" : ` (${tally.opened.length === 1 ? "one as a new position" : `${tally.opened.length} as new positions`})`;
    return `was bought by ${total === 1 ? "one of the funds" : `${total} of the funds`} we follow${fresh}`;
  }) as Fact,
};

type Note = (row: ScreenerRow, input: BestInput) => string | null;

/** Second sentences for the two filing lists: who bought. */
const note = {
  fundNames: ((row, input) => {
    const tally = input.funds.get(row.symbol.toUpperCase());
    const names = tally ? [...tally.opened, ...tally.added] : [];
    if (names.length === 0) return null;
    return names.length <= 3 ? `The buyers: ${joinNames(names)}.` : `Buyers include ${joinNames(names.slice(0, 3))}.`;
  }) as Note,
};

/** Capitalise and join verb phrases into one sentence: "Pays 6.2% a year in dividends, pays out 72% of its earnings and is up 4% this year." */
export function whySentence(phrases: ReadonlyArray<string | null>): string {
  const clean = phrases.filter((phrase): phrase is string => Boolean(phrase && phrase.trim()));
  if (clean.length === 0) return "";
  const text = joinNames(clean);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Free cash flow as a share of market value, from price to free cash flow. Null when free cash flow is not positive. */
export function fcfYield(row: ScreenerRow): number | null {
  if (!fin(row.p_fcf) || row.p_fcf <= 0) return null;
  if (fin(row.fcf) && row.fcf <= 0) return null;
  return 100 / row.p_fcf;
}

/* ── Metrics ──────────────────────────────────────────────────────────── */

export type Metric = {
  /** Column header: "Dividend yield". */
  label: string;
  /** The metric inside a sentence: "dividend yield", "distance below the 52-week high". */
  noun: string;
  /** A value said in a sentence: "a 6.19% dividend yield", "a P/E of 8.1". */
  say: (value: number) => string;
  value: (row: ScreenerRow, input: BestInput) => number | null;
  /** The value in a cell: "6.19%", "9.4x". */
  format: (value: number) => string;
  /** Rank order: "desc" puts the largest first. */
  order: "desc" | "asc";
  /** Green up and red down on the bar (returns); otherwise one accent colour. */
  signed?: boolean;
  /**
   * What the typical list value is set against in the read: the S&P 500
   * stocks we cover ("sp500"), the S&P 500 itself (`spy`, for returns), or
   * nothing when no fair baseline exists.
   */
  baseline: "sp500" | "spy" | null;
  /** Which S&P 500 stocks the baseline counts, when not all of them: "dividend payers". */
  baselineOf?: string;
};

const pctCell = (digits: number) => (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
const signedCell = (value: number) => signedPct(value, Math.abs(value) < 100 ? 1 : 0);
const timesCell = (value: number) => `${value.toFixed(1)}x`;

const field =
  (key: keyof ScreenerRow, valid: (value: number) => boolean = () => true) =>
  (row: ScreenerRow): number | null => {
    const value = row[key];
    return fin(value) && valid(value) ? value : null;
  };

const positive = (value: number) => value > 0;

const metric = {
  yield: {
    label: "Dividend yield",
    noun: "dividend yield",
    say: (value) => `a ${pct(value, 2)} dividend yield`,
    value: field("div_yield", positive),
    format: pctCell(2),
    order: "desc",
    baseline: "sp500",
    baselineOf: "dividend payers",
  },
  divGrowth: {
    label: "Dividend growth a year",
    noun: "dividend growth rate",
    say: (value) => `dividend growth of ${pct(value)} a year`,
    value: field("div_growth"),
    format: pctCell(1),
    order: "desc",
    baseline: "sp500",
    baselineOf: "dividend payers",
  },
  divYears: {
    label: "Years of raises",
    noun: "run of dividend raises",
    say: (value) => `${Math.round(value)} years of dividend raises`,
    value: field("div_growth_years", positive),
    format: (value) => `${Math.round(value)} yrs`,
    order: "desc",
    baseline: "sp500",
    baselineOf: "dividend payers",
  },
  pe: { label: "P/E", noun: "P/E", say: (value) => `a P/E of ${value.toFixed(1)}`, value: field("pe", positive), format: timesCell, order: "asc", baseline: "sp500", baselineOf: "profitable companies" },
  fwdPe: {
    label: "Forward P/E",
    noun: "forward P/E",
    say: (value) => `a forward P/E of ${value.toFixed(1)}`,
    value: field("fwd_pe", positive),
    format: timesCell,
    order: "asc",
    baseline: "sp500",
    baselineOf: "companies expected to make a profit",
  },
  peg: { label: "PEG", noun: "PEG", say: (value) => `a PEG of ${value.toFixed(2)}`, value: field("peg", positive), format: (value) => value.toFixed(2), order: "asc", baseline: "sp500" },
  fcfYield: {
    label: "Free cash flow yield",
    noun: "free cash flow yield",
    say: (value) => `a free cash flow yield of ${pct(value)}`,
    value: (row) => fcfYield(row),
    format: pctCell(1),
    order: "desc",
    baseline: "sp500",
    baselineOf: "companies with positive free cash flow",
  },
  revGrowth: { label: "Sales growth", noun: "sales growth", say: (value) => `sales growth of ${signedPct(value)}`, value: field("rev_growth"), format: signedCell, order: "desc", baseline: "sp500" },
  ytdBest: { label: "This year", noun: "change this year", say: (value) => `${signedPct(value)} this year`, value: field("ret_ytd"), format: signedCell, order: "desc", signed: true, baseline: "spy" },
  ytdWorst: { label: "This year", noun: "change this year", say: (value) => `${signedPct(value)} this year`, value: field("ret_ytd"), format: signedCell, order: "asc", signed: true, baseline: "spy" },
  fromHigh: {
    label: "Below 52-week high",
    noun: "distance below the 52-week high",
    say: (value) => (value < 0.05 ? "a price at its 52-week high" : `a price ${pct(value)} below its 52-week high`),
    // A price above the stored high is a new high: distance 0.
    value: (row) => (fin(row.from_hi_pct) ? Math.max(0, -row.from_hi_pct) : null),
    format: pctCell(1),
    order: "asc",
    baseline: "sp500",
  },
  fromLow: {
    label: "Above 52-week low",
    noun: "distance above the 52-week low",
    say: (value) => (value < 0.05 ? "a price at its 52-week low" : `a price ${pct(value)} above its 52-week low`),
    // A price below the stored low is a new low: distance 0.
    value: (row) => (fin(row.from_lo_pct) ? Math.max(0, row.from_lo_pct) : null),
    format: pctCell(1),
    order: "asc",
    baseline: "sp500",
  },
  buyPct: { label: "Buy ratings", noun: "share of buy ratings", say: (value) => `buy ratings from ${Math.round(value)}% of its analysts`, value: field("buy_pct"), format: pctCell(0), order: "desc", baseline: "sp500" },
  upside: {
    label: "To analyst target",
    noun: "distance to the average analyst target",
    say: (value) => `an average analyst target ${pct(value)} ${value >= 0 ? "above" : "below"} the price`,
    value: field("upside"),
    format: signedCell,
    order: "desc",
    baseline: "sp500",
  },
  rsi: { label: "RSI", noun: "14-day RSI", say: (value) => `a 14-day RSI of ${Math.round(value)}`, value: field("rsi"), format: (value) => value.toFixed(0), order: "asc", baseline: "sp500" },
  short: { label: "Sold short", noun: "share of tradable shares sold short", say: (value) => `${pct(value)} of its tradable shares sold short`, value: field("short_float"), format: pctCell(1), order: "desc", baseline: "sp500" },
  roic: { label: "Return on capital", noun: "return on invested capital", say: (value) => `a ${pct(value)} return on invested capital`, value: field("roic"), format: pctCell(0), order: "desc", baseline: "sp500" },
  score: { label: "Our score", noun: "score", say: (value) => `a score of ${Math.round(value)} out of 100`, value: field("score"), format: (value) => value.toFixed(0), order: "desc", baseline: "sp500" },
  insiderValue: {
    label: "Bought by insiders",
    noun: "amount bought by insiders",
    say: (value) => `${moneyWords(value)} bought by insiders`,
    value: (row, input) => input.insiders.get(row.symbol.toUpperCase())?.value ?? null,
    format: moneyShort,
    order: "desc",
    baseline: null,
  },
  fundCount: {
    label: "Funds buying",
    noun: "number of funds buying",
    say: (value) => `${Math.round(value)} funds buying`,
    value: (row, input) => {
      const tally = input.funds.get(row.symbol.toUpperCase());
      return tally ? tally.opened.length + tally.added.length : null;
    },
    format: (value) => String(Math.round(value)),
    order: "desc",
    baseline: null,
  },
} satisfies Record<string, Metric>;

/* ── The lists ────────────────────────────────────────────────────────── */

export type ListGroup = "Dividends" | "Value" | "Growth and momentum" | "Analysts and trading" | "By share price" | "Industries" | "Insiders and funds";

export const LIST_GROUPS: ListGroup[] = ["Dividends", "Value", "Growth and momentum", "Analysts and trading", "By share price", "Industries", "Insiders and funds"];

export type BestList = {
  slug: string;
  group: ListGroup;
  /** The H1 and the start of the title, in title case, worded like the search. */
  heading: string;
  /** A short name for links and the hub: "Dividend stocks under $50". */
  name: string;
  /** The exact rule, in one plain sentence. */
  rule: string | ((input: BestInput) => string);
  /** How the list is ordered, one sentence. */
  ranked: string;
  /** "Picks" where the rule looks for something good; "Stocks" for a plain screen (worst performers, most shorted). */
  noun?: "Picks" | "Stocks";
  source: "snapshot" | "insiders" | "funds";
  qualifies: (row: ScreenerRow, input: BestInput) => boolean;
  metric: Metric;
  /** The facts that explain the row, in order. */
  facts: Fact[];
  /** An optional second sentence. */
  note?: Note;
};

/** Health insurers are filed under health care, but their cash flow swings with premiums the same way. */
const HEALTH_INSURERS = new Set(["UNH", "ELV", "CI", "HUM", "CNC", "MOH", "OSCR", "ALHC", "CLOV"]);
const isFinancialOrInsurer = (row: ScreenerRow) =>
  row.sector === "Financials" || /insurance|health ?care plans|managed (?:health ?)?care/i.test(row.industry ?? "") || HEALTH_INSURERS.has(row.symbol.toUpperCase());

const cap = (row: ScreenerRow, min: number) => fin(row.market_cap) && row.market_cap >= min;
const B = 1e9;
const has = (value: unknown): value is number => fin(value);
/** Yields above 15% are left out of every dividend list: they come from a one-off payment or a collapsing price, not a dividend people can count on. */
export const MAX_DIVIDEND_YIELD = 15;
const yieldIn = (row: ScreenerRow, min: number) => has(row.div_yield) && row.div_yield >= min && row.div_yield <= MAX_DIVIDEND_YIELD;

/** "the April to June 2026 quarter" for a quarter-end day. */
export function quarterWords(periodEnd: string | null): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodEnd ?? "");
  if (!match) return "their latest quarter";
  const month = Number(match[2]);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const start = names[(month + 9) % 12];
  return `the ${start} to ${names[month - 1]} ${match[1]} quarter`;
}

export const BEST_LISTS: BestList[] = [
  /* Dividends */
  {
    slug: "dividend-stocks",
    group: "Dividends",
    heading: "Best Dividend Stocks",
    name: "Dividend stocks",
    rule: "A dividend yield from 2.5% to 15%, a dividend raised at least five years in a row, and no more than 80% of earnings paid out.",
    ranked: "Ranked by dividend yield, highest first.",
    source: "snapshot",
    qualifies: (row) => yieldIn(row, 2.5) && has(row.div_growth_years) && row.div_growth_years >= 5 && has(row.payout) && row.payout > 0 && row.payout <= 80,
    metric: metric.yield,
    facts: [fact.yield, fact.divYears, fact.payout],
  },
  {
    slug: "dividend-stocks-under-50",
    group: "Dividends",
    heading: "Best Dividend Stocks Under $50",
    name: "Dividend stocks under $50",
    rule: "A dividend yield from 3% to 15%, a share price under $50, earnings per share higher than a year ago, and no more than all of those earnings paid out.",
    ranked: "Ranked by dividend yield, highest first.",
    source: "snapshot",
    qualifies: (row) =>
      yieldIn(row, 3) && has(row.price) && row.price > 0 && row.price < 50 && has(row.eps_growth) && row.eps_growth > 0 && has(row.payout) && row.payout > 0 && row.payout <= 100,
    metric: metric.yield,
    facts: [fact.yield, fact.epsGrowth, fact.payout],
  },
  {
    slug: "high-dividend-yield-stocks",
    group: "Dividends",
    heading: "High Dividend Yield Stocks",
    name: "High dividend yield stocks",
    rule: "A dividend yield from 4% to 15%, paid out of earnings: the company pays no more than it earned over the past year.",
    ranked: "Ranked by dividend yield, highest first.",
    source: "snapshot",
    qualifies: (row) => yieldIn(row, 4) && has(row.payout) && row.payout > 0 && row.payout <= 100,
    metric: metric.yield,
    facts: [fact.yield, fact.payout, fact.ytd],
  },
  {
    slug: "dividend-growth-stocks",
    group: "Dividends",
    heading: "Best Dividend Growth Stocks",
    name: "Dividend growth stocks",
    rule: "A dividend raised at least ten years in a row, growing 5% a year or faster, with no more than 75% of earnings paid out.",
    ranked: "Ranked by how fast the dividend has grown each year, fastest first.",
    source: "snapshot",
    qualifies: (row) =>
      has(row.div_growth_years) && row.div_growth_years >= 10 && has(row.div_growth) && row.div_growth >= 5 && has(row.payout) && row.payout > 0 && row.payout <= 75,
    metric: metric.divGrowth,
    facts: [fact.divGrowth, fact.divYears, fact.yield],
  },
  {
    slug: "dividend-raised-25-years",
    group: "Dividends",
    heading: "Stocks That Raised Their Dividend 25 Years in a Row",
    name: "Dividend raised 25+ years in a row",
    rule: "The company has raised its dividend every year for at least 25 years.",
    ranked: "Ranked by the number of years in a row, longest first.",
    source: "snapshot",
    qualifies: (row) => has(row.div_growth_years) && row.div_growth_years >= 25,
    metric: metric.divYears,
    facts: [fact.divYears, fact.yield, fact.divGrowth],
  },

  /* Value */
  {
    slug: "undervalued-stocks",
    group: "Value",
    heading: "Undervalued Stocks",
    name: "Undervalued stocks",
    rule: "A PEG of 1 or less (the price-to-earnings ratio divided by expected earnings growth), a forward P/E under 20, and a profit over the past year.",
    ranked: "Ranked by forward P/E (price against next year's expected earnings), lowest first.",
    source: "snapshot",
    qualifies: (row) => has(row.peg) && row.peg > 0 && row.peg <= 1 && has(row.fwd_pe) && row.fwd_pe > 0 && row.fwd_pe < 20 && has(row.net_margin) && row.net_margin > 0,
    metric: metric.fwdPe,
    facts: [fact.fwdPe, fact.peg, fact.epsNext],
  },
  {
    slug: "undervalued-tech-stocks",
    group: "Value",
    heading: "Undervalued Tech Stocks",
    name: "Undervalued tech stocks",
    rule: "Technology companies with a PEG of 1.5 or less, a forward P/E under 30, and a profit over the past year.",
    ranked: "Ranked by forward P/E (price against next year's expected earnings), lowest first.",
    source: "snapshot",
    qualifies: (row) =>
      row.sector === "Technology" && has(row.peg) && row.peg > 0 && row.peg <= 1.5 && has(row.fwd_pe) && row.fwd_pe > 0 && row.fwd_pe < 30 && has(row.net_margin) && row.net_margin > 0,
    metric: metric.fwdPe,
    facts: [fact.fwdPe, fact.peg, fact.epsNext],
  },
  {
    slug: "low-pe-stocks",
    group: "Value",
    heading: "Low P/E Stocks",
    name: "Low P/E stocks",
    rule: "A price-to-earnings ratio under 15 on both the past year's and next year's expected earnings, earnings per share higher than a year ago, and a market value of $2 billion or more.",
    ranked: "Ranked by P/E, lowest first.",
    source: "snapshot",
    qualifies: (row) =>
      has(row.pe) && row.pe > 0 && row.pe < 15 && has(row.fwd_pe) && row.fwd_pe > 0 && row.fwd_pe < 15 && has(row.eps_growth) && row.eps_growth > 0 && cap(row, 2 * B),
    metric: metric.pe,
    facts: [fact.pe, fact.fwdPe, fact.epsGrowth],
  },
  {
    slug: "high-free-cash-flow-yield-stocks",
    group: "Value",
    heading: "Highest Free Cash Flow Yield Stocks",
    name: "High free cash flow yield",
    rule: "Free cash flow over the past year equal to 6% or more of the company's market value, for companies worth $2 billion or more other than banks, lenders and insurers, health insurers included (their cash flow is not comparable).",
    ranked: "Ranked by free cash flow yield, highest first.",
    source: "snapshot",
    qualifies: (row) => {
      const value = fcfYield(row);
      return value !== null && value >= 6 && cap(row, 2 * B) && !isFinancialOrInsurer(row);
    },
    metric: metric.fcfYield,
    facts: [fact.fcfYield, fact.revGrowth, fact.ytd],
  },
  {
    slug: "cheapest-ai-stocks",
    group: "Value",
    heading: "Cheapest AI Stocks Right Now",
    name: "Cheapest AI stocks",
    rule: "Companies on our AI list (chips, chip equipment, AI data-center hardware, and the cloud and software companies selling AI) that analysts expect to make a profit next year.",
    ranked: "Ranked by forward P/E (price against next year's expected earnings), lowest first.",
    source: "snapshot",
    qualifies: (row) => AI.has(row.symbol.toUpperCase()) && has(row.fwd_pe) && row.fwd_pe > 0,
    metric: metric.fwdPe,
    facts: [fact.fwdPe, fact.epsNext, fact.ytd],
  },

  /* Growth and momentum */
  {
    slug: "growth-stocks",
    group: "Growth and momentum",
    heading: "Best Growth Stocks",
    name: "Growth stocks",
    rule: "Sales up 20% or more from a year ago on at least $1 billion of sales, earnings expected to grow 15% or more next year, and a market value of $2 billion or more.",
    ranked: "Ranked by sales growth, fastest first.",
    source: "snapshot",
    qualifies: (row) =>
      has(row.rev_growth) && row.rev_growth >= 20 && has(row.revenue) && row.revenue >= 1 * B && has(row.eps_next_y) && row.eps_next_y >= 15 && cap(row, 2 * B),
    metric: metric.revGrowth,
    facts: [fact.revGrowth, fact.epsNext, fact.ytd],
  },
  {
    slug: "best-performing-stocks-this-year",
    group: "Growth and momentum",
    heading: "Best Performing Stocks This Year",
    name: "Best performers this year",
    rule: "Stocks worth $2 billion or more that are ahead of the S&P 500 so far this year.",
    ranked: "Ranked by price change since the start of the year, biggest gain first.",
    source: "snapshot",
    qualifies: (row, input) => cap(row, 2 * B) && has(row.ret_ytd) && has(input.spy?.ret_ytd) && row.ret_ytd > (input.spy!.ret_ytd as number),
    metric: metric.ytdBest,
    facts: [fact.ytd, fact.revGrowth, fact.fromHigh],
  },
  {
    slug: "worst-performing-stocks-this-year",
    group: "Growth and momentum",
    heading: "Worst Performing Stocks This Year",
    name: "Worst performers this year",
    noun: "Stocks",
    rule: "Stocks worth $2 billion or more that are lower than where they started the year.",
    ranked: "Ranked by price change since the start of the year, biggest fall first.",
    source: "snapshot",
    qualifies: (row) => cap(row, 2 * B) && has(row.ret_ytd) && row.ret_ytd < 0,
    metric: metric.ytdWorst,
    facts: [fact.ytd, fact.revGrowth, fact.upside],
  },
  {
    slug: "stocks-near-52-week-highs",
    group: "Growth and momentum",
    heading: "Stocks Near 52-Week Highs",
    name: "Near 52-week highs",
    noun: "Stocks",
    rule: "Stocks worth $2 billion or more trading within 3% of their highest price of the past 52 weeks.",
    ranked: "Ranked by distance below the 52-week high, closest first.",
    source: "snapshot",
    qualifies: (row) => cap(row, 2 * B) && has(row.from_hi_pct) && row.from_hi_pct >= -3,
    metric: metric.fromHigh,
    facts: [fact.fromHigh, fact.ytd, fact.revGrowth],
  },
  {
    slug: "long-term-stocks",
    group: "Growth and momentum",
    heading: "Best Long-Term Compounder Stocks",
    name: "Long-term compounders",
    rule: "A return on invested capital above 15%, an operating margin above 20%, sales still growing 5% or more, and positive equity with debt no more than 1.5 times it.",
    ranked: "Ranked by return on invested capital, highest first.",
    source: "snapshot",
    qualifies: (row) =>
      has(row.roic) && row.roic > 15 && has(row.op_margin) && row.op_margin > 20 && has(row.rev_growth) && row.rev_growth >= 5 && has(row.debt_equity) && row.debt_equity >= 0 && row.debt_equity <= 1.5,
    metric: metric.roic,
    facts: [fact.roic, fact.opMargin, fact.revGrowth],
  },

  /* Analysts and trading */
  {
    slug: "near-52-week-lows-analysts-like",
    group: "Analysts and trading",
    heading: "Stocks Near 52-Week Lows That Analysts Like",
    name: "Near 52-week lows, analysts like",
    rule: "Within 15% of the lowest price of the past 52 weeks, with buy ratings from at least 70% of five or more analysts.",
    ranked: "Ranked by distance above the 52-week low, closest first.",
    source: "snapshot",
    qualifies: (row) => has(row.from_lo_pct) && row.from_lo_pct <= 15 && has(row.buy_pct) && row.buy_pct >= 70 && has(row.analyst_count) && row.analyst_count >= 5,
    metric: metric.fromLow,
    facts: [fact.fromLow, fact.buyPct, fact.upside],
  },
  {
    slug: "strong-buy-stocks",
    group: "Analysts and trading",
    heading: "Strong Buy Stocks",
    name: "Strong buy stocks",
    rule: "Buy ratings from at least 85% of the analysts covering the stock, with ten or more analysts.",
    ranked: "Ranked by the share of buy ratings, then by the distance to the average analyst target.",
    source: "snapshot",
    qualifies: (row) => has(row.buy_pct) && row.buy_pct >= 85 && has(row.analyst_count) && row.analyst_count >= 10,
    metric: metric.buyPct,
    facts: [fact.buyPct, fact.upside, fact.ytd],
  },
  {
    slug: "most-upside-to-analyst-targets",
    group: "Analysts and trading",
    heading: "Stocks With the Most Upside to Analyst Price Targets",
    name: "Most upside to analyst targets",
    rule: "An average analyst price target from 20% to 100% above today's price, from eight or more analysts, for companies worth $2 billion or more.",
    ranked: "Ranked by the distance to the average analyst target, largest first.",
    source: "snapshot",
    qualifies: (row) => has(row.upside) && row.upside >= 20 && row.upside <= 100 && has(row.analyst_count) && row.analyst_count >= 8 && cap(row, 2 * B),
    metric: metric.upside,
    facts: [fact.upside, fact.buyPct, fact.ytd],
  },
  {
    slug: "oversold-stocks",
    group: "Analysts and trading",
    heading: "Oversold Stocks",
    name: "Oversold stocks",
    noun: "Stocks",
    rule: "A 14-day RSI under 30, which means the price has fallen hard and fast over the last few weeks, for companies worth $2 billion or more.",
    ranked: "Ranked by RSI, lowest first.",
    source: "snapshot",
    qualifies: (row) => has(row.rsi) && row.rsi < 30 && cap(row, 2 * B),
    metric: metric.rsi,
    facts: [fact.rsi, fact.ret1m, fact.fromLow],
  },
  {
    slug: "most-shorted-stocks",
    group: "Analysts and trading",
    heading: "Most Shorted Stocks",
    name: "Most shorted stocks",
    noun: "Stocks",
    rule: "At least 10% of the shares available to trade are sold short, for companies worth $1 billion or more.",
    ranked: "Ranked by the share of tradable shares sold short, highest first.",
    source: "snapshot",
    qualifies: (row) => has(row.short_float) && row.short_float >= 10 && cap(row, 1 * B),
    metric: metric.short,
    facts: [fact.short, fact.ytd, fact.ret1m],
  },

  /* By share price */
  {
    slug: "stocks-under-10",
    group: "By share price",
    heading: "Best Stocks Under $10",
    name: "Stocks under $10",
    rule: "A share price under $10 and a market value of $300 million or more.",
    ranked: "Ranked by our score out of 100, which blends value, growth, business quality and the price trend.",
    source: "snapshot",
    qualifies: (row) => has(row.price) && row.price > 0 && row.price < 10 && cap(row, 0.3 * B) && has(row.score),
    metric: metric.score,
    facts: [fact.revGrowth, fact.fwdPe, fact.ytd],
  },
  {
    slug: "stocks-under-20",
    group: "By share price",
    heading: "Best Stocks Under $20",
    name: "Stocks under $20",
    rule: "A share price under $20 and a market value of $1 billion or more.",
    ranked: "Ranked by our score out of 100, which blends value, growth, business quality and the price trend.",
    source: "snapshot",
    qualifies: (row) => has(row.price) && row.price > 0 && row.price < 20 && cap(row, 1 * B) && has(row.score),
    metric: metric.score,
    facts: [fact.revGrowth, fact.fwdPe, fact.ytd],
  },
  {
    slug: "stocks-under-50",
    group: "By share price",
    heading: "Best Stocks Under $50",
    name: "Stocks under $50",
    rule: "A share price under $50 and a market value of $2 billion or more.",
    ranked: "Ranked by our score out of 100, which blends value, growth, business quality and the price trend.",
    source: "snapshot",
    qualifies: (row) => has(row.price) && row.price > 0 && row.price < 50 && cap(row, 2 * B) && has(row.score),
    metric: metric.score,
    facts: [fact.revGrowth, fact.fwdPe, fact.ytd],
  },

  /* Industries */
  {
    slug: "ai-stocks",
    group: "Industries",
    heading: "Best AI Stocks",
    name: "AI stocks",
    rule: "Companies on our AI list: chips, chip equipment, AI data-center hardware, and the cloud and software companies selling AI.",
    ranked: "Ranked by our score out of 100, which blends value, growth, business quality and the price trend.",
    source: "snapshot",
    qualifies: (row) => AI.has(row.symbol.toUpperCase()) && has(row.score),
    metric: metric.score,
    facts: [fact.revGrowth, fact.fwdPe, fact.ytd],
  },
  {
    slug: "semiconductor-stocks",
    group: "Industries",
    heading: "Best Semiconductor Stocks",
    name: "Semiconductor stocks",
    rule: "Companies that design or make chips, or sell the equipment and materials used to make them.",
    ranked: "Ranked by our score out of 100, which blends value, growth, business quality and the price trend.",
    source: "snapshot",
    qualifies: (row) => SEMIS.has(row.symbol.toUpperCase()) && has(row.score),
    metric: metric.score,
    facts: [fact.revGrowth, fact.fwdPe, fact.ytd],
  },

  /* Insiders and funds */
  {
    slug: "stocks-insiders-are-buying",
    group: "Insiders and funds",
    heading: "Stocks Insiders Are Buying",
    name: "Stocks insiders are buying",
    noun: "Stocks",
    rule: `Company insiders (officers, directors and owners of 10% or more) bought at least $${INSIDER_LIST_MIN_VALUE.toLocaleString("en-US")} of shares on the open market, in SEC Form 4 filings from the last ${INSIDER_LIST_DAYS} days.`,
    ranked: "Ranked by the dollar value bought, largest first.",
    source: "insiders",
    qualifies: (row, input) => (input.insiders.get(row.symbol.toUpperCase())?.value ?? 0) >= INSIDER_LIST_MIN_VALUE,
    metric: metric.insiderValue,
    facts: [fact.insiders, fact.ytd, fact.fromLow],
  },
  {
    slug: "stocks-hedge-funds-bought",
    group: "Insiders and funds",
    heading: "Stocks Hedge Funds Bought Most Last Quarter",
    name: "Stocks funds bought last quarter",
    noun: "Stocks",
    rule: (input) =>
      `At least ${FUND_LIST_MIN_FUNDS} of the ${input.fundCount || "big"} funds we follow that have filed 13Fs for ${quarterWords(input.fundPeriod)} opened or added to the stock, counting each fund's ${FUND_DIGEST_TOP} largest new positions and ${FUND_DIGEST_TOP} largest additions.`,
    ranked: "Ranked by the number of funds buying, most first.",
    source: "funds",
    qualifies: (row, input) => {
      const tally = input.funds.get(row.symbol.toUpperCase());
      return Boolean(tally && tally.opened.length + tally.added.length >= FUND_LIST_MIN_FUNDS);
    },
    metric: metric.fundCount,
    facts: [fact.funds, fact.ytd],
    note: note.fundNames,
  },
];

export const BEST_LIST_BY_SLUG: ReadonlyMap<string, BestList> = new Map(BEST_LISTS.map((list) => [list.slug, list]));

export function getBestList(slug: string): BestList | null {
  return BEST_LIST_BY_SLUG.get(String(slug ?? "").trim().toLowerCase()) ?? null;
}

export function bestListHref(slug: string): string {
  return `/best/${slug}`;
}

export function ruleText(list: BestList, input: BestInput): string {
  return typeof list.rule === "function" ? list.rule(input) : list.rule;
}

/* ── Building a list ──────────────────────────────────────────────────── */

/** One ranked row: only the fields the page shows. No price zones ever reach it. */
export type RankedStock = {
  rank: number;
  symbol: string;
  name: string;
  sector: string | null;
  price: number | null;
  value: number;
  call: CallWord | null;
  /** Why it is on the list, one sentence from its own numbers. */
  why: string;
  ret_ytd: number | null;
  market_cap: number | null;
};

export type BuiltList = {
  list: BestList;
  rule: string;
  /** Every stock that meets the rule today. */
  count: number;
  /** All qualifying stocks in rank order. */
  ranked: RankedStock[];
  /** The first LIST_SHOW of them. */
  shown: RankedStock[];
  /** The day the list's data is from (the snapshot's close). */
  day: string | null;
};

function displayName(row: ScreenerRow): string {
  // "Eli Lilly and Company" loses its "Company" upstream; drop the "and" it leaves behind.
  // Feed tails like "Hello Group Inc. Sponsored" and "Figma Inc. Class A Common Stock" go first.
  const raw = (row.name ?? "").replace(/\s+(?:Sponsored\b.*|(?:Class [A-C]\s+)?(?:Common|Ordinary)\s+(?:Stock|Shares)\b.*|American Depositary\b.*)$/i, "");
  const name = shortCompanyName(raw).replace(/\s+(?:and|&)$/i, "");
  return name && name.toUpperCase() !== row.symbol.toUpperCase() ? name : row.symbol.toUpperCase();
}

export function buildList(list: BestList, input: BestInput): BuiltList {
  const rows = input.rows
    .filter((row) => !row.benchmark && !row.uncovered)
    .map((row) => ({ row, value: list.qualifies(row, input) ? list.metric.value(row, input) : null }))
    .filter((item): item is { row: ScreenerRow; value: number } => fin(item.value));
  const direction = list.metric.order === "desc" ? -1 : 1;
  // Strong buy: equal shares of buy ratings are split by the distance to the target, largest first.
  const tie = list.slug === "strong-buy-stocks" ? (row: ScreenerRow) => -(fin(row.upside) ? row.upside : -1e9) : () => 0;
  rows.sort(
    (a, b) =>
      direction * (a.value - b.value) ||
      tie(a.row) - tie(b.row) ||
      (b.row.market_cap ?? 0) - (a.row.market_cap ?? 0) ||
      a.row.symbol.localeCompare(b.row.symbol),
  );
  // One line per company: a second share class (GOOG beside GOOGL) is left out.
  const seen = new Set<string>();
  const unique = rows.filter(({ row }) => {
    const key = displayName(row).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = unique.map(({ row, value }, index) => ({
    rank: index + 1,
    symbol: row.symbol.toUpperCase(),
    name: displayName(row),
    sector: row.sector ?? null,
    price: fin(row.price) ? row.price : null,
    value,
    call: row.call ?? null,
    why: [whySentence(list.facts.map((make) => make(row, input))), list.note?.(row, input) ?? ""].filter(Boolean).join(" "),
    ret_ytd: fin(row.ret_ytd) ? row.ret_ytd : null,
    market_cap: fin(row.market_cap) ? row.market_cap : null,
  }));
  return { list, rule: ruleText(list, input), count: ranked.length, ranked, shown: ranked.slice(0, LIST_SHOW), day: input.priceDay };
}

/* ── Index rule, title, description ───────────────────────────────────── */

/**
 * The list index rule: at least LIST_MIN_STOCKS stocks qualify, the prices
 * are at most LIST_PRICE_MAX_AGE_DAYS old, and for the fund list the 13F
 * quarter is recent. A list that fails still renders, with a plain note and
 * noindex. The page metadata and the sitemap both call this.
 */
export function listIsIndexable(built: Pick<BuiltList, "count" | "day" | "list">, today: string, fundPeriod: string | null = null): boolean {
  if (built.count < LIST_MIN_STOCKS) return false;
  if (!isFresh(built.day, today, LIST_PRICE_MAX_AGE_DAYS)) return false;
  if (built.list.source === "funds") return isIsoDay(fundPeriod) && fundPeriod >= dayMinus(today, FUND_PERIOD_MAX_AGE_DAYS);
  return true;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "November 2026" from a YYYY-MM-DD day. Empty when it is not a day. */
export function monthYear(day: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(day ?? "");
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : "";
}

/** "Best Dividend Stocks Under $50 (November 2026): 14 Picks, Ranked". */
export function listTitle(built: Pick<BuiltList, "list" | "count" | "day">): string {
  const { list, count } = built;
  const month = monthYear(built.day);
  const noun = list.noun ?? "Picks";
  let tail: string;
  if (count === 0) tail = "None Qualify Today";
  else if (count < LIST_MIN_STOCKS) tail = `Only ${count} ${count === 1 ? "Qualifies" : "Qualify"} Today`;
  else if (count <= LIST_SHOW) tail = `${count} ${noun}, Ranked`;
  else tail = `Top ${LIST_SHOW} of ${count}, Ranked`;
  return `${list.heading}${month ? ` (${month})` : ""}: ${tail}`;
}

/** A unique description: the rule, how many qualify on which day, the leaders and the order. */
export function listDescription(built: BuiltList): string {
  const { count, ranked, list } = built;
  const when = built.day ? `the ${longDayText(built.day)} close` : "the latest close";
  const lead = ranked.slice(0, 3).map((row) => (row.name === row.symbol ? row.symbol : `${row.name} (${row.symbol})`));
  const qualify =
    count === 0
      ? `No US stock we cover meets it as of ${when}.`
      : `${count} US ${count === 1 ? "stock meets" : "stocks meet"} it as of ${when}${lead.length ? `, led by ${joinNames(lead)}` : ""}.`;
  return `${built.rule} ${qualify} ${list.ranked}`;
}

function longDayText(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) return day;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

/* ── The read ─────────────────────────────────────────────────────────── */

const sp500 = (rows: readonly ScreenerRow[]) => rows.filter((row) => row.indexes?.includes("S&P 500"));

/** The typical (median) value of a metric across the S&P 500 stocks we cover, or null with fewer than 20 of them. */
export function sp500Median(metricDef: Metric, input: BestInput): number | null {
  const values = sp500(input.rows)
    .map((row) => metricDef.value(row, input))
    .filter(fin);
  return values.length >= 20 ? median(values) : null;
}

/**
 * The read on top of a list: how many qualify and who leads, the typical
 * list value against the S&P 500, how the list has done this year against
 * the index, and where the list is concentrated. Plain rules on the same
 * rows; an insight the numbers cannot back is left out.
 */
export function buildListRead(built: BuiltList, input: BestInput): TheRead {
  const { list, ranked, count } = built;
  const asOf = input.generatedAt;
  const source = list.source === "insiders" ? "SEC Form 4 filings and prices" : list.source === "funds" ? "13F filings and prices" : "Prices and company data";
  if (count === 0) {
    return { headline: "No stock we cover meets this rule today.", insights: [], source, asOf };
  }
  const top = ranked[0]!;
  const metricDef = list.metric;
  const stocks = count === 1 ? "One stock meets" : `${count} stocks meet`;
  const headline = `${stocks} this rule today, and ${top.name} ranks first with ${metricDef.say(top.value)}.`;

  const insights: Array<Insight | null> = [];
  const typical = median(ranked.map((row) => row.value));
  const spyYtd = fin(input.spy?.ret_ytd) ? (input.spy!.ret_ytd as number) : null;

  // 1. The typical list value against a fair baseline.
  if (typical !== null && count >= 3) {
    if (metricDef.baseline === "spy" && spyYtd !== null) {
      insights.push({
        id: "baseline",
        tone: typical >= spyYtd ? "up" : "down",
        text: `The typical stock here ${typical >= 0 ? "is up" : "is down"} ${pct(typical)} this year, against ${signedPct(spyYtd, 1)} for the S&P 500.`,
      });
    } else if (metricDef.baseline === "sp500") {
      const base = sp500Median(metricDef, input);
      if (base !== null) {
        insights.push({
          id: "baseline",
          tone: "flat",
          text: `The typical ${metricDef.noun} on this list is ${metricDef.format(typical)}, against ${metricDef.format(base)} for the typical S&P 500 stock we cover${metricDef.baselineOf ? ` (${metricDef.baselineOf} only)` : ""}.`,
        });
      }
    }
  }

  // 2. This year against the S&P 500 (skipped when the list is ranked by it).
  if (metricDef.baseline !== "spy" && spyYtd !== null) {
    const withYtd = ranked.filter((row) => row.ret_ytd !== null);
    if (withYtd.length >= 3) {
      const ahead = withYtd.filter((row) => (row.ret_ytd as number) > spyYtd);
      const best = [...withYtd].sort((a, b) => (b.ret_ytd as number) - (a.ret_ytd as number))[0]!;
      insights.push({
        id: "ytd",
        tone: ahead.length * 2 >= withYtd.length ? "up" : "down",
        text: `${ahead.length} of the ${withYtd.length}${withYtd.length < count ? " with prices from the start of the year" : ""} are ahead of the S&P 500 this year (${signedPct(spyYtd, 1)}), led by ${best.name} at ${signedPct(best.ret_ytd as number)}.`,
        tickers: [best.symbol],
      });
    }
  }

  // 3. Where the list is concentrated.
  const bySector = new Map<string, number>();
  for (const row of ranked) if (row.sector) bySector.set(row.sector, (bySector.get(row.sector) ?? 0) + 1);
  const sectors = [...bySector.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sectors.length > 0 && count >= 4 && list.group !== "Industries" && list.slug !== "undervalued-tech-stocks") {
    const [sector, members] = sectors[0]!;
    const share = members / count;
    const text =
      share >= 0.4
        ? `${members} of the ${count} are ${sector.toLowerCase()} companies, more than any other sector.`
        : `The list spreads across ${sectors.length} sectors; ${sector.toLowerCase()} has the most with ${members}.`;
    insights.push({ id: "sector", tone: "flat", text, action: { label: `${sector} stocks`, href: `/sectors/${sectorSlug(sector)}` } });
  }

  return { headline, insights: pickInsights(insights, 3), source, asOf };
}

/* ── Insider and fund tallies ─────────────────────────────────────────── */

export type InsiderBuyLike = {
  symbol: string;
  insider: string;
  insider_id?: string;
  tx_type: "buy" | "sell";
  value: number | null;
  filing_date?: string;
  filed_at?: string;
  transaction_date?: string;
};

/** Open-market buys per stock, from filings in the INSIDER_LIST_DAYS before `today`. */
export function tallyInsiderBuys(trades: readonly InsiderBuyLike[], today: string): Map<string, InsiderTally> {
  const since = dayMinus(today, INSIDER_LIST_DAYS);
  const out = new Map<string, InsiderTally & { ids: Set<string> }>();
  for (const trade of trades) {
    if (trade.tx_type !== "buy" || !fin(trade.value) || trade.value <= 0) continue;
    const day = String(trade.filing_date || trade.filed_at || "").slice(0, 10);
    if (!isIsoDay(day) || day < since || day > today) continue;
    const symbol = String(trade.symbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const held = out.get(symbol) ?? { symbol, value: 0, insiders: [], trades: 0, lastFiled: day, ids: new Set<string>() };
    held.value += trade.value;
    held.trades += 1;
    const id = trade.insider_id || trade.insider;
    if (id && !held.ids.has(id)) {
      held.ids.add(id);
      held.insiders.push(trade.insider || id);
    }
    if (day > held.lastFiled) held.lastFiled = day;
    out.set(symbol, held);
  }
  return new Map([...out].map(([symbol, { ids: _ids, ...tally }]) => [symbol, tally]));
}

export type FundDigestLike = {
  name: string;
  period: string;
  opened: Array<{ ticker: string }>;
  added: Array<{ ticker: string }>;
};

/** The quarter most funds have filed for: the one the fund list counts. */
export function fundQuarter(digests: readonly FundDigestLike[]): string | null {
  const counts = new Map<string, number>();
  for (const digest of digests) if (isIsoDay(digest.period)) counts.set(digest.period, (counts.get(digest.period) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [period, n] of counts) {
    if (n > bestCount || (n === bestCount && best !== null && period > best)) {
      best = period;
      bestCount = n;
    }
  }
  return best;
}

/** Funds that opened or added to each stock in `period`. A fund counts once per stock. */
export function tallyFundBuys(digests: readonly FundDigestLike[], period: string | null): { funds: Map<string, FundTally>; fundCount: number } {
  const funds = new Map<string, FundTally>();
  let fundCount = 0;
  if (!period) return { funds, fundCount };
  for (const digest of digests) {
    if (digest.period !== period) continue;
    fundCount += 1;
    const seen = new Set<string>();
    const add = (ticker: string, kind: "opened" | "added") => {
      const symbol = String(ticker ?? "").trim().toUpperCase();
      if (!symbol || seen.has(symbol)) return;
      seen.add(symbol);
      const tally = funds.get(symbol) ?? { symbol, opened: [], added: [] };
      tally[kind].push(digest.name);
      funds.set(symbol, tally);
    };
    for (const move of digest.opened) add(move.ticker, "opened");
    for (const move of digest.added) add(move.ticker, "added");
  }
  return { funds, fundCount };
}

/* ── The hub ──────────────────────────────────────────────────────────── */

/** The read on the hub: which stock shows up on the most lists, and the longest and shortest lists today. */
export function buildHubRead(built: readonly BuiltList[], input: BestInput): TheRead | null {
  if (built.length === 0) return null;
  const live = built.filter((item) => item.count >= LIST_MIN_STOCKS);
  const headline =
    live.length === built.length
      ? `All ${built.length} lists have five or more stocks that meet their rule today.`
      : `${live.length} of our ${built.length} lists have five or more stocks that meet their rule today.`;
  const appearances = new Map<string, { name: string; lists: string[] }>();
  for (const item of built) {
    for (const row of item.shown) {
      const held = appearances.get(row.symbol) ?? { name: row.name, lists: [] };
      held.lists.push(inSentence(item.list.name));
      appearances.set(row.symbol, held);
    }
  }
  const most = [...appearances.entries()].sort((a, b) => b[1].lists.length - a[1].lists.length || a[0].localeCompare(b[0]))[0];
  const insights: Array<Insight | null> = [];
  if (most && most[1].lists.length >= 3) {
    insights.push({
      id: "most-lists",
      tone: "flat",
      text: `${most[1].name} makes ${most[1].lists.length} of the lists, more than any other stock, including ${joinNames(most[1].lists.slice(0, 3))}.`,
      tickers: [most[0]],
      action: { label: `Open ${most[0]}`, href: `/stock/${encodeURIComponent(most[0])}` },
    });
  }
  const bySize = [...built].sort((a, b) => b.count - a.count);
  const longest = bySize[0];
  if (longest && longest.count > 0) {
    insights.push({
      id: "longest",
      tone: "flat",
      text: `The longest list is ${inSentence(longest.list.name)}, with ${longest.count} stocks.`,
      action: { label: "See it", href: bestListHref(longest.list.slug) },
    });
  }
  const thin = built.filter((item) => item.count < LIST_MIN_STOCKS);
  if (thin.length > 0) {
    insights.push({
      id: "thin",
      tone: "flat",
      text: `${thin.length === 1 ? "One list has" : `${thin.length} lists have`} fewer than five stocks today: ${joinNames(thin.slice(0, 4).map((item) => `${inSentence(item.list.name)} (${item.count})`))}.`,
    });
  }
  return { headline, insights: pickInsights(insights, 3), source: "Prices, company data and filings", asOf: input.generatedAt };
}

/** A list name inside a sentence: "Dividend stocks" -> "dividend stocks", while "AI stocks" keeps its capitals. */
export function inSentence(name: string): string {
  return /^[A-Z][A-Z0-9/]/.test(name) ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/* ── Structured data ──────────────────────────────────────────────────── */

const SITE = "https://www.stocksbrew.online";

export function itemListLd(built: BuiltList): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: built.list.heading,
    description: built.rule,
    url: `${SITE}${bestListHref(built.list.slug)}`,
    numberOfItems: built.shown.length,
    itemListOrder: built.list.metric.order === "desc" ? "https://schema.org/ItemListOrderDescending" : "https://schema.org/ItemListOrderAscending",
    itemListElement: built.shown.map((row) => ({
      "@type": "ListItem",
      position: row.rank,
      name: `${row.name} (${row.symbol})`,
      url: `${SITE}/stock/${encodeURIComponent(row.symbol)}`,
    })),
  };
}

/** Lists in the same group first, then the first list of each other group. */
export function relatedLists(list: BestList, max = 6): BestList[] {
  const same = BEST_LISTS.filter((item) => item.group === list.group && item.slug !== list.slug);
  const others = LIST_GROUPS.filter((group) => group !== list.group)
    .map((group) => BEST_LISTS.find((item) => item.group === group))
    .filter((item): item is BestList => Boolean(item));
  return [...same, ...others].slice(0, max);
}
