/**
 * The fund page's figures, from stored data only (pure; lib/funds/page.ts
 * passes the documents in). The look-through reuses the x-ray's sums
 * (lib/xray.ts `buildXray`) on one fund, so a company held in two share
 * classes is one row on both pages.
 */

import { normalizeSectorName } from "@/lib/gics-sector";
import { companyKey } from "@/lib/share-class";
import type { ChartPoint } from "@/lib/stock-chart";
import { buildXray, type FundDoc } from "@/lib/xray";

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/* ── cost ───────────────────────────────────────────────────────────────── */

/** What a year in the fund costs on $10,000, in dollars, from its expense ratio (a fraction: 0.0003 is 0.03%). */
export function costOn10k(expenseRatio: number | null | undefined): number | null {
  return fin(expenseRatio) && expenseRatio >= 0 ? expenseRatio * 10_000 : null;
}

/** "$3", "$35", "$0.30": whole dollars once it is a few of them. */
export function fmtDollars(value: number): string {
  if (value >= 9.995) return `$${Math.round(value).toLocaleString("en-US")}`;
  if (value >= 0.995 && Math.abs(value - Math.round(value)) < 0.005) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

/** "0.03%", "0.35%", "0.95%": the expense ratio as funds quote it, two decimals. */
export function fmtRatio(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

/* ── price from the daily closes, when there is no live quote ─────────── */

export type CloseQuote = { price: number; changeAbs: number | null; changePct: number | null; date: string };

/** The last close and its move on the close before, from a stored daily series. */
export function lastCloseQuote(series: readonly ChartPoint[] | null | undefined): CloseQuote | null {
  const points = (series ?? []).filter((point) => fin(point.close) && point.close > 0);
  const last = points[points.length - 1];
  if (!last) return null;
  const prev = points[points.length - 2];
  const changeAbs = prev ? last.close - prev.close : null;
  return { price: last.close, changeAbs, changePct: prev && changeAbs !== null ? (changeAbs / prev.close) * 100 : null, date: last.date };
}

/* ── one year against the S&P 500 ─────────────────────────────────────── */

export type YearReturn = { fundPct: number; sp500Pct: number; from: string; to: string };

function closeOnOrBefore(series: readonly ChartPoint[], day: string): ChartPoint | null {
  let found: ChartPoint | null = null;
  for (const point of series) {
    if (point.date > day) break;
    found = point;
  }
  return found;
}

function closeOnOrAfter(series: readonly ChartPoint[], day: string): ChartPoint | null {
  return series.find((point) => point.date >= day) ?? null;
}

function yearBefore(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  // Feb 29 has no twin a year back; Feb 28 does.
  const back = new Date(Date.UTC(year - 1, month - 1, month === 2 && date === 29 ? 28 : date));
  return back.toISOString().slice(0, 10);
}

/**
 * The fund's total return over the year to the last close both series share, beside SPY's over the same days.
 * Both series are adjusted closes (dividends in). The year starts on the first close on or after the same day a year
 * back, as the chart's 1Y tab does, so the card and the chart agree. Null when either does not reach a year back.
 */
export function yearReturn(
  fund: readonly ChartPoint[] | null | undefined,
  spy: readonly ChartPoint[] | null | undefined,
  /** The chart's 1Y start (`ChartRange.fromDate`), so both say the same year. */
  startOn?: string | null,
): YearReturn | null {
  if (!fund?.length || !spy?.length) return null;
  const to = [fund[fund.length - 1]!.date, spy[spy.length - 1]!.date].sort()[0]!;
  const from = startOn && startOn < to ? startOn : yearBefore(to);
  if (fund[0]!.date > from || spy[0]!.date > from) return null;
  const pairs = [fund, spy].map((series) => [closeOnOrAfter(series, from), closeOnOrBefore(series, to)] as const);
  if (pairs.some(([start, end]) => !start || !end || !(start.close > 0))) return null;
  const pct = ([start, end]: readonly [ChartPoint | null, ChartPoint | null]) => (end!.close / start!.close - 1) * 100;
  return { fundPct: pct(pairs[0]!), sp500Pct: pct(pairs[1]!), from, to };
}

/* ── what is inside ───────────────────────────────────────────────────── */

export type FundHoldingRow = { ticker: string; name: string; weightPct: number };
export type FundSectorRow = { sector: string; pct: number; benchmarkPct: number | null };
export type FundOverlap = { pct: number; stocks: FundHoldingRow[] };

export type FundLookThrough = {
  /** The ten biggest companies, share classes folded (Alphabet once). Empty when the fund is not broken down. */
  top: FundHoldingRow[];
  /** Companies we could place; fewer than the filing's lines when classes fold. */
  companyCount: number;
  /** Sector mix against the S&P 500, biggest first; null when we cannot say it for most of the fund. */
  sectors: FundSectorRow[] | null;
  /** The stocks held directly that the fund holds too, with how much of the fund they are; null when none. */
  overlap: FundOverlap | null;
};

/** Below this share of the fund placed in a sector, the holdings-based mix says too little; Yahoo's mix stands in. */
const MIN_CLASSIFIED_PCT = 60;

export function fundLookThrough(input: {
  doc: FundDoc | null;
  sectorOf?: Record<string, string | undefined>;
  nameOf?: Record<string, string | undefined>;
  /** S&P 500 sector weights in percent. */
  benchmarkSectors?: Record<string, number | undefined>;
  /** Yahoo's sector weights as fractions (tm_fund_facts), for a fund whose holdings we cannot place. */
  yahooSectors?: Record<string, number> | null;
  /** Tickers the person holds directly. */
  direct?: readonly string[];
}): FundLookThrough {
  const benchmark = input.benchmarkSectors ?? {};
  const doc = input.doc && input.doc.status === "ok" && input.doc.holdings.length ? input.doc : null;
  const xray = doc
    ? buildXray([{ ticker: doc.ticker, name: doc.fundName, value: 100, looksLikeFund: true }], {
        funds: { [doc.ticker]: doc },
        sectorOf: input.sectorOf,
        nameOf: input.nameOf,
        benchmarkSectors: benchmark,
      })
    : null;
  const companies = xray?.companies ?? [];
  const top = companies.slice(0, 10).map((row) => ({ ticker: row.ticker, name: row.name, weightPct: row.pct }));

  let sectors: FundSectorRow[] | null = null;
  const classified = (xray?.sectors ?? []).reduce((sum, row) => sum + row.pct, 0);
  if (xray && classified >= MIN_CLASSIFIED_PCT) {
    sectors = xray.sectors.map((row) => ({ sector: row.sector, pct: row.pct, benchmarkPct: row.benchmarkPct }));
  } else if (input.yahooSectors) {
    const merged = new Map<string, number>();
    for (const [raw, weight] of Object.entries(input.yahooSectors)) {
      const sector = normalizeSectorName(raw) ?? raw;
      if (fin(weight) && weight > 0) merged.set(sector, (merged.get(sector) ?? 0) + weight * 100);
    }
    const total = [...merged.values()].reduce((sum, value) => sum + value, 0);
    if (total >= MIN_CLASSIFIED_PCT) {
      sectors = [...merged.entries()].map(([sector, pct]) => ({ sector, pct, benchmarkPct: fin(benchmark[sector]) ? benchmark[sector]! : null }));
    }
  }
  if (sectors) {
    // A sector the S&P 500 holds and the fund does not is worth a row too: "none" is part of the mix.
    for (const [sector, pct] of Object.entries(benchmark)) {
      if (fin(pct) && pct >= 0.5 && !sectors.some((row) => row.sector === sector)) sectors.push({ sector, pct: 0, benchmarkPct: pct });
    }
    sectors.sort((a, b) => b.pct - a.pct || (b.benchmarkPct ?? 0) - (a.benchmarkPct ?? 0));
  }

  const directKeys = new Set((input.direct ?? []).map((ticker) => companyKey(ticker)).filter(Boolean));
  const shared = directKeys.size ? companies.filter((row) => directKeys.has(row.key)) : [];
  const overlap = shared.length
    ? {
        pct: shared.reduce((sum, row) => sum + row.pct, 0),
        stocks: shared.map((row) => ({ ticker: row.ticker, name: row.name, weightPct: row.pct })),
      }
    : null;

  return { top, companyCount: companies.length, sectors, overlap };
}
