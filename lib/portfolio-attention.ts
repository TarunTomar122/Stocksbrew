import type { EarningsDate, PortfolioPosition } from "@/lib/portfolio-shared";

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

/** The rows that need a look first, each group keeping the order it came in (the table's default sort). */
export function attentionFirst<T extends Pick<PortfolioPosition, "needsAttention" | "nextEarnings" | "price" | "zone">>(rows: T[], today: string): T[] {
  const first: T[] = [];
  const rest: T[] = [];
  for (const row of rows) (needsLook(row, today) ? first : rest).push(row);
  return [...first, ...rest];
}
