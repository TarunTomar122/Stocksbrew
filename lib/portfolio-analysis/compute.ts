import type { ScreenerRow } from "@/lib/screener-shared";
import type { StressResult } from "@/lib/stress-test";
import type { FundDoc, Xray } from "@/lib/xray";

import { buildConcentration, buildOverlap } from "./concentration";
import { buildCorrelation } from "./correlation";
import { buildCrashes } from "./crashes";
import { buildAttribution, buildLean, type ReturnFields } from "./market";
import { MIN_COVERAGE, buildRisk } from "./risk";
import { alignReturns, type Aligned, type CloseSeries } from "./stats";
import type {
  AttributionModule,
  ConcentrationModule,
  CorrelationModule,
  CrashModule,
  LeanModule,
  OverlapModule,
  RiskModule,
  Weighted,
} from "./types";

/**
 * Everything in the analysis that depends only on the mix (tickers and weights) and the day's market data, so it
 * can be worked out once and shared by everyone who holds the same mix. Pure: the loader passes the data in.
 */

export type MixLine = Weighted & { sector: string | null; fund: boolean };

export type MarketAnalysis = {
  /** Lines as entered (funds whole); always there. */
  concentrationTyped: ConcentrationModule | null;
  /** Funds opened into their companies; null when no fund could be opened. */
  concentrationLook: ConcentrationModule | null;
  overlap: OverlapModule | null;
  risk: RiskModule | null;
  correlation: CorrelationModule | null;
  crashes: CrashModule | null;
  attribution: AttributionModule | null;
  lean: LeanModule | null;
  /** Funds we can open, for the Free plan's one lock line. */
  openFunds: string[];
};

/** A holding needs this many sessions to be in the full-year window. */
export const FULL_YEAR_SESSIONS = 200;

/**
 * The window for the swings: a full year without the recent listings when the rest still covers enough of the
 * money, else every holding with at least 60 sessions on the shorter window they share.
 */
export function chooseWindow(
  lines: ReadonlyArray<{ ticker: string; weight: number }>,
  benchmark: CloseSeries | null,
  series: Record<string, CloseSeries | null | undefined>,
): Aligned | null {
  const tickers = lines.map((line) => line.ticker);
  const total = lines.reduce((sum, line) => sum + line.weight, 0);
  const full = alignReturns({ benchmark, series, tickers, minSessions: FULL_YEAR_SESSIONS });
  if (full && total > 0) {
    const covered = lines.filter((line) => full.byTicker[line.ticker]).reduce((sum, line) => sum + line.weight, 0);
    if ((covered / total) * 100 >= MIN_COVERAGE) return full;
  }
  return alignReturns({ benchmark, series, tickers });
}

export function computeMarketAnalysis(input: {
  lines: readonly MixLine[];
  series: Record<string, CloseSeries | null | undefined>;
  benchmark: CloseSeries | null;
  xray: Xray | null;
  benchmarkFund: FundDoc | null;
  spSectors: Record<string, number | undefined>;
  nameOf?: Record<string, string | undefined>;
  stress: StressResult | null;
  rows: ReadonlyMap<string, ScreenerRow>;
  spRows: readonly ScreenerRow[];
  spyReturns: ReturnFields | null;
  screenerDay: string | null;
}): MarketAnalysis {
  const lines = input.lines.filter((line) => line.weight > 0);
  const opened = Boolean(input.xray && input.xray.funds.some((fund) => fund.status === "ok"));
  // The S&P 500's largest names per sector, as ideas on the sector rows: the fund's filing, then the screener's rows.
  const sectorOf = (ticker: string) => input.rows.get(ticker)?.sector ?? null;
  const indexRows = input.spRows.map((row) => ({ ticker: row.symbol, name: row.name, sector: row.sector, weight: row.market_cap ?? 0 }));
  const sides = { benchmark: input.benchmarkFund, spSectors: input.spSectors, nameOf: input.nameOf, sectorOf, indexRows };
  const concentrationTyped = buildConcentration({ positions: lines, xray: null, ...sides });
  const concentrationLook = opened ? buildConcentration({ positions: lines, xray: input.xray, ...sides }) : null;

  const aligned = chooseWindow(lines, input.benchmark, input.series);

  // Against the S&P: look-through companies where a fund is open, else the lines as entered.
  const companies =
    opened && input.xray
      ? [
          ...input.xray.companies.map((row) => ({ ticker: row.ticker, weight: row.pct })),
          // Money we cannot place has no figures, so it lowers the coverage instead of vanishing from it.
          { ticker: "", weight: input.xray.total > 0 ? (input.xray.unplacedValue / input.xray.total) * 100 : 0 },
        ]
      : lines.map((line) => ({ ticker: line.ticker, weight: line.weight }));

  return {
    concentrationTyped,
    concentrationLook,
    overlap: buildOverlap(input.xray),
    risk: buildRisk(lines, aligned),
    correlation: buildCorrelation(
      lines,
      aligned,
      Object.fromEntries(lines.map((line) => [line.ticker, { industry: input.rows.get(line.ticker)?.industry ?? null, sector: line.sector, fund: line.fund }])),
    ),
    crashes: buildCrashes(input.stress),
    attribution: buildAttribution(lines, input.rows, input.spyReturns, input.screenerDay),
    lean: buildLean({
      companies,
      lines,
      rows: input.rows,
      spRows: input.spRows,
      spReturns: input.spyReturns,
      basis: opened ? "look-through" : "as-typed",
      asOf: input.screenerDay,
    }),
    openFunds: input.xray ? input.xray.funds.filter((fund) => fund.status === "ok").map((fund) => fund.ticker) : [],
  };
}
