import { unstable_cache } from "next/cache";

import { getScreenerRows } from "@/lib/screener";
import { BASKET_RANGES, indexReturn, overlaySeries, rangeStart, thinAligned, type BasketRangeKey, type IndexPoint } from "@/lib/screener-basket";
import { getDailySeries } from "@/lib/screener-series";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * Server loaders for the compare desk. The numbers and our call come from the
 * screening snapshot (one row per stock) and the chart from stored daily
 * closes. Nothing is generated at request time.
 *
 * `lib/compare-stocks.ts` is the older per-request loader the MCP server and
 * the REST API still use; it is left as it is.
 */

export type CompareChartRange = {
  key: BasketRangeKey;
  label: string;
  startDate: string;
  endDate: string;
  /** One rebased line per symbol (100 on the start date), on a shared calendar. */
  series: Array<{ symbol: string; points: IndexPoint[]; pct: number | null }>;
};

export type CompareChart = { ranges: CompareChartRange[]; source: string; lastDate: string | null; missing: string[] };

const CHART_POINTS = 170;
const COMPARE_RANGE_KEYS: BasketRangeKey[] = ["1M", "6M", "YTD", "1Y", "5Y", "MAX"];

async function buildChart(symbols: readonly string[]): Promise<CompareChart> {
  const { series, source, lastDate } = await getDailySeries(symbols);
  const have = symbols.filter((symbol) => series[symbol]);
  const missing = symbols.filter((symbol) => !series[symbol]);
  const ranges: CompareChartRange[] = [];
  if (lastDate && have.length >= 1) {
    const input = Object.fromEntries(have.map((symbol) => [symbol, series[symbol]!]));
    for (const key of COMPARE_RANGE_KEYS) {
      const range = BASKET_RANGES.find((item) => item.key === key)!;
      const result = overlaySeries(input, rangeStart(key, lastDate));
      // Only offer a window every name covers; "Max" is the history they share.
      if (!result || result.excluded.length > 0) continue;
      const previous = ranges[ranges.length - 1];
      if (key === "MAX" && previous && previous.startDate <= result.startDate) continue;
      ranges.push({
        key,
        label: range.label,
        startDate: result.startDate,
        endDate: result.endDate,
        series: have.map((symbol) => ({
          symbol,
          points: thinAligned(result.series[symbol]!, CHART_POINTS),
          pct: indexReturn(result.series[symbol]!),
        })),
      });
    }
  }
  return { ranges, source, lastDate, missing };
}

export type CompareData = {
  symbols: string[];
  /** One entry per symbol, null when the stock is not in our coverage. */
  rows: Array<ScreenerRow | null>;
  chart: CompareChart;
};

export async function getCompareData(symbols: readonly string[]): Promise<CompareData> {
  const list = [...symbols];
  const [rowMap, chart] = await Promise.all([
    getScreenerRows(list).catch(() => new Map<string, ScreenerRow>()),
    buildChart(list).catch((): CompareChart => ({ ranges: [], source: "Price history", lastDate: null, missing: list })),
  ]);
  return {
    symbols: list,
    rows: list.map((symbol) => {
      const row = rowMap.get(symbol);
      return row && !row.benchmark ? row : null;
    }),
    chart,
  };
}

/**
 * The same, kept for five minutes as one finished piece (rows and the rebased chart). The desk's example
 * pair opens on every visit to /compare, so it should not rebuild the chart each time; the parts underneath are
 * cached on their own clocks already.
 */
async function getCompareDataWhole(symbols: string[]): Promise<CompareData> {
  const data = await getCompareData(symbols);
  // getCompareData turns a failed read into empty columns; a half-empty answer is thrown here, not cached for five minutes.
  if (data.rows.some((row) => row === null) || data.chart.ranges.length === 0) throw new Error("compare data incomplete");
  return data;
}

export const getCompareDataCached = unstable_cache(getCompareDataWhole, ["compare-data-v3"], { revalidate: 300 });
