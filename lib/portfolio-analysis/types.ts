/**
 * The portfolio analysis on /portfolio/xray: one result, one module per question a holder asks about their mix.
 *
 * Every share is a percent of the money (0 to 100). Every module says how much of the money it covers and the
 * dates it is from, or is null when there is not enough data to say anything honest. Missing data is never read as
 * flat: a holding with no prices is left out and the coverage drops, it is not counted as a zero move.
 *
 * Pure types, safe on both sides.
 */

export type HoldingRef = { ticker: string; name: string };

export type Weighted = HoldingRef & {
  /** Share of the money, 0 to 100. */
  weight: number;
};

/* ── 1. How the money sits ─────────────────────────────────────────────── */

/** A name shown on a sector row: one of the person's own (biggest first), or an S&P 500 leader to look at. */
export type SectorName = HoldingRef & { idea: boolean };

export type SectorShare = {
  sector: string;
  pct: number;
  spPct: number | null;
  /**
   * Two or three names for the row: the person's own in the sector, biggest first (companies inside opened funds
   * count); for a sector they skip or hold far less of than the S&P 500, its largest names there as ideas.
   */
  names: SectorName[];
};

export type ConcentrationModule = {
  /** "look-through": funds opened into their companies. "as-typed": each line as the person entered it. */
  basis: "look-through" | "as-typed";
  largest: Weighted | null;
  /** The five biggest lines (or companies) together. */
  top5: number;
  top5Tickers: string[];
  /** 1 / sum of squared weights: how many equal-sized bets the spread behaves like. */
  equalBets: number;
  sp: {
    largest: Weighted | null;
    top5: number | null;
    equalBets: number | null;
    /** Filing date of the S&P 500 fund the comparison came from. */
    asOf: string | null;
  };
  sectors: SectorShare[];
  /** Money we cannot place in a company (funds we cannot open, cash inside funds). */
  unplacedPct: number;
  coveragePct: number;
  /** Fund filing dates, oldest first. */
  asOf: string[];
};

/* ── 2. Same stocks inside the funds ───────────────────────────────────── */

export type OverlapCompany = Weighted & {
  directPct: number;
  fundPct: number;
  /** Funds that hold it, biggest share first. */
  via: string[];
};

export type OverlapModule = {
  /** Companies the funds add at least a point to, biggest first. */
  companies: OverlapCompany[];
  /** Fund-by-fund overlap in percent (shared weight, smaller of the two), symmetric with 100 on the diagonal. */
  matrix: { funds: string[]; pct: number[][] } | null;
  /** Funds we cannot open (swaps, bonds, not read yet). */
  closed: string[];
  closedPct: number;
  asOf: string[];
};

/* ── 3. Share of the swings ────────────────────────────────────────────── */

export type SwingShare = Weighted & {
  /** Share of the portfolio's day-to-day swings, percent; the column sums to 100 and a hedge can be negative. */
  share: number;
};

export type DropMark = { pct: number; peak: string; trough: string };

export type RiskModule = {
  sessions: number;
  from: string;
  to: string;
  coveragePct: number;
  /** Holdings left out for too little price history. */
  excluded: string[];
  /** How far the mix moves when the S&P 500 moves 1%, in percent. */
  sensitivity: number;
  /** Typical yearly up-and-down (annualised standard deviation of daily returns), percent. */
  swing: number;
  spSwing: number;
  worstDrop: DropMark;
  spWorstDrop: DropMark;
  /** Today's mix and the S&P 500 over the window, both starting at 100. */
  path: { dates: string[]; book: number[]; sp: number[] };
  shares: SwingShare[];
};

/* ── 4. Names that move as one ─────────────────────────────────────────── */

export type MoveGroup = {
  tickers: string[];
  /** What they are, plural, for "4 chip stocks move as one": "chip stocks", "funds", else "stocks" or "holdings". */
  noun: string;
  weight: number;
  /** Average correlation of daily moves inside the group, -1 to 1. */
  together: number;
};

