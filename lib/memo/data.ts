import { unstable_cache } from "next/cache";

import { getEarnings } from "@/lib/earnings";
import { listEarningsDayReports } from "@/lib/earnings-day";
import type { EarningsDayReport } from "@/lib/earnings-day-shared";
import { loadDividendPlan, type HoldingSeed } from "@/lib/dividend-plan-data";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { shortCompanyName } from "@/lib/plain-copy";
import { BENCHMARK_SYMBOL, FUNDS_SECTOR, loadDailySeries, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { getMovesDay } from "@/lib/seo/family-data";
import { getStockCallHistory, getStockCongressTrades } from "@/lib/stock-events";
import { callChanges } from "@/lib/stock-chart";
import { getStockOwnership } from "@/lib/stock-ownership";
import { buildStressView } from "@/lib/stress-test-data";
import type { UserDoc } from "@/lib/watchlist";
import { loadExampleXray, loadUserXray, type XrayView } from "@/lib/xray-data";

import type {
  DailySeries,
  MemoCall,
  MemoCongress,
  MemoDividend,
  MemoExposure,
  MemoFundMove,
  MemoHolding,
  MemoInputs,
  MemoInsider,
  MemoMove,
  MemoReport,
  MemoStress,
  MemoSubject,
  MemoUpcoming,
} from "./types";
import { callReason } from "./reason";
import { addDays, memoWeekFor, pastWeek, weekdayOf, type MemoWeek } from "./week";

/**
 * Server inputs for the memo, read from data the app already stores:
 * - closes: `tm_price_history_daily` (lib/portfolio-data.ts)
 * - calls: `tm_directive_history/{id}/calls` (lib/stock-events.ts)
 * - explained moves: `tm_daily_anomalies/US__{day}` (lib/seo/family-data.ts)
 * - earnings reports: `tm_earnings_day`; the calendar: `tm_earnings_events`
 * - 13F and Form 4: `tm_fund_holders`, `tm_insider_trades` (lib/stock-ownership.ts)
 * - Congress: `tm_power_trades`
 * - look-through exposure, dividends and past shocks: lib/xray-data.ts,
 *   lib/dividend-plan-data.ts, lib/stress-test-data.ts
 * Read-only. Every loader fails soft to "nothing found".
 */

/** Holdings the memo looks at, most valuable first; enough for any real portfolio, and a cap on reads. */
const MAX_HOLDINGS = 40;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const FUND_NAME = /\b(ETF|ETN|Fund|SPDR|iShares|ProShares|Direxion|Trust)\b/i;

export type HoldingSource = {
  subject: MemoSubject;
  holdings: MemoHolding[];
  /** For the shape facts (x-ray, dividends, stress), loaded only for the current week. */
  userDoc: UserDoc | null;
  /**
   * What the memo is written from, from the person's own entries (not prices):
   * a change rewrites the current week, a price tick does not.
   */
  signature: string;
};

/* ── whose holdings ─────────────────────────────────────────────────────── */

/** The example portfolio the Portfolio page shows visitors. `covered` decides which reasons it may show. */
export async function exampleHoldings(covered: (ticker: string) => boolean): Promise<HoldingSource | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const holdings = example.portfolio.positions
    .filter((position) => position.kind === "holding")
    .map((position) => ({
      ticker: position.ticker,
      name: shortCompanyName(position.name) || position.ticker,
      instrumentId: position.instrument_id,
      units: fin(position.shares) && position.shares > 0 ? position.shares : null,
      fund: position.sector === FUNDS_SECTOR,
      covered: covered(position.ticker),
    }));
  return holdings.length >= 2 ? { subject: "example", holdings, userDoc: null, signature: "example" } : null;
}

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".");
}

