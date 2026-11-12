import { fin } from "@/lib/insight-format";
import type { ChartPoint } from "@/lib/stock-chart";

/**
 * Numbers for the "why it moved" page. The reason itself is the stored,
 * sourced explanation; the close that day and what the stock did next come
 * from stored prices, by rule.
 */

export type DayClose = { close: number; pct: number };

/** The close on `day` and its change from the close before, or null when the series does not hold that day. */
export function closeOn(series: readonly ChartPoint[] | undefined, day: string): DayClose | null {
  if (!series) return null;
  const index = series.findIndex((point) => point.date === day);
  if (index < 1) return null;
  const close = series[index]!.close;
  const before = series[index - 1]!.close;
  if (!fin(close) || !fin(before) || before <= 0) return null;
  return { close, pct: (close / before - 1) * 100 };
}

/** The change from the close on `day` to the latest close after it, or null when no later close is held. */
export function sinceClose(series: readonly ChartPoint[] | undefined, day: string): { pct: number; date: string; close: number } | null {
  if (!series || series.length === 0) return null;
  const at = series.find((point) => point.date === day);
  const last = series[series.length - 1]!;
  if (!at || last.date <= day || !fin(at.close) || at.close <= 0) return null;
  return { pct: (last.close / at.close - 1) * 100, date: last.date, close: last.close };
}
