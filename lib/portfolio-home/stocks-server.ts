import { moveReason } from "@/lib/briefing";
import { isCircularReason } from "@/lib/reason-quality";
import { getDailyAnomalyTickers } from "@/lib/daily-anomalies";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { redactLevels } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { getInsiderBuys } from "@/lib/follow";
import { STEADY_CALLS_SINCE } from "@/lib/inbox/sources";
import { etDay } from "@/lib/insight-format";
import { getMarketDay } from "@/lib/insight-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { BENCHMARK_SYMBOL, loadDailySeries, loadDatedPrices, loadExamplePortfolio, loadNextEarnings, newYorkToday } from "@/lib/portfolio-data";
import { onOneDay } from "@/lib/portfolio-prices";
import type { CallWord } from "@/lib/portfolio-ideas/types";
import { buildPortfolio, type PortfolioRowInput } from "@/lib/portfolio-shared";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { noteDegradedRender } from "@/lib/next-render";
import { matchingCompanyReason } from "@/lib/stock-read";
import type { UserDoc } from "@/lib/watchlist";

import { PLAIN_CALL, weekMove, type BookFacts, type BookSource, type CallChangeInfo, type CallInfo, type InsiderBuyInfo, type PlainCall } from "./stocks";

/**
 * The data behind the stock cards on My stocks (./stocks.ts), from reads the app already caches: dated prices
 * (the screener snapshot, the markets page and the latest quotes, lib/portfolio-data.ts), the stored daily
 * closes, the earnings calendar, the screener's calls, insider buys (lib/follow.ts), plus two small batch reads:
 * the day's confirmed move reasons (tm_daily_anomaly_tickers) and the steady calls' change lists
 * (tm_call_stability). Never calls a model and never writes.
 */

const CALLS: readonly string[] = ["Add", "Hold", "Trim"];
/** How far back a call change or an insider buy still counts as news on the card. */
const CHANGE_DAYS = 7;
const INSIDER_DAYS = 30;
/**
 * A buy counts when it is big enough to be a bet: routine small purchases (an executive's monthly buy of a few
 * thousand dollars, as at some foreign filers) are not news about the stock. Planned (10b5-1) trades never count.
 */
const INSIDER_MIN_BUY = 25_000;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".").toUpperCase();
}

/** Our call on each stock from the screener's row; its levels only where the viewer's plan covers the stock. */
export function callsFrom(rows: Map<string, ScreenerRow>, levels: (ticker: string) => boolean, today: string): Record<string, CallInfo> {
  const out: Record<string, CallInfo> = {};
  for (const [ticker, row] of rows) {
    if (!row.call || !CALLS.includes(row.call)) continue;
    const call = row.call as CallWord;
    const covered = levels(ticker);
    const reason = matchingCompanyReason({ text: row.call_reason ?? "", call, source: row.call_reason_source ?? null }, call, today);
    out[ticker] = {
      call,
      addBelow: covered && call === "Add" && fin(row.add_below) && row.add_below > 0 ? row.add_below : null,
      trimAbove: covered && call === "Trim" && fin(row.trim_above) && row.trim_above > 0 ? row.trim_above : null,
      reason: covered ? reason : redactLevels(reason),
    };
  }
  return out;
}

/** The confirmed reason for each stock's move on the price day; a "price action" read or another day's is left out. */
async function moveReasons(tickers: string[], pricesDay: string | null): Promise<Record<string, string>> {
  const anomalies = await getDailyAnomalyTickers("US", tickers).catch(() => new Map());
  const out: Record<string, string> = {};
  for (const [ticker, anomaly] of anomalies) {
    const day = etDay(anomaly.price_as_of ?? anomaly.narrative_as_of ?? null);
    if (!pricesDay || day !== pricesDay) continue;
    const reason = moveReason(anomaly);
    // A headline that only says the move again is no reason (owner rules 7, 8): the card takes its next fact.
    if (reason.status === "confirmed" && reason.headline && !isCircularReason(reason.headline, String(ticker), anomaly.name)) out[String(ticker).toUpperCase()] = reason.headline;
  }
  return out;
}