/** A signed-in person's US holdings. Shares where entered, else shares implied by an entered value at the latest price. */
export async function userHoldings(userDoc: UserDoc | null, covered: (instrumentId: string) => boolean): Promise<HoldingSource | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const entered = userDoc?.watchlist_holdings ?? {};
  const ids = tracked.filter((id) => typeof id === "string" && kinds[id] === "holding" && id.startsWith("US_"));
  if (ids.length === 0) return null;
  const [labels, quotes] = await Promise.all([
    getInstrumentLabels(ids).catch(() => new Map()),
    getLatestPriceQuotes(ids).catch(() => new Map()),
  ]);
  const rows = ids.map((id) => {
    const label = labels.get(id);
    const ticker = (label?.ticker || tickerFromId(id)).toUpperCase();
    const name = shortCompanyName(label?.name) || ticker;
    const holding = entered[id];
    const price = quotes.get(id)?.quote?.current;
    const quantity = fin(holding?.quantity) && holding!.quantity! > 0 ? holding!.quantity! : null;
    const value = fin(holding?.market_value) && holding!.market_value! > 0 ? holding!.market_value! : null;
    const units = quantity ?? (value !== null && fin(price) && price > 0 ? value / price : null);
    return {
      ticker,
      name,
      instrumentId: id,
      units,
      fund: FUND_NAME.test(label?.name ?? ""),
      covered: covered(id),
      sortValue: units !== null && fin(price) ? units * price : value ?? 0,
      key: `${ticker}:${quantity ?? "-"}:${value ?? "-"}:${covered(id) ? 1 : 0}`,
    };
  });
  rows.sort((a, b) => b.sortValue - a.sortValue);
  const kept = rows.slice(0, MAX_HOLDINGS);
  const holdings: MemoHolding[] = kept.map(({ sortValue: _sortValue, key: _key, ...holding }) => holding);
  const signature = kept.map((row) => row.key).sort().join(",");
  return holdings.length >= 1 ? { subject: "mine", holdings, userDoc, signature } : null;
}

/* ── the week ───────────────────────────────────────────────────────────── */

/** The current memo week from the newest S&P 500 close, and the series loaded on the way. */
export async function currentWeek(tickers: string[], now: Date = new Date()): Promise<{ week: MemoWeek; series: Map<string, DailySeries>; today: string } | null> {
  const today = newYorkToday(now);
  const series = await loadDailySeries([...tickers, BENCHMARK_SYMBOL]);
  const spy = series.get(BENCHMARK_SYMBOL);
  const last = spy?.dates[spy.dates.length - 1];
  if (!last) return null;
  return { week: memoWeekFor(last > today ? today : last, today), series, today };
}

/** The finished week before `week`, ending on its last close in the stored S&P 500 series. */
export function previousWeek(week: MemoWeek, benchmark: DailySeries | null | undefined): MemoWeek {
  const monday = addDays(week.monday, -7);
  const friday = addDays(monday, 4);
  let last: string | null = null;
  for (const day of benchmark?.dates ?? []) if (day >= monday && day <= friday) last = day;
  return pastWeek(monday, last);
}

/* ── events over a span of weeks ────────────────────────────────────────── */

type Span = { from: string; to: string; today: string };

function weekdaysIn(span: Span): string[] {
  const out: string[] = [];
  for (let day = span.from; day <= span.to && day <= span.today; day = addDays(day, 1)) if (weekdayOf(day) < 5) out.push(day);
  return out;
}

// Only the holdings' reports are cached (the whole market's would be large in earnings season).
const reportsSince = unstable_cache(
  async (since: string, tickersKey: string) => {
    const wanted = new Set(tickersKey.split(","));
    const reports = await listEarningsDayReports(since).catch(() => [] as EarningsDayReport[]);
    return reports.filter((report) => wanted.has(report.ticker));
  },
  ["memo-earnings-day-reports-v2"],
  { revalidate: 1800 },
);

function toReport(report: EarningsDayReport): MemoReport {
  const reaction = report.reaction ?? null;
  return {
    ticker: report.ticker,
    day: report.event_date,
    verdict: report.eps?.verdict ?? null,
    epsActual: fin(report.eps?.actual) ? report.eps!.actual : null,
    epsEstimate: fin(report.eps?.estimate) ? report.eps!.estimate : null,
    revenueYoyPct: fin(report.revenue?.yoy_pct) ? report.revenue!.yoy_pct! : null,
    guidance: report.guidance?.change ?? null,
    reactionPct: reaction && fin(reaction.pct) && reaction.final ? reaction.pct : null,
    reactionBasis: reaction?.basis ?? null,
    typicalAbsPct: reaction && fin(reaction.typical_abs_pct) ? reaction.typical_abs_pct : null,
  };
}

export type SpanEvents = Pick<MemoInputs, "calls" | "moves" | "reports" | "upcoming" | "funds" | "insiders" | "congress">;

/**
 * Everything event-like for the holdings between two days, so several weeks
 * share one set of reads. Each week's facts then keep only their own days.
 */
