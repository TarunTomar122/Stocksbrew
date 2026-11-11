import { unstable_cache } from "next/cache";

import { parseHistoryDoc } from "@/lib/dividend-plan";
import { latestReportFor } from "@/lib/earnings-day";
import { earningsDayHref } from "@/lib/earnings-day-shared";
import { isBalanceSheetFinancial } from "@/lib/financial-company";
import { adminFirestore } from "@/lib/firebase-admin";
import { shortCompanyName } from "@/lib/plain-copy";
import { loadDailySeries } from "@/lib/portfolio-data";
import { getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { getRecentMoves } from "@/lib/seo/family-data";
import { moveHref } from "@/lib/seo/families";
import { getStockCallHistory } from "@/lib/stock-events";
import { getStockOwnership } from "@/lib/stock-ownership";

import { THRESHOLDS } from "./rules";
import {
  addDays,
  bigDropOf,
  callFacts,
  closeOn,
  daysBetween,
  dividendFacts,
  emptyFacts,
  namesTrouble,
  priorYearGrowth,
  quantile,
  recentClosesOn,
  type StockFacts,
  type YearFigures,
} from "./facts";

/**
 * The facts for one stock, read from what the pipeline already stores:
 * - screening snapshot (`tm_screener_snapshot`): growth, margins, P/E history, payout, yield, the call, next earnings
 * - yearly results (`tm_stock_facts`): last fiscal year's revenue growth
 * - dividend history (`tm_dividend_history`)
 * - call history (`tm_directive_history/{id}/calls`)
 * - the latest earnings report (`tm_earnings_day`): guidance
 * - Form 4 and 13F (`tm_insider_trades`, `tm_fund_holders`)
 * - explained moves (`tm_daily_anomalies`) and daily closes (`tm_price_history_daily`)
 * - headline tone (`tm_agent_news`, `tm_agent_news_tone`)
 * Read-only; every read fails soft to "unknown". Facts are the same for every
 * person, so they are cached per stock per New York day.
 */

export const NEWS_DAYS = 14;
export const TROUBLE_DAYS = 30;
export const INSIDER_DAYS = 30;
export const FUND_DAYS = 45;
/** A sector needs this many stocks with revenue growth before its median means anything. */
const SECTOR_MIN = 8;
/** A fund that sold out must have held at least this share of its portfolio for the exit to count. */
const FUND_EXIT_MIN_PCT = 1;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function tickerFromId(instrumentId: string): string {
  return instrumentId.split("_").slice(1).join(".");
}

function yearsOf(raw: unknown): YearFigures[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      label: typeof row.period === "string" ? row.period : "",
      revenue: fin(row.revenue) ? row.revenue : null,
      eps: fin(row.eps_diluted) ? row.eps_diluted : null,
      netIncome: fin(row.net_income) ? row.net_income : null,
      fcf: fin(row.free_cash_flow) ? row.free_cash_flow : null,
    }));
}

async function readStockFactsDoc(instrumentId: string): Promise<{ years: YearFigures[]; revenueGrowth: number | null }> {
  const snap = await adminFirestore.collection("tm_stock_facts").doc(instrumentId).get();
  if (!snap.exists) return { years: [], revenueGrowth: null };
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const financials = (data.financials ?? {}) as Record<string, unknown>;
  return {
    years: yearsOf(data.financial_history),
    revenueGrowth: fin(financials.revenue_growth_yoy_pct) ? financials.revenue_growth_yoy_pct : null,
  };
}

async function readDividends(ticker: string) {
  const snap = await adminFirestore.collection("tm_dividend_history").doc(ticker).get();
  return snap.exists ? parseHistoryDoc(snap.data()) : null;
}

/** Labelled headlines about one company since `since`, and how many were negative. */
async function readNewsTone(ticker: string, since: string): Promise<StockFacts["news"]> {
  const snap = await adminFirestore.collection("tm_agent_news").where("stock_tickers", "array-contains", ticker).limit(150).get();
  const ids = snap.docs
    .map((doc) => ({ id: String((doc.data() as { id?: string }).id ?? doc.id), at: String((doc.data() as { published_at?: string }).published_at ?? "") }))
    .filter((row) => row.at >= since)
    .map((row) => row.id)
    .slice(0, 100);
  if (ids.length === 0) return null;
  const labels = await adminFirestore.getAll(...ids.map((id) => adminFirestore.collection("tm_agent_news_tone").doc(id)));
  let labelled = 0;
  let negative = 0;
  for (const label of labels) {
    if (!label.exists) continue;
    const tone = (label.data() as { tone?: string } | undefined)?.tone;
    if (tone !== "positive" && tone !== "negative" && tone !== "neutral") continue;
    labelled += 1;
    if (tone === "negative") negative += 1;
  }
  return labelled > 0 ? { labelled, negative } : null;
}

