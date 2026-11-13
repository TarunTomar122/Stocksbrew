/**
 * The facts a company had on a past day, for the replay: no hindsight. Pure.
 *
 * A company's stored history is loaded once (lib/basket-agent/data.ts) as dated records, and `factsAsOf` builds the
 * reason watcher's facts (lib/thesis-watch/facts.ts) for any day from only the records known on or before it:
 * - closes on or before the day (and the S&P 500's, for a fall against the market);
 * - the weekly metrics snapshot taken on or before it (revenue growth, analysts' estimates, P/E, payout), and the
 *   P/E's place in the snapshots before it;
 * - our calls, dividends, insider and fund filings, explained moves and headlines dated on or before it, each by the
 *   day it could first be read (a move's explanation by the day it was written, a filing by the day it was filed);
 * - an earnings report's guidance from its report day;
 * - a fiscal year's revenue only from 90 days after the calendar year it is named for, since the stored years carry
 *   no filing date.
 * Anything else the live check reads (the sector's spread of revenue growth, the next earnings date, cash flow and net
 * income) has no dated history, so the replay leaves it unknown. A rule never treats unknown as a zero.
 */

import {
  addDays,
  bigDropOf,
  callFacts,
  closeOn,
  daysBetween,
  dividendFacts,
  emptyFacts,
  namesTrouble,
  priorYearGrowth,
  quantile,
  recentClosesOn,
  type DividendPayment,
  type StockFacts,
  type YearFigures,
} from "@/lib/thesis-watch/facts";

import type { TickerFacts } from "./check";

export type Series = { dates: string[]; closes: number[] };

export type MetricsSnapshot = {
  /** The day the snapshot was taken. */
  day: string;
  revenueGrowth: number | null;
  epsNextYearGrowth: number | null;
  epsGrowth: number | null;
  pe: number | null;
  payout: number | null;
  marketCap: number | null;
  sector: string | null;
};

export type TickerHistory = {
  ticker: string;
  instrumentId: string;
  name: string;
  series: Series | null;
  metrics: MetricsSnapshot[];
  /** Yearly results, newest first ("TTM", "FY 2025", …): undated, see `knownYears`. */
  years: YearFigures[];
  calls: Array<{ date: string; stance: string }>;
  /** Past payments by ex-date. How often it pays is worked out from them for each day (`perYearAsOf`). */
  dividends: { payments: DividendPayment[] } | null;
  /** Insider sales outside pre-arranged plans, by the day they were filed. */
  insiderSales: Array<{ day: string; usd: number }>;
  /** A tracked fund that halved the position or sold out, by the day the 13F was filed. */
  fundCuts: Array<{
    day: string;
    fund: string;
    href: string;
    action: "trimmed" | "sold";
    changePct: number | null;
  }>;
  /** Explained moves: `day` the move, `known` the day the explanation was written (null: no date, never read). */
  moves: Array<{
    day: string;
    known: string | null;
    pct: number;
    headline: string;
    href: string;
  }>;
  /** Labelled headlines by the day they were published. */
  news: Array<{ day: string; tone: "positive" | "negative" | "neutral" }>;
  /** Earnings reports by report day. */
  reports: Array<{ day: string; guidance: string | null; href: string }>;
};

/* Windows, the same as the live loader (lib/thesis-watch/data.ts). */
export const NEWS_DAYS = 14;
export const TROUBLE_DAYS = 30;
export const INSIDER_DAYS = 30;
export const FUND_DAYS = 45;
/** P/E snapshots needed before its place in its own past means anything. */
export const PE_MIN_POINTS = 20;
/** Sessions in "a month" for a trade's figure. */
export const MONTH_SESSIONS = 21;
/** Days after the end of the calendar year a fiscal year is named for before its results count as known. */
export const YEAR_KNOWN_DAYS = 90;

const fin = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function emptyHistory(
  ticker: string,
  instrumentId: string,
  name: string,
): TickerHistory {
  return {
    ticker,
    instrumentId,
    name,
    series: null,
    metrics: [],
    years: [],
    calls: [],
    dividends: null,
    insiderSales: [],
    fundCuts: [],
    moves: [],
    news: [],
    reports: [],
  };
}

/** The yearly rows a person could have read on `day`: fiscal years from 90 days after their calendar year, never the trailing twelve months. */
export function knownYears(
  years: readonly YearFigures[],
  day: string,
): YearFigures[] {
  return years.filter((year) => {
    const match = /^FY\s*(\d{4})$/i.exec(year.label.trim());
    if (!match) return false;
    return addDays(`${match[1]}-12-31`, YEAR_KNOWN_DAYS) <= day;
  });
}

/** The move over about a month of sessions up to `day`, percent, or null with too little history. */
export function monthMove(
  series: Series | null,
  day: string,
  sessions = MONTH_SESSIONS,
): number | null {
  if (!series) return null;
  let end = series.dates.length - 1;
  while (end >= 0 && series.dates[end]! > day) end -= 1;
  const start = end - sessions;
  if (end < 0 || start < 0) return null;
  const now = series.closes[end]!;
  const then = series.closes[start]!;
  return now > 0 && then > 0 ? (now / then - 1) * 100 : null;
}

/**
 * How many regular payments a year, from the payments that went ex on or before `day`: the middle gap between the
 * last few, as 1, 2, 4 or 12. Null with fewer than three, so a stopped dividend is not judged on a guess.
 */
