import { dayDiff, nextReport, withoutStaleEstimates, type EarningsItem } from "@/lib/calendar-shared";
import { getSeoStockPage } from "@/lib/seo/stock-pages";

/**
 * The index rule for a stock's earnings page (/calendar/earnings/{TICKER}).
 *
 * A page is open to search engines when it says something a template could
 * not: a next report date still ahead (announced, or our estimate from the
 * company's own past report days, said as "expected") AND real figures from
 * the last quarter (EPS against the estimate, revenue, or the stock's move
 * after the report). A page with a date and nothing else, or old numbers and
 * no date, stays noindex.
 *
 * The page's robots tag (app/(app)/calendar/earnings/[ticker]/page.tsx) and
 * the earnings sitemap (lib/seo/sitemap.ts, through lib/calendar.ts
 * loadEarningsPageFacts) both build `EarningsPageFacts` with
 * `earningsPageFacts` from the same stored rows and ask this function, so the
 * two cannot disagree.
 */

/** The last report counts as "last quarter" for this long; past it the page has a date and old news. */
export const LAST_QUARTER_MAX_AGE_DAYS = 135;

export type LastQuarterRevenue = { value: number; yoyPct: number | null };

export type LastQuarter = {
  /** The latest report we hold that has happened. */
  item: EarningsItem;
  /** Revenue from the report's own release (tm_earnings_day), when it was read. */
  revenue: LastQuarterRevenue | null;
};

export type EarningsPageFacts = {
  /** In the covered catalogue (lib/seo/stock-pages.ts): only those pages are ever listed. */
  covered: boolean;
  next: { date: string; estimated: boolean } | null;
  lastQuarter: LastQuarter | null;
};

/** The latest report that has happened (before today, or today once its result is in), if it is recent enough. */
export function lastQuarterOf(events: EarningsItem[], today: string, revenueFor?: (date: string) => LastQuarterRevenue | null): LastQuarter | null {
  const done = events
    .filter((item) => !item.estimated && (item.date < today || (item.date === today && item.epsActual !== null)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const item = done[0];
  if (!item) return null;
  const age = dayDiff(item.date, today);
  if (age === null || age > LAST_QUARTER_MAX_AGE_DAYS) return null;
  return { item, revenue: revenueFor?.(item.date) ?? null };
}

/** True when the last quarter carries at least one real figure. */
export function lastQuarterHasData(last: LastQuarter | null | undefined): last is LastQuarter {
  if (!last) return false;
  return last.item.epsActual !== null || last.item.reaction !== null || (last.revenue !== null && Number.isFinite(last.revenue.value));
}

/** The facts the index rule reads, from a company's stored rows (estimates included, normalised with `estimates: true`). */
export function earningsPageFacts(
  ticker: string,
  events: EarningsItem[],
  today: string,
  revenueFor?: (date: string) => LastQuarterRevenue | null,
): EarningsPageFacts {
  const usable = withoutStaleEstimates(events, today);
  const next = nextReport(usable, today);
  return {
    covered: getSeoStockPage(ticker) !== null,
    next: next ? { date: next.date, estimated: next.estimated === true } : null,
    lastQuarter: lastQuarterOf(usable, today, revenueFor),
  };
}

/** The rule itself. */
export function earningsPageIsIndexable(facts: EarningsPageFacts | null | undefined, today: string): boolean {
  if (!facts || !facts.covered || !facts.next || facts.next.date < today) return false;
  return lastQuarterHasData(facts.lastQuarter);
}