function sectorStats(rows: readonly ScreenerRow[], sector: string | undefined): { p25: number | null; median: number | null } {
  if (!sector) return { p25: null, median: null };
  const growth = rows.filter((row) => row.sector === sector && fin(row.rev_growth)).map((row) => row.rev_growth!);
  if (growth.length < SECTOR_MIN) return { p25: null, median: null };
  return { p25: quantile(growth, 0.25), median: quantile(growth, 0.5) };
}

/** Pure: the screening row's part of the facts. */
export function screenerFacts(row: ScreenerRow | null | undefined, today: string): Partial<StockFacts> {
  if (!row) return {};
  const out: Partial<StockFacts> = {
    sector: row.sector ?? null,
    revenueGrowth: fin(row.rev_growth) ? row.rev_growth : null,
    epsNextYearGrowth: fin(row.eps_next_y) ? row.eps_next_y : null,
    epsGrowth: fin(row.eps_growth) ? row.eps_growth : null,
    netIncome: fin(row.net_income) ? row.net_income : null,
    pe: fin(row.pe) && row.pe > 0 ? row.pe : null,
    pePercentile: fin(row.pe_hist_pctile) ? row.pe_hist_pctile : null,
    peMedian: fin(row.pe_hist_median) ? row.pe_hist_median : null,
    payout: fin(row.payout) ? row.payout : null,
    divYield: fin(row.div_yield) ? row.div_yield : null,
    divGrowth: fin(row.div_growth) ? row.div_growth : null,
    // A bank's or insurer's free cash flow moves with its loan book and float, so "it burned $148B" is not a warning (lib/financial-company.ts).
    fcf: fin(row.fcf) && !isBalanceSheetFinancial({ sector: row.sector, industry: row.industry, ticker: row.symbol }) ? row.fcf : null,
    marketCap: fin(row.market_cap) ? row.market_cap : null,
  };
  if (row.earnings_date && /^\d{4}-\d{2}-\d{2}$/.test(row.earnings_date)) {
    const days = daysBetween(today, row.earnings_date);
    if (days >= 0) out.nextEarnings = { date: row.earnings_date, days };
  }
  return out;
}