export async function loadSpanEvents(holdings: MemoHolding[], span: Span): Promise<SpanEvents> {
  const tickers = holdings.map((holding) => holding.ticker);
  const wanted = new Set(tickers);
  const upcomingTo = addDays(span.to, 7);

  const [callLists, screener, moveDays, reports, calendar, ownership, congressLists] = await Promise.all([
    Promise.all(holdings.map((holding) => getStockCallHistory(holding.instrumentId).catch(() => []))),
    getScreenerRows(tickers).catch(() => new Map<string, ScreenerRow>()),
    Promise.all(weekdaysIn(span).map((day) => getMovesDay(day).catch(() => []))),
    reportsSince(addDays(span.from, -120), [...wanted].sort().join(",")),
    getEarnings("US", addDays(span.from, 1), upcomingTo).catch(() => []),
    Promise.all(tickers.map((ticker) => getStockOwnership(ticker, "US").catch(() => null))),
    Promise.all(tickers.map((ticker) => getStockCongressTrades(ticker).catch(() => []))),
  ]);

  // From two weeks before the span: a change early in a week can undo one from the week before, and the memo's call
  // rule needs to see it (lib/memo/facts.ts callFlip, owner rule 9). Each week's facts keep only their own days.
  const callsFrom = addDays(span.from, -14);
  const calls: MemoCall[] = holdings.flatMap((holding, index) =>
    callChanges(callLists[index] ?? [])
      .filter((change) => change.date >= callsFrom && change.date <= span.to)
      .map((change) => ({ ticker: holding.ticker, date: change.date, from: change.from, to: change.to, text: callReason(screener.get(holding.ticker), change, span.today) })),
  );

  const moves: MemoMove[] = moveDays
    .flat()
    .filter((move) => wanted.has(move.ticker))
    .map((move) => ({ ticker: move.ticker, day: move.day, pct: move.pct, headline: move.headline, why: move.why }));

  const inSpan = reports.filter((report) => wanted.has(report.ticker) && report.event_date >= span.from && report.event_date <= span.to);
  // The typical report-day move, from each stock's newest report.
  const typical = new Map<string, number>();
  for (const report of [...reports].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
    const value = report.reaction?.typical_abs_pct;
    if (wanted.has(report.ticker) && fin(value)) typical.set(report.ticker, value);
  }

  const seenUpcoming = new Set<string>();
  const upcoming: MemoUpcoming[] = [];
  for (const event of calendar) {
    const ticker = String(event.ticker || "").toUpperCase();
    if (!wanted.has(ticker) || !event.event_date) continue;
    const key = `${ticker}|${event.event_date}`;
    if (seenUpcoming.has(key)) continue;
    seenUpcoming.add(key);
    const time = event.time === "bmo" || event.time === "amc" || event.time === "during" ? event.time : null;
    upcoming.push({ ticker, date: event.event_date, time, typicalAbsPct: typical.get(ticker) ?? null });
  }

  const funds: MemoFundMove[] = [];
  const insiders: MemoInsider[] = [];
  tickers.forEach((ticker, index) => {
    const own = ownership[index];
    for (const row of own?.funds?.rows ?? []) {
      if (!row.filedDate || row.filedDate < span.from || row.filedDate > span.to) continue;
      if (row.action !== "new" && row.action !== "added" && row.action !== "trimmed") continue;
      funds.push({ ticker, fund: row.fund, slug: row.slug, action: row.action, changePct: row.changePct, filedDate: row.filedDate });
    }
    for (const exit of own?.funds?.exits ?? []) {
      if (!exit.filedDate || exit.filedDate < span.from || exit.filedDate > span.to) continue;
      funds.push({ ticker, fund: exit.fund, slug: exit.slug, action: "sold", changePct: null, filedDate: exit.filedDate });
    }
    for (const trade of own?.insiders?.rows ?? []) {
      const filed = trade.filedDate ?? trade.transactionDate;
      if (filed < span.from || filed > span.to) continue;
      insiders.push({ ticker, insider: trade.insider, action: trade.action, valueUsd: trade.valueUsd, planned: trade.planned, filedDate: filed });
    }
  });

  const congress: MemoCongress[] = tickers.flatMap((ticker, index) =>
    (congressLists[index] ?? [])
      .filter((trade) => (trade.tx_type === "buy" || trade.tx_type === "sell") && trade.disclosure_date >= span.from && trade.disclosure_date <= span.to)
      .map((trade) => ({
        ticker,
        person: String(trade.person_name || "").trim() || "A member of Congress",
        action: trade.tx_type === "buy" ? ("buy" as const) : ("sell" as const),
        amountLow: fin(trade.amount_low) ? trade.amount_low : null,
        amountHigh: fin(trade.amount_high) ? trade.amount_high : null,
        disclosureDate: String(trade.disclosure_date).slice(0, 10),
      })),
  );

  return { calls, moves, reports: inSpan.map(toReport), upcoming, funds, insiders, congress };
}

