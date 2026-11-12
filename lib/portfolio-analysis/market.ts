import type { ScreenerRow } from "@/lib/screener-shared";

import { round } from "./stats";
import type { AttributionModule, AttributionRow, AttributionWindow, LeanFigure, LeanModule, Weighted } from "./types";

/**
 * Two reads off the screener snapshot (`tm_screener_snapshot`, backend/agentdata/screener.py), where every
 * figure is already a percent: what made the money over 1 month, 3 months and this year at today's weights, and
 * what the mix is made of next to the S&P 500. Pure.
 */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export type ReturnFields = Pick<ScreenerRow, "ret_1m" | "ret_3m" | "ret_6m" | "ret_ytd">;

/**
 * Returns from stored closes, for a holding the screener does not carry (VOO, say): 21, 63 and 126 sessions back,
 * and this year from the last close of the previous year. Only when the closes reach the price day (within
 * `maxLagDays`), so a stale series never stands in for a current figure.
 */
export function returnsFromCloses(series: { dates: string[]; closes: number[] } | null | undefined, day: string, maxLagDays = 4): ReturnFields | null {
  if (!series || series.dates.length < 2) return null;
  const n = Math.min(series.dates.length, series.closes.length);
  const lastDate = series.dates[n - 1]!;
  const lag = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000;
  if (!(lag >= 0 && lag <= maxLagDays)) return null;
  const last = series.closes[n - 1]!;
  const back = (sessions: number) => (n - 1 - sessions >= 0 && series.closes[n - 1 - sessions]! > 0 ? (last / series.closes[n - 1 - sessions]! - 1) * 100 : undefined);
  const year = lastDate.slice(0, 4);
  let ytdBase: number | undefined;
  for (let i = n - 1; i >= 0; i--) {
    if (series.dates[i]!.slice(0, 4) < year) {
      ytdBase = series.closes[i];
      break;
    }
  }
  return { ret_1m: back(21), ret_3m: back(63), ret_6m: back(126), ret_ytd: ytdBase && ytdBase > 0 ? (last / ytdBase - 1) * 100 : undefined };
}

/* ── what made the money ───────────────────────────────────────────────── */

export const ATTRIBUTION_MIN_COVERAGE = 80;

const WINDOWS: Array<{ key: AttributionWindow["key"]; label: string; field: keyof ReturnFields }> = [
  { key: "1m", label: "Last month", field: "ret_1m" },
  { key: "3m", label: "Last 3 months", field: "ret_3m" },
  { key: "ytd", label: "This year", field: "ret_ytd" },
];

/**
 * Today's weights times each holding's return: what today's mix would have made, not what the person earned (they
 * may have bought in between). A window is left out when less than ATTRIBUTION_MIN_COVERAGE of the money has a
 * return for it; the rest are scaled to the covered money so the parts add up to the whole.
 */
export function buildAttribution(
  holdings: readonly Weighted[],
  rows: ReadonlyMap<string, ReturnFields>,
  benchmark: ReturnFields | null | undefined,
  asOf: string | null = null,
): AttributionModule | null {
  const total = holdings.reduce((sum, holding) => sum + Math.max(0, holding.weight), 0);
  if (total <= 0) return null;
  const windows: AttributionWindow[] = [];
  for (const window of WINDOWS) {
    const covered = holdings.filter((holding) => holding.weight > 0 && fin(rows.get(holding.ticker)?.[window.field]));
    const coveredWeight = covered.reduce((sum, holding) => sum + holding.weight, 0);
    const coveragePct = (coveredWeight / total) * 100;
    if (covered.length === 0 || coveragePct < ATTRIBUTION_MIN_COVERAGE) continue;
    const parts: AttributionRow[] = covered
      .map((holding) => {
        const ret = rows.get(holding.ticker)![window.field]!;
        const weight = (holding.weight / coveredWeight) * 100;
        return { ticker: holding.ticker, name: holding.name, weight: round(weight, 1), ret: round(ret, 1), contribution: (weight / 100) * ret };
      })
      .sort((a, b) => b.contribution - a.contribution);
    const book = parts.reduce((sum, part) => sum + part.contribution, 0);
    const sp = benchmark?.[window.field];
    windows.push({
      key: window.key,
      label: window.label,
      book: round(book, 1),
      sp: fin(sp) ? round(sp, 1) : null,
      coveragePct: round(coveragePct, 1),
      rows: parts.map((part) => ({ ...part, contribution: round(part.contribution, 2) })),
    });
  }
  return windows.length > 0 ? { windows, asOf } : null;
}

/* ── against the S&P 500 ───────────────────────────────────────────────── */

export const LEAN_MIN_COVERAGE = 50;
export const GIANT_CAP = 200e9;
/** Growth and margin are clipped here per company, so one startup's 600% growth does not speak for the whole mix. */
const CLIP = 100;

