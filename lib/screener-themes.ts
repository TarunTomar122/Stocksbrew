import type { InvestmentTheme, ThemeCandidate } from "@/lib/investment-themes";
import { getLiveInvestmentTheme, getLiveInvestmentThemes } from "@/lib/research-themes";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";
import { bookLine } from "@/lib/theme-book-lines";
import {
  BASKET_RANGES,
  basketSeries,
  basketWindowReturn,
  indexMaxDrawdown,
  indexReturn,
  rangeStart,
  thinAligned,
  type BasketRangeKey,
  type IndexPoint,
} from "@/lib/screener-basket";
import { getDailySeries } from "@/lib/screener-series";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * Idea baskets: the research themes joined with the screening snapshot, plus
 * the hypothetical equal-weight basket math. The thesis and the per-line
 * reasoning are stored editorial data (`tm_config/research_themes`, seeded
 * from backend/config/research_themes_seed.json); the numbers are computed
 * here from stored prices.
 */

export const BASKET_BENCHMARK = "SPY";

export type BasketWindow = "ret_1m" | "ret_3m" | "ret_ytd" | "ret_1y";

export const BASKET_WINDOWS: Array<{ id: BasketWindow; label: string }> = [
  { id: "ret_1m", label: "1M" },
  { id: "ret_3m", label: "3M" },
  { id: "ret_ytd", label: "YTD" },
  { id: "ret_1y", label: "1Y" },
];

export type BasketPerf = Record<BasketWindow, { pct: number; priced: number; total: number } | null>;

export type BasketLine = {
  company: string;
  ticker: string;
  role: string;
  benefit: string;
  breaks: string;
  catalyst: string | null;
  /** The book's one line for it, at most 15 words: what it does for the idea and what would break it (lib/theme-book-lines.ts). */
  line: string;
  /** Screening row for the line: price, returns, score, and our call (callers strip it per viewer). */
  row: ScreenerRow | null;
};

export type BasketSummary = {
  slug: string;
  name: string;
  /** One line. */
  thesis: string;
  size: number;
  perf: BasketPerf;
  benchmark: Record<BasketWindow, number | null>;
  /** The first lines of the basket, in editorial order. */
  lead: Array<{ ticker: string; company: string }>;
  roles: string[];
  asOf: string | null;
};

export type Basket = BasketSummary & {
  description: string;
  holds: string;
  lines: BasketLine[];
  alsoWatching: BasketLine[];
  resources: InvestmentTheme["resources"];
};

function line(slug: string, candidate: ThemeCandidate, rows: Map<string, ScreenerRow>): BasketLine {
  const ticker = candidate.ticker.trim().toUpperCase();
  return {
    company: candidate.company,
    ticker,
    role: candidate.role,
    benefit: candidate.benefitMechanism,
    breaks: candidate.failureCase,
    catalyst: candidate.catalyst?.trim() || null,
    line: bookLine(slug, candidate),
    row: rows.get(ticker) ?? null,
  };
}

function perfOf(lines: BasketLine[]): BasketPerf {
  const out = {} as BasketPerf;
  for (const { id } of BASKET_WINDOWS) {
    out[id] = basketWindowReturn(lines.map((item) => item.row?.[id]));
  }
  return out;
}

function summarize(theme: InvestmentTheme, rows: Map<string, ScreenerRow>, asOf: string | null): Basket {
  const lines = theme.candidates.map((candidate) => line(theme.slug, candidate, rows));
  const bench = rows.get(BASKET_BENCHMARK);
  const benchmark = {} as Record<BasketWindow, number | null>;
  for (const { id } of BASKET_WINDOWS) benchmark[id] = typeof bench?.[id] === "number" ? (bench[id] as number) : null;
  return {
    slug: theme.slug,
    name: theme.name,
    thesis: theme.cardDescription,
    description: theme.description,
    holds: theme.resilienceNote,
    size: lines.length,
    perf: perfOf(lines),
    benchmark,
    lead: lines.slice(0, 4).map((item) => ({ ticker: item.ticker, company: item.company })),
    roles: [...new Set(lines.map((item) => item.role))],
    asOf,
    lines,
    alsoWatching: theme.watchlist.map((candidate) => line(theme.slug, candidate, rows)),
    resources: theme.resources,
  };
}

