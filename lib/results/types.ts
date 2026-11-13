/**
 * Results night: the short, dated read the agent writes when a covered stock
 * reports. Pure types and constants, no server imports, so the stock page,
 * the inbox, the briefing and the earnings season planner can all share them.
 *
 * Every figure carries where it came from and when:
 * - EPS and the estimate it is compared with: one provider's pair from
 *   `tm_earnings_events` (Nasdaq's calendar, or Alpha Vantage / Yahoo when the
 *   actuals job filled the row). Both numbers come from the same provider, so
 *   they are on the same basis.
 * - Revenue and the outlook: the company's own 8-K release, only when the
 *   earnings day job (`tm_earnings_day`) read it. Revenue is compared with the
 *   same quarter a year ago, and with Yahoo Finance's analyst estimate when the
 *   job could tie that estimate to this quarter.
 * - The move: daily closes (`tm_price_history_daily`) once the session is
 *   over, the live quote (`tm_latest_prices`) while it runs, or the pre-market
 *   quote before the open. The usual report move is the median of the
 *   stock's earlier report moves (lib/earnings-season.ts).
 * - The call: the steady call's state (`tm_call_stability`), which treats a
 *   results report as a hard reason to move.
 */

import type { Session } from "@/lib/calendar-shared";

/** How long after a report its read stays on the stock page and in the planner. */
export const RESULTS_DAYS = 10;

export type ResultVerdict = "beat" | "miss" | "in_line";

export type ResultEps = {
  actual: number;
  expected: number;
  verdict: ResultVerdict;
  /** (actual − expected) / |expected| in percent; null when the estimate is zero. */
  surprisePct: number | null;
  /** Who reported both numbers ("Nasdaq earnings calendar"). */
  source: string;
  /** When we stored the actual, ISO. */
  asOf: string | null;
};

export type ResultRevenue = {
  value: number;
  /** Change from the same quarter a year ago, percent. Always there: a revenue without its year-ago figure is not shown. */
  yoyPct: number | null;
  /**
   * The analysts' average revenue estimate for the quarter (Yahoo Finance), only when the earnings day job matched it
   * to this quarter by its year-ago revenue; else null.
   */
  expected: number | null;
  /** Beat, miss or in line against `expected`, judged on the unrounded surprise; null without an estimate. */
  verdict: ResultVerdict | null;
  /** (value − expected) / expected in percent, unrounded; null without an estimate. */
  surprisePct: number | null;
  source: string;
  url: string | null;
  asOf: string | null;
};

export type ResultGuidance = {
  change: "raised" | "lowered" | "mixed" | "narrowed" | "reaffirmed" | "issued";
  /** The range that matters most, in words ("Fiscal 2027 revenue $7.98B to $8.18B"), or null. */
  first: string | null;
  /** That item's previous range, when the release or the last report states it ("$7.90B to $8.10B"), or null. */
  previous: string | null;
  /** The outlook is for the full year (the lead item's period, or the release's own headline: "Raises Full-Year Outlook"). */
  fullYear?: boolean;
  source: string;
  url: string | null;
  asOf: string | null;
};

/**
 * Which window the move covers:
 * - `before_open`: the pre-market quote on the reaction day;
 * - `today`: the live quote on the reaction day, while the session runs;
 * - `day`: the whole reaction session (closed);
 * - `two_days`: the report time is unknown, so the close before to the close after;
 * - `after_hours`: after an after-close report, the after-hours print against that day's close, until the reaction
 *   session opens (`day` is the report day). Thin trading: always said as "after hours".
 */
export type ResultMoveKind = "before_open" | "today" | "day" | "two_days" | "after_hours";

export type ResultMove = {
  pct: number;
  kind: ResultMoveKind;
  /** The session the move belongs to (New York day). */
  day: string;
  /** The report came out after the close, so the move is the session after the report day. */
  nextDay: boolean;
  /** Size of the stock's usual move after a report (no sign), or null with fewer than MIN_USUAL reports. */
  usualPct: number | null;
  usualCount: number;
  source: string;
  asOf: string | null;
  /**
   * The price the move ended at, when known: the print's own price for a move outside the session (`before_open`,
   * `after_hours`), the live or last quote's for a session's move read from the quote.
   */
  price?: number | null;
};

export type ResultCallWord = "Buy more" | "Keep" | "Sell some";

export type ResultCall =
  | { status: "changed"; call: ResultCallWord; from: ResultCallWord; on: string; reason: string | null; asOf: string | null }
  | { status: "held"; call: ResultCallWord; asOf: string | null }
  /** The call has not had its run since the results came out. */
  | { status: "pending"; call: ResultCallWord; asOf: string | null };

export type ResultSource = { label: string; source: string; url: string | null; at: string | null };

export type ResultRead = {
  ticker: string;
  /** Short company name from the calendar ("Take-Two Interactive"). */
  company: string;
  /** The calendar's report day, New York. */
  reportDate: string;
  session: Session;
  /** "fiscal Q2 2027", from the release, when the earnings day job read it. */
  period: string | null;
  eps: ResultEps | null;
  revenue: ResultRevenue | null;
  guidance: ResultGuidance | null;
  move: ResultMove | null;
  call: ResultCall | null;
  /** The earnings day report page, when one exists. */
  reportHref: string | null;
  sources: ResultSource[];
};

/** The bit of a read the briefing, the inbox and the planner need: one fact and one sentence. */
export type ResultSummary = {
  ticker: string;
  reportDate: string;
  tone: "up" | "down" | "flat";
  fact: string;
  sentence: string;
  call: string | null;
};

/**
 * The clauses of a report a "Biggest things" card can say (lib/biggest.ts), kept apart so the card can drop the least
 * telling ones to fit its 15 words, and the reaction can be worked out against the move the card itself shows (an
 * after-hours or pre-market print can stand in for the read's own move). Plain JSON: it rides on a cached inbox item.
 */
export type ResultCardFacts = {
  /** "EPS was $5.06 vs $3.90 expected"; null without an EPS pair. */
  eps: string | null;
  /** Revenue, longest first: "revenue rose 55% to $211M", "revenue rose 55%"; null without a year-ago revenue. */
  revenue: string[] | null;
  /** "the full-year outlook was raised"; null when the release states none. */
  guidance: string | null;
  /** The stock's usual move after a report (no sign), only with at least MIN_USUAL earlier reports measured. */
  usualPct: number | null;
};