/**
 * The steady call's latest change on each stock in the last week (tm_call_stability, the call people see), from
 * the day steady calls went live. The earlier call is named only where the plan covers the stock, as in the inbox.
 */
async function callChanges(ids: string[], today: string, covered: (id: string) => boolean): Promise<Record<string, CallChangeInfo>> {
  if (ids.length === 0) return {};
  const since = [shiftDay(today, -CHANGE_DAYS), STEADY_CALLS_SINCE].sort()[1]!;
  const collection = adminFirestore.collection("tm_call_stability");
  const snaps = await adminFirestore.getAll(...ids.map((id) => collection.doc(id))).catch(() => []);
  const out: Record<string, CallChangeInfo> = {};
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as { changes?: unknown };
    if (!Array.isArray(data.changes)) continue;
    let latest: CallChangeInfo | null = null;
    for (const raw of data.changes as Array<Record<string, unknown>>) {
      const day = typeof raw?.date === "string" ? raw.date.slice(0, 10) : "";
      const to = PLAIN_CALL[String(raw?.to) as CallWord] as PlainCall | undefined;
      const from = PLAIN_CALL[String(raw?.from) as CallWord] as PlainCall | undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || day > today || !to || from === to) continue;
      if (!latest || day >= latest.day) latest = { day, from: covered(snap.id) ? (from ?? null) : null, to };
    }
    if (latest) out[tickerFromId(snap.id)] = latest;
  }
  return out;
}

/** Open-market insider buys in the last month on each stock, from the Form 4 buys the Follow page reads. */
async function insiderBuys(tickers: string[], today: string): Promise<Record<string, InsiderBuyInfo>> {
  const wanted = new Set(tickers);
  const since = shiftDay(today, -INSIDER_DAYS);
  const buys = await getInsiderBuys().catch(() => []);
  const out: Record<string, InsiderBuyInfo & { people: Set<string>; roles: Set<string> }> = {};
  for (const trade of buys) {
    const ticker = trade.symbol.toUpperCase();
    const day = (trade.transaction_date || "").slice(0, 10);
    if (!wanted.has(ticker) || trade.tx_type !== "buy" || trade.plan_10b5_1 || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || day > today) continue;
    if (!fin(trade.value) || trade.value < INSIDER_MIN_BUY) continue;
    const entry = (out[ticker] ??= { count: 0, value: null, day, who: null, people: new Set(), roles: new Set() });
    entry.count += 1;
    if (fin(trade.value) && trade.value > 0) entry.value = (entry.value ?? 0) + trade.value;
    if (day > entry.day) entry.day = day;
    entry.people.add(trade.insider_id || trade.insider);
    if (trade.role) entry.roles.add(trade.role.trim());
  }
  const result: Record<string, InsiderBuyInfo> = {};
  for (const [ticker, entry] of Object.entries(out)) {
    const people = entry.people.size;
    const role = people === 1 && entry.roles.size === 1 ? [...entry.roles][0]! : null;
    // A short title reads as a person ("the CEO"); a long one ("Director, 10% Owner") does not.
    const who = role && role.length <= 24 && !/,/.test(role) ? `the ${/^[A-Z]{2,5}$/.test(role) ? role : role.toLowerCase()}` : null;
    result[ticker] = { count: people, value: entry.value, day: entry.day, who };
  }
  return result;
}

async function facts(input: { tickers: string[]; ids: string[]; pricesDay: string | null; today: string; calls: Record<string, CallInfo>; levels: (ticker: string) => boolean }): Promise<BookSource["facts"]> {
  const [moves, changes, insiders] = await Promise.all([
    moveReasons(input.tickers, input.pricesDay),
    callChanges(input.ids, input.today, (id) => input.levels(tickerFromId(id))),
    insiderBuys(input.tickers, input.today),
  ]);
  return { calls: input.calls, moves, callChanges: changes, insiderBuys: insiders };
}