export function perYearAsOf(
  payments: readonly DividendPayment[],
  day: string,
): number | null {
  const dates = payments
    .filter((payment) => !payment.special && payment.exDate <= day)
    .map((payment) => payment.exDate)
    .sort()
    .slice(-7);
  if (dates.length < 3) return null;
  const gaps = dates
    .slice(1)
    .map((date, index) => daysBetween(dates[index]!, date))
    .sort((a, b) => a - b);
  const gap = gaps[Math.floor(gaps.length / 2)]!;
  if (gap <= 0) return null;
  const guess = 365 / gap;
  return [12, 4, 2, 1].reduce((best, option) =>
    Math.abs(option - guess) < Math.abs(best - guess) ? option : best,
  );
}

/** Regular dividends that went ex in the year to `day`, over the close: the trailing yield, percent. */
export function trailingYield(
  dividends: TickerHistory["dividends"],
  close: number | null,
  day: string,
): number | null {
  if (!dividends || !close || close <= 0) return null;
  const from = addDays(day, -365);
  const paid = dividends.payments
    .filter(
      (payment) =>
        !payment.special &&
        payment.exDate > from &&
        payment.exDate <= day &&
        fin(payment.amount),
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  return paid > 0 ? (paid / close) * 100 : null;
}

/** The P/E's place among the snapshots on or before `day` (0 to 100), and their middle; null with too few. */
export function peStanding(
  metrics: readonly MetricsSnapshot[],
  day: string,
): { percentile: number; median: number } | null {
  const known = metrics
    .filter((row) => row.day <= day && fin(row.pe) && row.pe > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (known.length < PE_MIN_POINTS) return null;
  const now = known[known.length - 1]!.pe!;
  const pes = known.map((row) => row.pe!);
  const below = pes.filter((pe) => pe < now).length;
  return {
    percentile: (below / pes.length) * 100,
    median: quantile(pes, 0.5)!,
  };
}

/**
 * The facts for `ticker` on `day`, built only from records dated on or before it. `market` is the S&P 500's closes
 * (SPY), read the same way.
 */
export function factsAsOf(
  history: TickerHistory,
  day: string,
  market: Series | null,
): TickerFacts {
  const facts: StockFacts = emptyFacts(
    history.ticker,
    history.instrumentId,
    history.name,
    day,
  );
  const series = history.series;
  facts.close = closeOn(series, day);
  facts.recentCloses = recentClosesOn(series, day);

  const snapshot =
    history.metrics
      .filter((row) => row.day <= day)
      .sort((a, b) => b.day.localeCompare(a.day))[0] ?? null;
  if (snapshot) {
    facts.sector = snapshot.sector;
    facts.revenueGrowth = snapshot.revenueGrowth;
    facts.epsNextYearGrowth = snapshot.epsNextYearGrowth;
    facts.epsGrowth = snapshot.epsGrowth;
    facts.pe = fin(snapshot.pe) && snapshot.pe > 0 ? snapshot.pe : null;
    facts.payout = snapshot.payout;
    facts.marketCap = snapshot.marketCap;
  }
  const standing = facts.pe !== null ? peStanding(history.metrics, day) : null;
  if (standing) {
    facts.pePercentile = standing.percentile;
    facts.peMedian = standing.median;
  }

  const prior = priorYearGrowth(knownYears(history.years, day));
  if (prior) {
    facts.revenueGrowthPrior = prior.pct;
    facts.priorLabel = prior.label;
  }

  Object.assign(facts, callFacts(history.calls, day));
  if (history.dividends)
    Object.assign(
      facts,
      dividendFacts(
        history.dividends.payments,
        perYearAsOf(history.dividends.payments, day),
        day,
      ),
    );
  facts.divYield = trailingYield(
    history.dividends,
    facts.close?.value ?? null,
    day,
  );

  const report = history.reports
    .filter((row) => row.day <= day)
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  if (report?.guidance)
    facts.guidance = {
      change: report.guidance,
      day: report.day,
      href: report.href,
    };

  const insiderFrom = addDays(day, -INSIDER_DAYS);
  const sales = history.insiderSales.filter(
    (sale) => sale.day >= insiderFrom && sale.day <= day && fin(sale.usd),
  );
  if (sales.length > 0)
    facts.insiderSales = {
      usd: sales.reduce((sum, sale) => sum + sale.usd, 0),
      count: sales.length,
    };

  const fundFrom = addDays(day, -FUND_DAYS);
  const cuts = history.fundCuts.filter(
    (cut) => cut.day >= fundFrom && cut.day <= day,
  );
  const cut =
    cuts.find((entry) => entry.action === "sold") ??
    cuts.sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))[0];
  if (cut)
    facts.fundCut = {
      fund: cut.fund,
      href: cut.href,
      action: cut.action,
      changePct: cut.changePct,
      day: cut.day,
    };

  // A move counts from the day its explanation was written, not the day of the move.
  const known = history.moves.filter(
    (move) => move.day <= day && move.known !== null && move.known <= day,
  );
  const troubleFrom = addDays(day, -TROUBLE_DAYS);
  const trouble = known
    .filter(
      (move) =>
        move.day >= troubleFrom && move.pct < 0 && namesTrouble(move.headline),
    )
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  if (trouble)
    facts.trouble = {
      day: trouble.day,
      pct: trouble.pct,
      headline: trouble.headline,
      href: trouble.href,
    };
  const explained = new Set(known.map((move) => move.day));
  facts.bigDrop = bigDropOf(
    series,
    day,
    (moveDay) => explained.has(moveDay),
    market,
  );

  const newsFrom = addDays(day, -NEWS_DAYS);
  const news = history.news.filter(
    (row) => row.day >= newsFrom && row.day <= day,
  );
  if (news.length > 0)
    facts.news = {
      labelled: news.length,
      negative: news.filter((row) => row.tone === "negative").length,
    };

  return { facts, ret1m: monthMove(series, day) };
}

/** Days between two YYYY-MM-DD days (re-exported for the replay's notes). */
export { daysBetween };