async function readFacts(instrumentId: string, ticker: string, today: string): Promise<StockFacts> {
  // Sources a verdict leans on throw when their read fails, so a store hiccup is not cached for an hour as
  // "no data" (which would flip verdicts and write a false change). The rest fail soft to "unknown".
  const soft = <T,>(work: Promise<T>, fallback: T): Promise<T> => work.catch(() => fallback);
  const [snapshot, factsDoc, dividends, calls, report, ownership, moves, seriesMap, news] = await Promise.all([
    getScreenerSnapshot(),
    readStockFactsDoc(instrumentId),
    readDividends(ticker),
    soft(getStockCallHistory(instrumentId), []),
    soft(latestReportFor(ticker, today), null),
    soft(getStockOwnership(ticker, "US"), { funds: null, insiders: null }),
    soft(getRecentMoves(today), []),
    soft(loadDailySeries([ticker, "SPY"]), new Map()),
    soft(readNewsTone(ticker, `${addDays(today, -NEWS_DAYS)}T00:00:00`), null),
  ]);

  if (!snapshot) throw new Error("thesis_facts_no_snapshot");
  const row = [...snapshot.extras, ...snapshot.rows].find((item) => item.symbol === ticker) ?? null;
  if (row && !seriesMap.get(ticker)) throw new Error("thesis_facts_no_closes");
  const facts = emptyFacts(ticker, instrumentId, shortCompanyName(row?.name) || ticker, today);
  Object.assign(facts, screenerFacts(row, today));
  if (facts.revenueGrowth === null) facts.revenueGrowth = factsDoc.revenueGrowth;
  const prior = priorYearGrowth(factsDoc.years);
  if (prior) {
    facts.revenueGrowthPrior = prior.pct;
    facts.priorLabel = prior.label;
  }
  if (row) {
    const stats = sectorStats(snapshot.rows, row.sector);
    facts.sectorGrowthP25 = stats.p25;
    facts.sectorGrowthMedian = stats.median;
  }

  const series = seriesMap.get(ticker) ?? null;
  facts.close = closeOn(series, today);
  facts.recentCloses = recentClosesOn(series, today);

  if (dividends) Object.assign(facts, dividendFacts(dividends.payments, dividends.perYear, today));
  Object.assign(facts, callFacts(calls, today));

  if (report?.guidance?.change) {
    facts.guidance = { change: report.guidance.change, day: report.event_date, href: earningsDayHref(report.ticker, report.event_date) };
  }

  const insiderSince = addDays(today, -INSIDER_DAYS);
  const sales = (ownership.insiders?.rows ?? []).filter(
    (trade) => trade.action === "sell" && !trade.planned && fin(trade.valueUsd) && (trade.filedDate ?? trade.transactionDate) >= insiderSince,
  );
  if (sales.length > 0) facts.insiderSales = { usd: sales.reduce((sum, trade) => sum + (trade.valueUsd ?? 0), 0), count: sales.length };

  const fundSince = addDays(today, -FUND_DAYS);
  const cut = (ownership.funds?.rows ?? [])
    .filter((fund) => fund.action === "trimmed" && fin(fund.changePct) && fund.changePct <= -THRESHOLDS.fundCutPct && (fund.filedDate ?? "") >= fundSince)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))[0];
  const exit = (ownership.funds?.exits ?? [])
    .filter((fund) => (fund.filedDate ?? "") >= fundSince && fin(fund.prevPortfolioPct) && fund.prevPortfolioPct >= FUND_EXIT_MIN_PCT)
    .sort((a, b) => (b.prevPortfolioPct ?? 0) - (a.prevPortfolioPct ?? 0))[0];
  if (exit) facts.fundCut = { fund: exit.fund, href: exit.href, action: "sold", changePct: null, day: exit.filedDate! };
  else if (cut) facts.fundCut = { fund: cut.fund, href: cut.href, action: "trimmed", changePct: cut.changePct, day: cut.filedDate! };

  const mine = moves.filter((move) => move.ticker === ticker);
  const troubleSince = addDays(today, -TROUBLE_DAYS);
  const trouble = mine.filter((move) => move.day >= troubleSince && move.pct < 0 && namesTrouble(move.headline)).sort((a, b) => b.day.localeCompare(a.day))[0];
  if (trouble) facts.trouble = { day: trouble.day, pct: trouble.pct, headline: trouble.headline, href: moveHref(ticker, trouble.day) };
  const explained = new Set(mine.map((move) => move.day));
  facts.bigDrop = bigDropOf(series, today, (day) => explained.has(day), seriesMap.get("SPY") ?? null);

  facts.news = news;
  return facts;
}

const readFactsCached = unstable_cache(readFacts, ["thesis-watch-facts-v6"], { revalidate: 3600 });

/** Facts for each stock, by instrument id. A stock whose read fails is left out. */
export async function loadStockFacts(stocks: ReadonlyArray<{ instrumentId: string; ticker: string }>, today: string): Promise<Map<string, StockFacts>> {
  const loaded = await Promise.all(stocks.map((stock) => readFactsCached(stock.instrumentId, stock.ticker, today).catch(() => null)));
  const out = new Map<string, StockFacts>();
  stocks.forEach((stock, index) => {
    const facts = loaded[index];
    if (facts) out.set(stock.instrumentId, facts);
  });
  return out;
}

/** The close on the day a reason was saved, from the stored closes. */
export async function closesOnDays(requests: ReadonlyArray<{ ticker: string; day: string }>): Promise<Map<string, number>> {
  const series = await loadDailySeries(requests.map((request) => request.ticker)).catch(() => new Map());
  const out = new Map<string, number>();
  for (const request of requests) {
    const close = closeOn(series.get(request.ticker) ?? null, request.day);
    if (close) out.set(`${request.ticker}|${request.day}`, close.value);
  }
  return out;
}
