import { sortPositions, type EarningsDate, type PortfolioPosition, type SortKey } from "@/lib/portfolio-shared";

/**
 * Which rows in the holdings and watching tables need a look, so they sit on top by default (owner, Nov 12: "show
 * the highlighted ones on top cz they need attention"). Same lines as the My stocks cards (lib/portfolio-home/stocks.ts
 * REPORT_SOON_DAYS and NEAR_LEVEL_PCT), so a stock a card flags is also one the table lifts. Pure, so it can be tested.
 */

/** A report this many days ahead or closer is soon: the date the table prints in orange. */
export const REPORT_SOON_DAYS = 7;
/** How close the price must be to the call's level to count, percent of the price. */
export const NEAR_LEVEL_PCT = 3;

function daysFrom(today: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The next report is today or within REPORT_SOON_DAYS. A past date is not soon. */
export function reportSoon(next: EarningsDate | null | undefined, today: string): boolean {
  if (!next?.date) return false;
  const gap = daysFrom(today, next.date);
  return Number.isFinite(gap) && gap >= 0 && gap <= REPORT_SOON_DAYS;
}

/** The price is at or through its call's level, or within NEAR_LEVEL_PCT of it: Buy more from above, Sell some from below. */
export function nearCallLevel(position: Pick<PortfolioPosition, "price" | "zone">): boolean {
  const { price, zone } = position;
  if (!zone || price === null || !Number.isFinite(price) || price <= 0 || !(zone.level > 0)) return false;
  if (zone.tone === "bull") return ((price - zone.level) / price) * 100 <= NEAR_LEVEL_PCT;
  if (zone.tone === "bear") return ((zone.level - price) / price) * 100 <= NEAR_LEVEL_PCT;
  return false;
}

/** Anything the row already highlights: the zone tint, an orange report date, or a price at its call's level. */
export function needsLook(position: Pick<PortfolioPosition, "needsAttention" | "nextEarnings" | "price" | "zone">, today: string): boolean {
  return position.needsAttention || reportSoon(position.nextEarnings, today) || nearCallLevel(position);
}

/**
 * The rows that need a look first, each group keeping the order it came in (the table's default sort). The highlighted
 * rows (the zone tint: the price is inside its call's zone) always lead, then the other rows that need a look (an
 * orange report date, a price near its level), then the rest. Owner, Nov 12: on Watching most names sit within 3% of
 * their level, so with one group the tinted PLTR and META landed at the bottom of it.
 */
export function attentionFirst<T extends Pick<PortfolioPosition, "needsAttention" | "nextEarnings" | "price" | "zone">>(rows: T[], today: string): T[] {
  const tinted: T[] = [];
  const look: T[] = [];
  const rest: T[] = [];
  for (const row of rows) (row.needsAttention ? tinted : needsLook(row, today) ? look : rest).push(row);
  return [...tinted, ...look, ...rest];
}

/**
 * The order the Holdings and Watching lists show, and what their sort control says about it, so the two always agree.
 * - The person picked a column: exactly that column's sort (`lookFirst` false).
 * - Nothing picked and some row in the whole list needs a look: the highlighted rows, then the other rows that need a
 *   look, then the rest (attentionFirst), each group in the default sort, with no column arrow; the phone select says
 *   "Suggested" (`lookFirst` true).
 * - Nothing picked and no row needs a look: exactly the default column's sort, labelled and arrowed as that column
 *   (`lookFirst` false).
 * `every` is the whole list when `rows` is a filtered part of it, so a filter never flips the label.
 */
export function orderPositions(
  rows: PortfolioPosition[],
  sort: { key: SortKey; direction: "asc" | "desc" },
  picked: boolean,
  today: string,
  every: PortfolioPosition[] = rows,
): { lookFirst: boolean; rows: PortfolioPosition[] } {
  const plain = sortPositions(rows, sort.key, sort.direction);
  const lookFirst = !picked && every.some((row) => needsLook(row, today));
  return { lookFirst, rows: lookFirst ? attentionFirst(plain, today) : plain };
}