function tickersOf(themes: InvestmentTheme[]): string[] {
  const out = new Set<string>([BASKET_BENCHMARK]);
  for (const theme of themes) {
    for (const candidate of [...theme.candidates, ...theme.watchlist]) out.add(candidate.ticker.trim().toUpperCase());
  }
  return [...out];
}

/** Every basket with its hypothetical equal-weight performance, for the directory. */
export async function getBaskets(): Promise<{ baskets: Basket[]; asOf: string | null }> {
  const [themes, snapshot] = await Promise.all([getLiveInvestmentThemes(), getScreenerSnapshot().catch(() => null)]);
  const rows = await getScreenerRows(tickersOf(themes)).catch(() => new Map<string, ScreenerRow>());
  const asOf = snapshot?.meta.generated_at ?? null;
  return { baskets: themes.map((theme) => summarize(theme, rows, asOf)), asOf };
}

export async function getBasket(slug: string): Promise<Basket | null> {
  const theme = await getLiveInvestmentTheme(slug.toLowerCase());
  if (!theme) return null;
  const [rows, snapshot] = await Promise.all([
    getScreenerRows(tickersOf([theme])).catch(() => new Map<string, ScreenerRow>()),
    getScreenerSnapshot().catch(() => null),
  ]);
  return summarize(theme, rows, snapshot?.meta.generated_at ?? null);
}

export type BasketChartRange = {
  key: BasketRangeKey;
  label: string;
  startDate: string;
  endDate: string;
  basket: IndexPoint[];
  benchmark: IndexPoint[] | null;
  basketPct: number | null;
  benchmarkPct: number | null;
  basketDrawdown: number | null;
  benchmarkDrawdown: number | null;
  /** Lines counted in this window, and lines left out because they had no price at its start. */
  members: number;
  excluded: string[];
};

export type BasketChart = {
  ranges: BasketChartRange[];
  source: string;
  lastDate: string | null;
  benchmark: string;
};

const CHART_POINTS = 170;

/** The basket's path against SPY over each window the data covers. */
export async function getBasketChart(tickers: readonly string[]): Promise<BasketChart> {
  const members = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const { series, source, lastDate } = await getDailySeries([...members, BASKET_BENCHMARK]);
  const bench = series[BASKET_BENCHMARK] ?? null;
  const memberSeries = Object.fromEntries(members.filter((symbol) => series[symbol]).map((symbol) => [symbol, series[symbol]!]));
  const noHistory = members.filter((symbol) => !series[symbol]);
  const ranges: BasketChartRange[] = [];
  if (lastDate && Object.keys(memberSeries).length > 0) {
    for (const range of BASKET_RANGES) {
      if (range.key === "MAX") continue;
      const from = rangeStart(range.key, lastDate);
      const result = basketSeries(memberSeries, bench, from);
      if (!result || result.basket.length < 5) continue;
      // A window is only offered when at least half the basket has prices for all of it.
      if (result.members.length * 2 < members.length) continue;
      ranges.push({
        key: range.key,
        label: range.label,
        startDate: result.startDate,
        endDate: result.endDate,
        basket: thinAligned(result.basket, CHART_POINTS),
        benchmark: result.benchmark ? thinAligned(result.benchmark, CHART_POINTS) : null,
        basketPct: indexReturn(result.basket),
        benchmarkPct: result.benchmark ? indexReturn(result.benchmark) : null,
        basketDrawdown: indexMaxDrawdown(result.basket),
        benchmarkDrawdown: result.benchmark ? indexMaxDrawdown(result.benchmark) : null,
        members: result.members.length,
        excluded: [...new Set([...result.excluded, ...noHistory])],
      });
    }
  }
  return { ranges, source, lastDate, benchmark: BASKET_BENCHMARK };
}
