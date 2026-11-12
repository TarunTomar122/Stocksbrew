import { fin, median } from "@/lib/insight-format";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * Group figures for the sector pages (/sectors and /sectors/[slug]), from the
 * screener snapshot: the market-value weighted change, members ranked by a
 * period, how our calls split, and the median P/E.
 */

type Period = "day_pct" | "ret_1m" | "ret_ytd";

/** Market-value weighted change over a period, among members that have both numbers. */
export function weightedChange(rows: readonly ScreenerRow[], period: Period): number | null {
  let weight = 0;
  let sum = 0;
  for (const row of rows) {
    const value = row[period];
    if (!fin(value) || !fin(row.market_cap) || row.market_cap <= 0) continue;
    weight += row.market_cap;
    sum += value * row.market_cap;
  }
  return weight > 0 ? sum / weight : null;
}

/** The members with a number for the period, best first. */
export function ranked(rows: readonly ScreenerRow[], period: Period): ScreenerRow[] {
  return rows.filter((row) => fin(row[period])).sort((a, b) => (b[period] as number) - (a[period] as number));
}

export function callCounts(rows: readonly ScreenerRow[]): { Add: number; Hold: number; Trim: number; total: number } {
  const counts = { Add: 0, Hold: 0, Trim: 0, total: 0 };
  for (const row of rows) {
    if (row.call === "Add" || row.call === "Hold" || row.call === "Trim") {
      counts[row.call] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** The median trailing P/E of a group (positive earnings only), with how many stocks it is drawn from. */
export function medianPe(rows: readonly ScreenerRow[]): { value: number; count: number } | null {
  const values = rows.map((row) => row.pe).filter((value): value is number => fin(value) && value > 0);
  const value = median(values);
  return value === null ? null : { value, count: values.length };
}
