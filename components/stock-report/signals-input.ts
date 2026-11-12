import { isBalanceSheetFinancial } from "@/lib/financial-company";
import { valuationRows } from "@/lib/stock-readings";
import { alignedOneYear, reportReaction, type Close, type StockSignalsInput } from "@/lib/stock-signals";
import { parseMonthPeriod } from "@/lib/stock-timeline";

import type { ReportData, ReportExtras } from "./types";

/** A calendar row as stored (`tm_earnings_events`): the page's EarningsEvent plus the reported figures. */
type CalendarRow = {
  event_date: string;
  time?: string | null;
  eps_estimate?: number | null;
  estimated_eps?: number | null;
  reported_eps?: number | null;
  eps_surprise?: number | null;
};

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Technicals older than this are not today's trend. */
const TECHNICALS_MAX_AGE_DAYS = 10;

/**
 * The signals' inputs from what the stock page already loaded: the top's data, the lower half's reads, the daily
 * closes (the stock's and SPY's, adjusted) and the earnings calendar. The same figures the tabs show, so a signal
 * never judges a number the page does not have. No new reads.
 */
export function stockSignalsInput(parts: {
  data: ReportData;
  extras: Omit<ReportExtras, "timeline">;
  today: string;
  /** Daily closes by ticker, with "SPY" for the market. */
  closes: Record<string, ReadonlyArray<Close>> | null;
  calendar: ReadonlyArray<CalendarRow>;
}): StockSignalsInput {
  const { data, extras, today } = parts;
  const { stock, facts, fundamentals } = data;
  const price = fin(stock.price) && stock.price > 0 ? stock.price : null;
  const bank = isBalanceSheetFinancial({ sector: stock.sector, industry: stock.industry, ticker: stock.ticker });
  const peLive = fundamentals?.pe_ttm ?? facts?.quick_stats?.pe_ttm;
  // The trailing P/E row as the Valuation tab shows it, with its sector's average when the scorecard has one.
  const peRow = valuationRows({ pe: peLive, sectorMetrics: data.intelPro?.pillars?.valuation?.metrics }).find((row) => row.key === "pe");

  // The latest report that has happened, whatever it holds: when it has no reported EPS yet, its figures are missing
  // and nothing is judged, never an older report that happens to have them (council, Nov 12). A report dated today
  // counts as the latest too: once its EPS is in it is judged, and until then the earnings signals stay empty rather
  // than show last quarter as the latest (council, Nov 12).
  const reported = parts.calendar
    .filter((row) => /^\d{4}-\d{2}-\d{2}/.test(row.event_date) && row.event_date.slice(0, 10) <= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .pop();
  const actual = reported && fin(reported.reported_eps) ? reported.reported_eps : null;
  // Today's report before its results are on file: nothing about earnings is judged yet, the reaction included.
  const pendingToday = Boolean(reported && reported.event_date.slice(0, 10) === today && actual === null);
  const estimate = reported ? (fin(reported.estimated_eps) ? reported.estimated_eps : fin(reported.eps_estimate) ? reported.eps_estimate : null) : null;
  // A row whose stored surprise disagrees with its two figures mixes two bases: neither is used.
  const agrees = actual !== null && estimate !== null && (!fin(reported!.eps_surprise) || Math.abs(actual - estimate - reported!.eps_surprise) <= 0.015);
  const lastReport = reported ? { date: reported.event_date.slice(0, 10), actual: agrees ? actual : null, estimate: agrees ? estimate : null } : null;

  const own = parts.closes?.[stock.ticker.toUpperCase()] ?? null;
  const market = parts.closes?.SPY ?? null;
  const time = reported?.time === "bmo" || reported?.time === "amc" ? reported.time : null;

  const technicals = extras.technicals;
  const techAge = technicals?.as_of_date ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${technicals.as_of_date.slice(0, 10)}T00:00:00Z`)) / 86_400_000 : null;
  const techFresh = techAge !== null && techAge >= 0 && techAge <= TECHNICALS_MAX_AGE_DAYS;
  const averages = techFresh ? technicals?.moving_averages : undefined;

  const funds = extras.ownership.funds;
  return {
    today,
    currency: data.currency,
    price,
    priceAsOf: stock.captured_at ? stock.captured_at.slice(0, 10) : null,
    bank,
    history: facts?.financial_history ?? [],
    ttmRevenueGrowth: facts?.financials?.revenue_growth_yoy_pct ?? null,
    roe: null,
    nii: null,
    pe: fin(peRow?.value) ? peRow!.value : null,
    sectorPe: fin(peRow?.sector) ? peRow!.sector : null,
    peHistory: data.multiple ? { points: data.multiple.points } : null,
    target: { median: facts?.analyst_trend?.target?.median ?? null, count: facts?.analyst?.analyst_count ?? null },
    ratings: (facts?.analyst_trend?.recommendation_trend ?? [])
      .map((row) => ({
        month: (parseMonthPeriod(row.period) ?? "").slice(0, 7),
        buy: (row.strong_buy ?? 0) + (row.buy ?? 0),
        hold: row.hold ?? 0,
        sell: (row.sell ?? 0) + (row.strong_sell ?? 0),
      }))
      .filter((row) => row.month),
    lastReport,
    guidance: null,
    reaction: reported && !pendingToday ? reportReaction(own, market, { date: reported.event_date.slice(0, 10), time }) : null,
    sma50: averages?.sma_50 ?? fundamentals?.fifty_day_average ?? null,
    sma200: averages?.sma_200 ?? fundamentals?.two_hundred_day_average ?? null,
    rsi: techFresh ? technicals?.rsi_14?.value ?? null : null,
    high52: fundamentals?.week_52_high ?? null,
    oneYear: alignedOneYear(own, market),
    insiders: extras.ownership.insiders
      ? extras.ownership.insiders.rows.map((row) => ({ id: row.id, action: row.action, valueUsd: row.valueUsd, planned: row.planned, date: row.transactionDate }))
      : null,
    funds: funds
      ? [
          ...funds.rows.map((row) => ({ fund: row.slug, quarter: row.reportDate || row.quarter, action: row.action })),
          ...funds.exits.map((row) => ({ fund: row.slug, quarter: row.reportDate || row.quarter, action: "exited" as const })),
        ]
      : null,
    newsEvents: [],
    self: { revenueGrowth: facts?.financials?.revenue_growth_yoy_pct ?? null, pe: fin(peLive) && peLive > 0 ? peLive : null },
    // The peers the Rivals tab lists: up to eight, not the stock itself.
    peers: extras.peers
      .filter((peer) => peer.ticker !== stock.ticker)
      .slice(0, 8)
      .map((peer) => ({ ticker: peer.ticker, revenueGrowth: peer.revenue_growth_yoy_pct ?? null, pe: fin(peer.pe_ttm) && peer.pe_ttm > 0 ? peer.pe_ttm : null })),
  };
}
