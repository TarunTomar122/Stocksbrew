import type { MemoWeek } from "./week";

/**
 * Shapes shared by the memo's rules (facts.ts, build.ts), its wording
 * (word.ts), the server loaders and the page. Pure types only.
 */

export type DailySeries = { dates: string[]; closes: number[] };

export type CallWord = "Add" | "Hold" | "Trim";

export type MemoSubject = "mine" | "example";

export type MemoHolding = {
  ticker: string;
  /** Short company name, "Microsoft". */
  name: string;
  instrumentId: string;
  /** Shares held, or shares implied by an entered value. Null when we only know the stock is held. */
  units: number | null;
  fund: boolean;
  /** Whether the reasons behind its call and moves may be shown to this viewer. */
  covered: boolean;
};

export type MemoCall = { ticker: string; date: string; from: CallWord | null; to: CallWord; text: string | null };

export type MemoMove = { ticker: string; day: string; pct: number; headline: string; why: string | null };

export type MemoReport = {
  ticker: string;
  /** Earnings date, YYYY-MM-DD. */
  day: string;
  verdict: "beat" | "miss" | "in_line" | "pending" | "no_estimate" | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueYoyPct: number | null;
  guidance: "raised" | "lowered" | "mixed" | "narrowed" | "reaffirmed" | "issued" | "none" | null;
  reactionPct: number | null;
  reactionBasis: "next_session" | "report_day" | "after_hours" | "premarket" | "so_far_today" | null;
  typicalAbsPct: number | null;
};

export type MemoUpcoming = { ticker: string; date: string; time: "bmo" | "amc" | "during" | null; typicalAbsPct: number | null };

export type MemoFundMove = {
  ticker: string;
  fund: string;
  slug: string;
  action: "new" | "added" | "trimmed" | "sold";
  /** Change in shares against the prior filing, percent; null for new positions, exits and unknowns. */
  changePct: number | null;
  filedDate: string;
};

export type MemoInsider = {
  ticker: string;
  insider: string;
  action: "buy" | "sell";
  valueUsd: number | null;
  planned: boolean;
  filedDate: string;
};

export type MemoCongress = {
  ticker: string;
  person: string;
  action: "buy" | "sell";
  amountLow: number | null;
  amountHigh: number | null;
  disclosureDate: string;
};

export type MemoExposure = {
  /** The single company with the largest share once funds are opened up. */
  company: { ticker: string; name: string; pct: number; fundPct: number; via: string[] } | null;
  sector: { sector: string; pct: number; benchmarkPct: number | null } | null;
  /** Newest fund filing the look-through used. */
  asOf: string | null;
};

export type MemoDividend = {
  ticker: string;
  name: string;
  /** Null for a stock kept only for its payout ratio (no announced payment in the window). */
  exDate: string | null;
  payDate: string | null;
  perShare: number | null;
  amount: number | null;
  /** Regular payment against a year earlier, percent. */
  changePct: number | null;
  atRisk: boolean;
  payout: number | null;
};

export type MemoStress = { name: string; start: string; end: string; portfolio: number; market: number };

/** A reason the person gave for owning a stock that the reason watcher (lib/thesis-watch) found weaker or broken. */
export type MemoReason = {
  ticker: string;
  verdict: "weaker" | "broken";
  /** The watcher's first finding, one or two sentences with its figures. */
  finding: string;
  source: string;
  asOf: string;
  data: Record<string, string | number | null>;
};

export type MemoInputs = {
  week: MemoWeek;
  /** New York day the memo is written. */
  today: string;
  subject: MemoSubject;
  holdings: MemoHolding[];
  /** Adjusted daily closes by ticker. */
  series: Map<string, DailySeries>;
  /** The S&P 500 (SPY) closes. */
  benchmark: DailySeries | null;
  calls: MemoCall[];
  moves: MemoMove[];
  reports: MemoReport[];
  upcoming: MemoUpcoming[];
  funds: MemoFundMove[];
  insiders: MemoInsider[];
  congress: MemoCongress[];
  /** Portfolio-shape facts are about today's holdings, so only the current week has them. */
  exposure: MemoExposure | null;
  dividends: MemoDividend[];
  stress: MemoStress | null;
  /** Reasons that weakened or broke; about today's holdings, so only the current week has them. */
  reasons?: MemoReason[];
};

export type MemoSection = "changed" | "hurt" | "look";

export type MemoTone = "up" | "down" | "flat";

export type FactKind =
  | "performance"
  | "drivers"
  | "call"
  | "move"
  | "report"
  | "upcoming"
  | "upcoming_risk"
  | "fund"
  | "insider"
  | "congress"
  | "concentration"
  | "sector"
  | "dividend"
  | "dividend_risk"
  | "stress"
  | "reason";