/* ── the shape of the portfolio today ───────────────────────────────────── */

export type ShapeFacts = Pick<MemoInputs, "exposure" | "dividends" | "stress" | "reasons">;

function exposureOf(view: XrayView | null): MemoExposure | null {
  if (!view || view.xray.total <= 0) return null;
  const top = view.xray.companies[0];
  const sector = view.xray.sectors.find((row) => row.sector !== FUNDS_SECTOR) ?? null;
  return {
    company: top
      ? { ticker: top.ticker, name: shortCompanyName(top.name) || top.ticker, pct: top.pct, fundPct: top.fundPct, via: top.via.map((slice) => slice.fund) }
      : null,
    sector: sector ? { sector: sector.sector, pct: sector.pct, benchmarkPct: sector.benchmarkPct } : null,
    asOf: view.xray.asOfDates[view.xray.asOfDates.length - 1] ?? null,
  };
}

async function dividendsOf(seeds: HoldingSeed[]): Promise<MemoDividend[]> {
  if (seeds.length === 0) return [];
  const { plan } = await loadDividendPlan(seeds);
  const out: MemoDividend[] = [];
  for (const stock of plan.stocks) {
    const confirmed = stock.payments.filter((payment) => payment.status === "confirmed" && !payment.paid);
    for (const payment of confirmed) {
      out.push({
        ticker: stock.ticker,
        name: stock.name,
        exDate: payment.exDate,
        payDate: payment.payDateKnown ? payment.payDate : null,
        perShare: payment.perShare,
        amount: payment.amount,
        changePct: stock.changePct,
        atRisk: stock.atRisk,
        payout: stock.payout,
      });
    }
    if (confirmed.length === 0 && stock.atRisk && fin(stock.payout)) {
      // Kept for the "stretched dividend" line; no ex-date in the window.
      out.push({ ticker: stock.ticker, name: stock.name, exDate: null, payDate: null, perShare: null, amount: null, changePct: stock.changePct, atRisk: true, payout: stock.payout });
    }
  }
  return out;
}

/** The most recent past fall with figures for both the mix and the S&P 500. */
function stressOf(result: Awaited<ReturnType<typeof buildStressView>>): MemoStress | null {
  const falls = (result?.result.episodes ?? []).filter((row) => row.episode.kind === "fall" && fin(row.portfolio) && fin(row.market));
  const latest = falls.sort((a, b) => b.episode.start.localeCompare(a.episode.start))[0];
  return latest ? { name: latest.episode.name, start: latest.episode.start, end: latest.episode.end, portfolio: latest.portfolio!, market: latest.market! } : null;
}

/**
 * The portfolio-shape facts for the current week. `deep` is the deeper Analysis work (inside the funds, past
 * crashes, lib/entitlements.ts portfolio_analysis_deep): without it the funds are not opened and no crash is replayed,
 * so a Free memo carries neither. Dividends are free either way.
 */
export async function loadShapeFacts(source: HoldingSource, series: Map<string, DailySeries>, deep: boolean): Promise<ShapeFacts> {
  const lastClose = (ticker: string) => {
    const closes = series.get(ticker)?.closes;
    return closes && closes.length > 0 ? closes[closes.length - 1]! : null;
  };
  const valued = source.holdings.map((holding) => {
    const price = lastClose(holding.ticker);
    return { ticker: holding.ticker, name: holding.name, value: holding.units !== null && price !== null ? holding.units * price : null };
  });
  const seeds: HoldingSeed[] = source.holdings.filter((holding) => !holding.fund).map((holding) => ({
    ticker: holding.ticker,
    name: holding.name,
    shares: holding.units,
    avgCost: null,
  }));
  const [xray, dividends, stress] = await Promise.all([
    deep ? (source.subject === "example" ? loadExampleXray() : loadUserXray(source.userDoc)).catch(() => null) : null,
    dividendsOf(seeds).catch(() => [] as MemoDividend[]),
    deep ? buildStressView(valued, source.subject === "example" ? "example" : "live", null).catch(() => null) : null,
  ]);
  return { exposure: exposureOf(xray), dividends, stress: stressOf(stress) };
}

/** The span of days a set of weeks covers, from the first Monday to the last Friday. */
export function spanOf(weeks: MemoWeek[], today: string): Span {
  const mondays = weeks.map((week) => week.monday).sort();
  const fridays = weeks.map((week) => week.friday).sort();
  return { from: mondays[0]!, to: fridays[fridays.length - 1]!, today };
}