export type LeanRow = Pick<ScreenerRow, "pe" | "rev_growth" | "op_margin" | "market_cap" | "div_yield">;

type Weights = ReadonlyArray<{ weight: number; row: LeanRow | undefined }>;

function clip(value: number): number {
  return Math.max(-CLIP, Math.min(CLIP, value));
}

/** Weighted figure over the rows that have it, with the share of the weight that had it. */
function weighted(items: Weights, pick: (row: LeanRow) => number | null): { value: number; coverage: number } | null {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let have = 0;
  let sum = 0;
  for (const item of items) {
    const value = item.row ? pick(item.row) : null;
    if (value === null || !fin(value)) continue;
    have += item.weight;
    sum += item.weight * value;
  }
  if (total <= 0 || have <= 0) return null;
  return { value: sum / have, coverage: (have / total) * 100 };
}

/** Times earnings as the weighted harmonic mean of positive P/Es: losses stay out of the multiple and lower the coverage. */
function harmonicPe(items: Weights): { value: number; coverage: number } | null {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let have = 0;
  let inverse = 0;
  for (const item of items) {
    const pe = item.row?.pe;
    if (!fin(pe) || pe <= 0) continue;
    have += item.weight;
    inverse += item.weight / pe;
  }
  if (total <= 0 || have <= 0 || inverse <= 0) return null;
  return { value: have / inverse, coverage: (have / total) * 100 };
}

/** A company row with a market value is a stock we know; a missing yield there is a real zero, not unknown. */
const yieldOf = (row: LeanRow): number | null => (fin(row.div_yield) ? row.div_yield : fin(row.market_cap) && row.market_cap > 0 ? 0 : null);
const giantOf = (row: LeanRow): number | null => (fin(row.market_cap) && row.market_cap > 0 ? (row.market_cap >= GIANT_CAP ? 100 : 0) : null);

export function buildLean(input: {
  /** Company weights: funds opened where we can (look-through), else the lines as entered. */
  companies: ReadonlyArray<{ ticker: string; weight: number }>;
  /** The lines as entered (funds whole), for the six-month figure: a fund has its own return. */
  lines: ReadonlyArray<{ ticker: string; weight: number }>;
  rows: ReadonlyMap<string, LeanRow & ReturnFields>;
  /** S&P 500 rows of the screener, weighted by market value for the index side. */
  spRows: ReadonlyArray<LeanRow>;
  spReturns: ReturnFields | null | undefined;
  basis: LeanModule["basis"];
  asOf?: string | null;
}): LeanModule | null {
  const book: Weights = input.companies.filter((item) => item.weight > 0).map((item) => ({ weight: item.weight, row: input.rows.get(item.ticker) }));
  const sp: Weights = input.spRows.filter((row) => fin(row.market_cap) && row.market_cap! > 0).map((row) => ({ weight: row.market_cap!, row }));
  if (book.length === 0) return null;
  const figures: LeanFigure[] = [];
  const push = (key: LeanFigure["key"], label: string, unit: LeanFigure["unit"], mine: { value: number; coverage: number } | null, index: { value: number } | null, digits = 1) => {
    if (!mine || mine.coverage < LEAN_MIN_COVERAGE) return;
    figures.push({ key, label, unit, book: round(mine.value, digits), sp: index ? round(index.value, digits) : null, coveragePct: round(mine.coverage, 1) });
  };
  push("pe", "Times earnings", "x", harmonicPe(book), harmonicPe(sp));
  push("growth", "Sales growth", "%", weighted(book, (row) => (fin(row.rev_growth) ? clip(row.rev_growth) : null)), weighted(sp, (row) => (fin(row.rev_growth) ? clip(row.rev_growth) : null)));
  push("margin", "Profit margin", "%", weighted(book, (row) => (fin(row.op_margin) ? clip(row.op_margin) : null)), weighted(sp, (row) => (fin(row.op_margin) ? clip(row.op_margin) : null)));
  push("giants", "In $200B+ companies", "%", weighted(book, giantOf), weighted(sp, giantOf), 0);
  const lines: Weights = input.lines.filter((item) => item.weight > 0).map((item) => ({ weight: item.weight, row: input.rows.get(item.ticker) }));
  const sixMonths = weighted(lines, (row) => {
    const ret = (row as ReturnFields).ret_6m;
    return fin(ret) ? ret : null;
  });
  const spSix = input.spReturns?.ret_6m;
  push("gap6m", "Last 6 months", "%", sixMonths, fin(spSix) ? { value: spSix } : null);
  push("yield", "Dividend yield", "%", weighted(book, yieldOf), weighted(sp, yieldOf), 2);
  return figures.length > 0 ? { figures, basis: input.basis, asOf: input.asOf ?? null } : null;
}