export type CorrelationModule = {
  sessions: number;
  from: string;
  to: string;
  coveragePct: number;
  /** Heatmap order: tightest groups next to each other. */
  order: HoldingRef[];
  /** Correlations in `order`, two decimals, symmetric, 1 on the diagonal. */
  matrix: number[][];
  groups: MoveGroup[];
  /** The holding that moves least with the rest (weighted average correlation with the others), from three names. */
  steadiest: (HoldingRef & { together: number }) | null;
  /** The two holdings that move most alike. */
  closest: { a: HoldingRef; b: HoldingRef; together: number } | null;
};

/* ── 5. Past crashes ───────────────────────────────────────────────────── */

export type CrashEpisode = {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: "fall" | "rise";
  book: number;
  sp: number | null;
  coveragePct: number;
};

export type CrashDriver = HoldingRef & {
  /** The holding's own move over the window, percent. */
  pct: number;
  /** Points it added to (or took off) the mix's result. */
  contribution: number;
};

export type CrashModule = {
  episodes: CrashEpisode[];
  worst: { id: string; drivers: CrashDriver[] } | null;
};

/* ── 6. What made the money ────────────────────────────────────────────── */

export type AttributionRow = Weighted & { ret: number; contribution: number };

export type AttributionWindow = {
  key: "1m" | "3m" | "ytd";
  label: string;
  book: number;
  sp: number | null;
  coveragePct: number;
  rows: AttributionRow[];
};

export type AttributionModule = { windows: AttributionWindow[]; asOf: string | null };

/* ── 7. Against the S&P ────────────────────────────────────────────────── */

export type LeanKey = "pe" | "growth" | "margin" | "giants" | "gap6m" | "yield";

export type LeanFigure = {
  key: LeanKey;
  label: string;
  book: number;
  sp: number | null;
  unit: "x" | "%" | "pts";
  coveragePct: number;
};

export type LeanModule = { figures: LeanFigure[]; basis: "look-through" | "as-typed"; asOf: string | null };

/* ── 8. What reports soon ──────────────────────────────────────────────── */

export type EarningsDay = { date: string; tickers: Weighted[]; weight: number };

export type EarningsModule = {
  windowDays: number;
  /** Share of the money that reports inside the window. */
  reportingPct: number;
  /** Every day of the window, today first, with what reports. */
  days: EarningsDay[];
  /** When nothing reports inside the window: the next report within 60 days. */
  next: (HoldingRef & { date: string; weight: number }) | null;
};

/* ── 9. Our calls ──────────────────────────────────────────────────────── */

export type CallWordPlain = "Buy more" | "Keep" | "Sell some";

export type CallLevelRow = HoldingRef & {
  call: CallWordPlain;
  weight: number;
  level: number;
  price: number;
  /** (level / price - 1) x 100: how far the price has to move to reach the level. */
  distancePct: number;
};

export type CallsModule = {
  split: { buyMore: number; keep: number; sellSome: number; none: number };
  rows: CallLevelRow[];
  /** Holdings with a level we do not show on this plan. */
  withheld: number;
};

/* ── 10. Income by month ───────────────────────────────────────────────── */

export type IncomeMonth = { month: string; confirmed: number; estimated: number };

export type IncomeModule = {
  months: IncomeMonth[];
  total: number;
  largest: (HoldingRef & { share: number }) | null;
  missingShares: string[];
};

/* ── the whole result ──────────────────────────────────────────────────── */

export type DeepModuleId = "overlap" | "risk" | "correlation" | "crashes" | "attribution" | "lean";

export type PortfolioAnalysis = {
  version: number;
  mode: "mine" | "example";
  /** New York day the prices are from. */
  pricesDay: string | null;
  /** "count" when no holding has a value and every holding counts the same. */
  basis: "value" | "count";
  holdings: number;
  /** True when the market part could not be read this time: the page says so instead of looking complete. */
  partial: boolean;
  /** Holdings with no value while others have one, left out of every share. */
  unvalued: string[];
  concentration: ConcentrationModule | null;
  overlap: OverlapModule | null;
  risk: RiskModule | null;
  correlation: CorrelationModule | null;
  crashes: CrashModule | null;
  attribution: AttributionModule | null;
  lean: LeanModule | null;
  earnings: EarningsModule | null;
  calls: CallsModule | null;
  income: IncomeModule | null;
  /** Free plan: the deeper modules held back, and the funds a Pro look would open. Null when nothing is held back. */
  locked: { modules: DeepModuleId[]; funds: string[] } | null;
};
