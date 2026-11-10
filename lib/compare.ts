import { unstable_cache } from "next/cache";

import { getStockIntelligence } from "@/lib/firestore";
import { getScreenerRows } from "@/lib/screener";
import { BASKET_RANGES, indexReturn, overlaySeries, rangeStart, thinAligned, type BasketRangeKey, type IndexPoint } from "@/lib/screener-basket";
import { getDailySeries } from "@/lib/screener-series";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * Server loaders for the compare desk. The numbers come from the screening
 * snapshot (one row per stock), the words from each stock's stored brief, and
 * the chart from stored daily closes. Nothing is generated at request time.
 *
 * `lib/compare-stocks.ts` is the older per-request loader the MCP server and
 * the REST API still use; it is left as it is.
 */

export type CompareBrief = {
  symbol: string;
  headline: string | null;
  thesis: string | null;
  /** What is driving the stock, from the brief's driver cards. */
  drivers: Array<{ label: string; detail: string | null; direction: string | null }>;
  risk: string | null;
  points: string[];
  generatedAt: string | null;
};

type BriefDoc = {
  headline?: string;
  thesis?: string;
  risk?: string;
  key_points?: string[];
  generated_at?: string;
  visual_cards?: { drivers?: Array<{ label?: string; detail?: string; direction?: string }> };
};

function text(value: unknown, max = 400): string | null {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean ? clean.slice(0, max) : null;
}

async function readBrief(symbol: string): Promise<CompareBrief | null> {
  const doc = (await getStockIntelligence(`US_${symbol}`, "US")) as BriefDoc | null;
  if (!doc) return null;
  const drivers = (doc.visual_cards?.drivers ?? [])
    .map((driver) => ({ label: text(driver.label, 120), detail: text(driver.detail, 320), direction: text(driver.direction, 12) }))
    .filter((driver): driver is { label: string; detail: string | null; direction: string | null } => driver.label !== null)
    .slice(0, 3);
  const brief: CompareBrief = {
    symbol,
    headline: text(doc.headline, 200),
    thesis: text(doc.thesis, 320),
    drivers,
    risk: text(doc.risk, 400),
    points: (doc.key_points ?? []).map((point) => text(point, 320)).filter((point): point is string => point !== null).slice(0, 4),
    generatedAt: text(doc.generated_at, 40),
  };
  return brief.thesis || brief.headline || brief.drivers.length || brief.risk || brief.points.length ? brief : null;
}

const getBriefCached = unstable_cache(readBrief, ["compare-brief-v1"], { revalidate: 900 });

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
  briefs: Array<CompareBrief | null>;
  chart: CompareChart;
};

export async function getCompareData(symbols: readonly string[]): Promise<CompareData> {
  const list = [...symbols];
  const [rowMap, briefs, chart] = await Promise.all([
    getScreenerRows(list).catch(() => new Map<string, ScreenerRow>()),
    Promise.all(list.map((symbol) => getBriefCached(symbol).catch(() => null))),
    buildChart(list).catch((): CompareChart => ({ ranges: [], source: "Price history", lastDate: null, missing: list })),
  ]);
  return {
    symbols: list,
    rows: list.map((symbol) => {
      const row = rowMap.get(symbol);
      return row && !row.benchmark ? row : null;
    }),
    briefs,
    chart,
  };
}