export type MemoFact = {
  /** Stable within a week: "call:AAPL:2026-11-05". */
  id: string;
  kind: FactKind;
  section: MemoSection;
  /** Higher first inside a section. */
  rank: number;
  tickers: string[];
  /** The rule-written item: one or two full sentences. */
  text: string;
  /** The same fact as a clause for the top line, no full stop: "Costco reports on Thursday". */
  short: string;
  href: string;
  linkLabel: string;
  tone: MemoTone;
  /** Where the facts come from, in words. */
  source: string;
  /** Day the data is from, YYYY-MM-DD. */
  asOf: string;
  /** The values behind the sentence: what the model is shown and what the numbers check accepts. */
  data: Record<string, string | number | null>;
  /** Reasons this fact left out because the viewer's plan does not cover the stock. */
  heldBack?: number;
  /** The figure and short line the page shows; the text goes behind "Why". */
  card?: MemoItemCard | null;
};

/**
 * A small picture beside a card's figure, from the same values as its sentence:
 * - share: a part of the whole (a sector's share of the portfolio), with the S&P 500's share when known;
 * - pair: the portfolio and the S&P 500 over the same stretch, in percent (a past shock).
 */
export type MemoVisual =
  | { kind: "share"; pct: number; benchmarkPct: number | null; label: string }
  | { kind: "pair"; portfolio: number; market: number };

/**
 * The card form of a fact, for the page: one figure and a short line that reads on from it
 * ("56%" / "of the portfolio is in Technology, against 37% of the S&P 500"). The long sentence
 * stays as the item's text, behind a "Why" toggle.
 */
export type MemoItemCard = {
  /** One figure, as printed: "56%", "−9.5%", "$24.1M", "Nov 17". */
  figure: string;
  /** Ten words or fewer, written to follow the figure. */
  label: string;
  /** "up" or "down" when the figure is a gain or a loss; colours the figure, nothing else. */
  sign?: "up" | "down" | null;
  visual?: MemoVisual | null;
};

export type MemoItem = {
  id: string;
  kind: FactKind;
  text: string;
  href: string;
  linkLabel: string;
  tone: MemoTone;
  tickers: string[];
  source: string;
  asOf: string;
  /** Missing on memos written before the page went visual. */
  card?: MemoItemCard | null;
};

/** One day on the week's chart: percent from the close before Monday. */
export type MemoCurvePoint = { day: string; portfolio: number; market: number | null };

/** A holding's share of the week's move. */
export type MemoMover = {
  ticker: string;
  name: string;
  /** The stock's own move over the week, percent. */
  pct: number;
  /** Percentage points of the portfolio's move. */
  points: number;
  /** Where a tap goes: why it moved that week, its earnings report, or the stock. */
  href: string;
};

/** A call that ended the week different from how it started. */
export type MemoCallChange = { ticker: string; name: string; from: CallWord; to: CallWord; date: string };

/**
 * What the visual page draws, kept with the memo so a stored week shows the
 * same picture it was written with. Every value comes from the facts above.
 */
export type MemoView = {
  /** Twelve words or fewer: "Up 1.2% this week, 0.8 points behind the S&P 500". */
  headline: string;
  portfolioPct: number | null;
  marketPct: number | null;
  /** The close before Monday first (at 0), then each close in the week. Empty when the week cannot be priced. */
  curve: MemoCurvePoint[];
  /** Up to three that helped most, then up to three that hurt most. */
  movers: MemoMover[];
  calls: MemoCallChange[];
  /** Holdings the week's figure leaves out, and why, in one sentence; null when none. */
  footnote: string | null;
};

export type Memo = {
  version: number;
  weekKey: string;
  monday: string;
  friday: string;
  /** Last close the memo is built on. */
  endDay: string | null;
  complete: boolean;
  subject: MemoSubject;
  /** How the week went, then (on a partial week) who is left out and why, then the one thing to look at. */
  topLine: string;
  /**
   * The week's return as its own item. Not listed under "What changed" (the top line says it), but kept for
   * readers that want it alone, such as the memo share card. Older stored memos carry it in `changed` instead.
   */
  week?: MemoItem | null;
  changed: MemoItem[];
  hurt: MemoItem[];
  look: MemoItem[];
  /** Reasons held back on stocks this viewer's plan does not cover (calls and moves). */
  heldBack: number;
  /** "rules" when every sentence is the rules' own, "model" when a model worded any of it. */
  wordedBy: "rules" | "model";
  /** ISO time it was written. */
  writtenAt: string;
  /** The page's charts and tables. Missing on memos written before the page went visual. */
  view?: MemoView | null;
};

export const MEMO_VERSION = 1;