/** The example portfolio (lib/portfolio-data.ts), with the calls anyone can see and no levels. */
export async function loadExampleBook(now: Date = new Date()): Promise<BookSource | null> {
  const example = await loadExamplePortfolio();
  if (!example) return null;
  const today = newYorkToday(now);
  const portfolio = example.portfolio;
  const tickers = portfolio.positions.map((position) => position.ticker);
  const [rows, series] = await Promise.all([getScreenerRows(tickers).catch(() => {
      // No calls on the cards: a cached copy (the signed-out page) built like this is kept for seconds only.
      noteDegradedRender();
      return new Map<string, ScreenerRow>();
    }), loadDailySeries([...tickers, BENCHMARK_SYMBOL])]);
  const none = () => false;
  return {
    mode: "example",
    today,
    portfolio,
    pricesDay: example.pricesAsOf,
    marketPct: example.marketPct,
    week: weekMove({ positions: portfolio.positions, series, benchmark: series.get(BENCHMARK_SYMBOL) ?? null, pricesDay: example.pricesAsOf, marketPct: example.marketPct }),
    facts: await facts({
      tickers,
      ids: portfolio.positions.map((position) => position.instrument_id),
      pricesDay: example.pricesAsOf,
      today,
      calls: callsFrom(rows, none, today),
      levels: none,
    }),
  };
}

/**
 * A signed-in person's US holdings, priced on the same dated quotes as the example (the newest of the snapshot, the
 * markets page and the latest quote), with their share counts and costs from their own doc.
 */
export async function loadUserBook(userDoc: UserDoc, viewer: Viewer, now: Date = new Date()): Promise<BookSource | null> {
  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const kinds = userDoc.watchlist_positions ?? {};
  const ids = [...new Set(tracked.filter((id) => kinds[id] === "holding" && id.startsWith("US_")))];
  if (ids.length === 0) return null;
  const today = newYorkToday(now);
  const labels = await getInstrumentLabels(ids).catch(() => new Map<string, { ticker: string; name: string }>());
  // One card per ticker: two ids that name the same stock keep the first.
  const tickerOf = new Map<string, string>();
  for (const id of ids) {
    const ticker = (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
    if (![...tickerOf.values()].includes(ticker)) tickerOf.set(id, ticker);
  }
  const tickers = [...new Set(tickerOf.values())];
  const [dated, rows, series, earnings, market] = await Promise.all([
    loadDatedPrices([...tickers, BENCHMARK_SYMBOL]),
    getScreenerRows(tickers).catch(() => {
      // The cards go without calls this once. A signed-in page is rendered live, so this only matters if the render
      // is ever cached: then that copy is kept for seconds, not minutes.
      noteDegradedRender();
      return new Map<string, ScreenerRow>();
    }),
    loadDailySeries([...tickers, BENCHMARK_SYMBOL]),
    loadNextEarnings(today),
    getMarketDay(),
  ]);
  const { day, prices } = onOneDay(dated);
  const levels = (ticker: string) => canSeeLevels(viewer, `US_${ticker}`);
  const calls = callsFrom(rows, levels, today);
  const inputs: PortfolioRowInput[] = [...tickerOf.keys()].map((id) => {
    const ticker = tickerOf.get(id)!;
    const quote = prices.get(ticker);
    const call = calls[ticker];
    return {
      instrument_id: id,
      ticker,
      name: labels.get(id)?.name || rows.get(ticker)?.name || ticker,
      sector: rows.get(ticker)?.sector ?? null,
      kind: "holding",
      price: quote?.price ?? null,
      day_change_pct: quote?.dayPct ?? null,
      stance: call ? call.call.toLowerCase() : null,
      zones: call ? { accumulate_below: call.addBelow, trim_above: call.trimAbove } : null,
    };
  });
  const portfolio = buildPortfolio({
    rows: inputs,
    holdings: userDoc.watchlist_holdings ?? null,
    earnings,
    series,
    benchmark: series.get(BENCHMARK_SYMBOL) ?? null,
    today,
  });
  const spy = prices.get(BENCHMARK_SYMBOL);
  const marketPct = market && market.day === day ? market.pct : spy && fin(spy.dayPct) ? spy.dayPct : null;
  return {
    mode: "mine",
    today,
    portfolio,
    pricesDay: day,
    marketPct,
    week: weekMove({ positions: portfolio.positions, series, benchmark: series.get(BENCHMARK_SYMBOL) ?? null, pricesDay: day, marketPct }),
    facts: await facts({ tickers, ids: [...tickerOf.keys()], pricesDay: day, today, calls, levels }),
  };
}
