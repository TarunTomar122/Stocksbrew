import { unstable_cache } from "next/cache";

import { loadDividendPlan, type HoldingSeed } from "@/lib/dividend-plan-data";
import { can, type Plan } from "@/lib/entitlements";
import { canSeeLevels, getViewer, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSnapshotFacts } from "@/lib/insight-data";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { callsFrom } from "@/lib/portfolio-home/stocks-server";
import type { CallInfo } from "@/lib/portfolio-home/stocks";
import { BENCHMARK_SYMBOL, loadDatedPrices, loadExamplePortfolio, loadNextEarnings, newYorkToday } from "@/lib/portfolio-data";
import { onOneDay } from "@/lib/portfolio-prices";
import { FUNDS_SECTOR, buildPortfolio, type Portfolio, type PortfolioRowInput } from "@/lib/portfolio-shared";
import { getScreenerRows, getScreenerSnapshot, isCompleteSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { sharedCache } from "@/lib/shared-cache";
import { EPISODES, episodeCloses, type EpisodeCloses } from "@/lib/stress-test";
import { stressViewFrom } from "@/lib/stress-test-data";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";
import { buildXray, type FundDoc, type FundStatus, type XrayPositionInput } from "@/lib/xray";

import { buildCalls, buildEarnings, buildIncome } from "./book";
import { computeMarketAnalysis, type MarketAnalysis, type MixLine } from "./compute";
import { returnsFromCloses } from "./market";
import type { CloseSeries } from "./stats";
import type { DeepModuleId, PortfolioAnalysis } from "./types";

/**
 * The server side of the analysis on /portfolio/xray. Read-only.
 *
 * The heavy part (a year of daily closes per holding, fund filings, the crash windows, the screener) depends only
 * on the mix and the day, so it is worked out once per mix (tickers, weights to a tenth of a percent, the price day) and
 * kept in the shared data cache for every visitor with that mix (`sharedCache`, keyed by its argument). The small
 * per-person parts (our calls and their levels by plan, the earnings dates, dividends from share counts) are done
 * per request. Pro and Free differ only in which finished modules are sent: the Free plan never receives the
 * deeper ones.
 */

export const ANALYSIS_VERSION = 5;
/** A year and a little more of closes: enough for 252 daily returns. */
const SERIES_POINTS = 300;
/** S&P 500 funds, in the order their filings are tried for the index's own concentration. */
const SP500_FUNDS = ["SPY", "VOO", "IVV"];
const FUND_NAME = /\b(ETF|ETN|Fund|SPDR|iShares|ProShares|Direxion|Trust, Series)\b/i;
const DEEP: DeepModuleId[] = ["overlap", "risk", "correlation", "crashes", "attribution", "lean"];

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/* ── reads, a few at a time ─────────────────────────────────────────────── */

/** How many store reads one mix has in flight at once: a 40-holding mix should not open 80 requests to the store. */
const READS_AT_ONCE = 8;

/** Runs the jobs it is given at most `max` at a time, in the order they come. */
function readLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await job();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

type Limit = ReturnType<typeof readLimiter>;

/* ── closes, with whether they are adjusted ─────────────────────────────── */

/** A year of closes, and the closes at each past crash's edges cut from the same read (for the crash replay). */
type StoredSeries = CloseSeries & { fund: boolean; episodes: EpisodeCloses };

class NoSeries extends Error {
  name = "NoSeries";
}

async function readSeries(symbol: string): Promise<StoredSeries> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  const raw = doc.exists ? (doc.data() as { dates?: unknown; closes?: unknown; adjusted?: unknown; instrument_type?: unknown }) : null;
  const dates = Array.isArray(raw?.dates) ? raw!.dates : [];
  const closes = Array.isArray(raw?.closes) ? raw!.closes : [];
  const n = Math.min(dates.length, closes.length);
  const fund = raw?.instrument_type === "ETF" || raw?.instrument_type === "MUTUALFUND";
  const all = { dates: [] as string[], closes: [] as number[] };
  for (let i = 0; i < n; i++) {
    const date = dates[i];
    const close = closes[i];
    if (typeof date === "string" && fin(close) && close > 0) {
      all.dates.push(date);
      all.closes.push(close);
    }
  }
  // Thrown, not returned, so a symbol the price job has not reached yet is not cached as "no history".
  if (all.dates.length < 2) throw new NoSeries(symbol);
  return {
    dates: all.dates.slice(-SERIES_POINTS),
    closes: all.closes.slice(-SERIES_POINTS),
    adjusted: raw?.adjusted !== false,
    fund,
    episodes: episodeCloses(all, EPISODES, fund),
  };
}

// The episode windows are part of the key, so editing EPISODES never serves edges cut for the old list.
const EPISODE_KEY = EPISODES.map((episode) => `${episode.id}:${episode.start}:${episode.end}`).join(",");
const getSeries = unstable_cache(readSeries, ["portfolio-analysis-series-v2", EPISODE_KEY], { revalidate: 3 * 3600 });

/**
 * Closes per symbol; null for a symbol with no stored history. A read that fails (the store is unreachable) throws,
 * so a half-loaded mix is never kept in the shared cache: the next visit tries again.
 */
async function loadSeries(symbols: string[], limit: Limit): Promise<Record<string, StoredSeries | null>> {
  const unique = [...new Set(symbols)];
  const loaded = await Promise.all(
    unique.map((symbol) =>
      limit(() => getSeries(symbol)).catch((error: unknown) => {
        if (error instanceof NoSeries || (error instanceof Error && error.name === "NoSeries") || String(error).includes("NoSeries")) return null;
        throw error;
      }),
    ),
  );
  return Object.fromEntries(unique.map((symbol, index) => [symbol, loaded[index] ?? null]));
}

/** Only the closes up to the price day, so a mix priced on Tuesday is never compared with Wednesday's closes. */
function upTo<T extends CloseSeries>(series: T | null, day: string | null): T | null {
  if (!series || !day) return series;
  let end = series.dates.length;
  while (end > 0 && series.dates[end - 1]! > day) end--;
  return end === series.dates.length ? series : { ...series, dates: series.dates.slice(0, end), closes: series.closes.slice(0, end) };
}

/* ── fund filings, read strictly ───────────────────────────────────────── */

type RawFund = { fund_name?: unknown; as_of?: unknown; filed_at?: unknown; source_url?: unknown; status?: unknown; note?: unknown; holdings?: unknown };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * One fund's holdings (`tm_etf_holdings`, the same documents lib/xray-data.ts reads). Unlike that loader, a failed
 * read throws: only a missing document means "no filing", so a dropped connection never reads as a fund we cannot open.
 */
async function readFund(ticker: string): Promise<FundDoc | null> {
  const snap = await adminFirestore.collection("tm_etf_holdings").doc(ticker).get();
  if (!snap.exists) return null;
  const raw = snap.data() as RawFund;
  const status: FundStatus = raw.status === "derivatives" || raw.status === "not_stocks" ? raw.status : "ok";
  const holdings = Array.isArray(raw.holdings)
    ? (raw.holdings as Array<{ ticker?: unknown; name?: unknown; weight?: unknown }>)
        .filter((row) => typeof row.ticker === "string" && typeof row.weight === "number" && Number.isFinite(row.weight) && row.weight > 0)
        .map((row) => ({ ticker: String(row.ticker).toUpperCase(), name: text(row.name) ?? String(row.ticker), weight: row.weight as number }))
    : [];
  return { ticker, fundName: text(raw.fund_name) ?? ticker, asOf: text(raw.as_of), filedAt: text(raw.filed_at), sourceUrl: text(raw.source_url), status, note: text(raw.note), holdings };
}

const getFund = unstable_cache(readFund, ["portfolio-analysis-fund-v1"], { revalidate: 3600 });

async function loadFundsStrict(tickers: string[], limit: Limit): Promise<Record<string, FundDoc>> {
  const unique = [...new Set(tickers)];
  const docs = await Promise.all(unique.map((ticker) => limit(() => getFund(ticker))));
  const out: Record<string, FundDoc> = {};
  unique.forEach((ticker, index) => {
    const doc = docs[index];
    if (doc) out[ticker] = doc;
  });
  return out;
}

/* ── the shared, mix-only part ──────────────────────────────────────────── */

type MixKey = { v: number; day: string; lines: Array<[ticker: string, weight: number]> };

type MixLineInput = { ticker: string; name: string; weight: number; sector: string | null };

/**
 * The names and sectors of the mix being worked out, by key. They are not part of the key, so two people whose mixes
 * differ only in how a name is written share one entry; the first one's words are what the entry keeps. Set for the
 * length of the call that may fill the cache (loadMix), read by computeMix.
 */
const mixWords = new Map<string, Map<string, Pick<MixLineInput, "name" | "sector">>>();

async function computeMix(key: string): Promise<MarketAnalysis> {
  const mix = JSON.parse(key) as MixKey;
  const words = mixWords.get(key);
  const tickers = mix.lines.map(([ticker]) => ticker);
  const limit = readLimiter(READS_AT_ONCE);
  const [rawSeries, funds, snapshot, facts] = await Promise.all([
    loadSeries([...tickers, BENCHMARK_SYMBOL], limit),
    loadFundsStrict([...tickers, ...SP500_FUNDS], limit),
    getScreenerSnapshot(),
    getSnapshotFacts([]),
  ]);
  // Neither is ever legitimately missing, so their absence means a failed read: throw, and nothing is cached.
  if (!isCompleteSnapshot(snapshot)) throw new Error("screener snapshot unavailable or partial");
  if (!rawSeries[BENCHMARK_SYMBOL]) throw new Error("S&P 500 closes unavailable");
  const series: Record<string, StoredSeries | null> = {};
  for (const [symbol, value] of Object.entries(rawSeries)) series[symbol] = upTo(value, mix.day);

  const rowOf = new Map<string, ScreenerRow>();
  for (const row of [...snapshot.rows, ...snapshot.extras]) if (row.symbol && !rowOf.has(row.symbol)) rowOf.set(row.symbol, row);
  const lines: MixLine[] = mix.lines.map(([ticker, weight]) => {
    const row = rowOf.get(ticker);
    const name = words?.get(ticker)?.name || row?.name || ticker;
    const sector = words?.get(ticker)?.sector ?? row?.sector ?? (FUND_NAME.test(name) ? FUNDS_SECTOR : null);
    return { ticker, name, weight, sector, fund: sector === FUNDS_SECTOR || Boolean(series[ticker]?.fund) || Boolean(funds[ticker]) || FUND_NAME.test(name) };
  });

  const positions: XrayPositionInput[] = lines.map((line) => ({ ticker: line.ticker, name: line.name, value: line.weight, looksLikeFund: line.fund }));
  const sectorOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  for (const [symbol, row] of rowOf) {
    if (row.sector) sectorOf[symbol] = row.sector;
    if (row.name) nameOf[symbol] = row.name;
  }
  for (const line of lines) if (!nameOf[line.ticker]) nameOf[line.ticker] = line.name;
  const benchmarkFund = SP500_FUNDS.map((ticker) => funds[ticker]).find((doc) => doc && doc.status === "ok" && doc.holdings.length >= 5) ?? null;
  const ownFunds = Object.fromEntries(tickers.filter((ticker) => funds[ticker]).map((ticker) => [ticker, funds[ticker]!]));
  const xray = lines.some((line) => line.fund)
    ? buildXray(positions, { funds: ownFunds, sectorOf, nameOf, benchmarkSectors: facts.spSectorWeights, benchmark: benchmarkFund })
    : null;

  // The crash replay from the same reads as the year of closes (their episode edges), not a second read per holding.
  const edges = new Map<string, EpisodeCloses>();
  for (const [symbol, value] of Object.entries(rawSeries)) if (value) edges.set(symbol.toUpperCase(), value.episodes);
  const stress = stressViewFrom(
    lines.map((line) => ({ ticker: line.ticker, name: line.name, value: line.weight })),
    "live",
    null,
    edges,
  );

  // A holding the screener does not carry (some funds) takes its returns from its own closes, so it is not left out.
  for (const line of lines) {
    const row = rowOf.get(line.ticker);
    if (row && [row.ret_1m, row.ret_3m, row.ret_ytd].every((value) => typeof value === "number")) continue;
    const own = returnsFromCloses(series[line.ticker], mix.day);
    if (own) rowOf.set(line.ticker, { ...(row ?? { symbol: line.ticker }), ...Object.fromEntries(Object.entries(own).filter(([, value]) => value !== undefined)) });
  }
  const spRows = snapshot.rows.filter((row) => row.indexes?.includes("S&P 500"));
  const spyRow = rowOf.get(BENCHMARK_SYMBOL) ?? null;
  const spy = spyRow && typeof spyRow.ret_6m === "number" ? spyRow : returnsFromCloses(series[BENCHMARK_SYMBOL], mix.day);
  return computeMarketAnalysis({
    lines,
    series,
    benchmark: series[BENCHMARK_SYMBOL] ?? null,
    xray,
    benchmarkFund,
    spSectors: facts.spSectorWeights,
    nameOf,
    stress: stress?.result ?? null,
    rows: rowOf,
    spRows,
    spyReturns: spy,
    screenerDay: snapshot.meta.price_history_to ?? null,
  });
}

// Prices move once a day for this purpose (the key carries the day), so a few hours is plenty.
const cachedMix = sharedCache(computeMix, [`portfolio-analysis-mix-v${ANALYSIS_VERSION}`], { revalidate: 3 * 3600 });

/** The mix, tried twice: a read that drops once (the store is across the network) should not blank the page. */
async function loadMix(day: string, lines: ReadonlyArray<MixLineInput>): Promise<MarketAnalysis | null> {
  const key = mixKey(day, lines);
  const words = new Map(lines.map((line) => [line.ticker.toUpperCase(), { name: line.name, sector: line.sector }]));
  mixWords.set(key, words);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await cachedMix(key);
      } catch (error) {
        console.warn(`[portfolio-analysis] mix failed (try ${attempt}):`, error instanceof Error ? error.message : error);
      }
    }
    return null;
  } finally {
    // Another request for the same key may have set its own words meanwhile; only ours are taken back.
    if (mixWords.get(key) === words) mixWords.delete(key);
  }
}

/**
 * A weight in the key, to a tenth of a percent. The cached result is worked out from these weights, so whole
 * percents were too coarse: NVDA at 17.4% and MSFT at 16.7% both became 17% and the "largest" flipped to MSFT.
 */
function keyWeight(weight: number): number {
  return Math.round(weight * 10) / 10;
}

/**
 * The key for one mix: tickers in order and weights to 0.1% (names and sectors left out), so mixes that differ by a
 * little price drift or a name written another way share one entry.
 */
export function mixKey(day: string, lines: ReadonlyArray<Pick<MixLineInput, "ticker" | "weight">>): string {
  const rounded = lines
    .map((line) => [line.ticker.toUpperCase(), keyWeight(line.weight)] as MixKey["lines"][number])
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({ v: ANALYSIS_VERSION, day, lines: rounded } satisfies MixKey);
}

/* ── the person's own part ──────────────────────────────────────────────── */

type Base = {
  mode: PortfolioAnalysis["mode"];
  today: string;
  pricesDay: string | null;
  portfolio: Portfolio;
  calls: Record<string, CallInfo>;
  /** Holdings with a call level this plan does not show. */
  withheld: number;
};

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".").toUpperCase();
}

const CALL_WORDS = new Set(["Add", "Hold", "Trim"]);

/** A Buy more or Sell some level near enough the price to be shown, held back because the plan does not cover the stock. */
function countWithheld(rows: Map<string, ScreenerRow>, prices: Map<string, { price: number }>, levels: (ticker: string) => boolean): number {
  let withheld = 0;
  for (const [ticker, row] of rows) {
    if (!row.call || !CALL_WORDS.has(row.call) || levels(ticker)) continue;
    const level = row.call === "Add" ? row.add_below : row.call === "Trim" ? row.trim_above : null;
    const price = prices.get(ticker)?.price ?? row.price;
    if (fin(level) && level > 0 && fin(price) && price > 0 && Math.abs(level - price) / price <= 0.5) withheld += 1;
  }
  return withheld;
}

/** A signed-in person's US holdings, priced and called the way My stocks does it (lib/portfolio-home/stocks-server.ts). */
async function userBase(userDoc: UserDoc, viewer: Viewer, now: Date): Promise<Base | null> {
  const tracked = Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const kinds = userDoc.watchlist_positions ?? {};
  const ids = [...new Set(tracked.filter((id) => kinds[id] === "holding" && id.startsWith("US_")))];
  if (ids.length === 0) return null;
  const today = newYorkToday(now);
  const labels = await getInstrumentLabels(ids).catch(() => new Map<string, { ticker: string; name: string }>());
  const tickerOf = new Map<string, string>();
  for (const id of ids) {
    const ticker = (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
    if (![...tickerOf.values()].includes(ticker)) tickerOf.set(id, ticker);
  }
  const tickers = [...new Set(tickerOf.values())];
  const [dated, rows, earnings] = await Promise.all([
    loadDatedPrices([...tickers, BENCHMARK_SYMBOL]),
    getScreenerRows(tickers).catch(() => new Map<string, ScreenerRow>()),
    // No earnings dates is a smaller loss than no page.
    loadNextEarnings(today).catch(() => new Map()),
  ]);
  const { day, prices } = onOneDay(dated);
  const levels = (ticker: string) => canSeeLevels(viewer, `US_${ticker}`);
  const calls = callsFrom(rows, levels, today);
  const inputs: PortfolioRowInput[] = [...tickerOf.keys()].map((id) => {
    const ticker = tickerOf.get(id)!;
    const quote = prices.get(ticker);
    const call = calls[ticker];
    const name = labels.get(id)?.name || rows.get(ticker)?.name || ticker;
    return {
      instrument_id: id,
      ticker,
      name,
      sector: rows.get(ticker)?.sector ?? (FUND_NAME.test(name) ? FUNDS_SECTOR : null),
      kind: "holding",
      price: quote?.price ?? null,
      day_change_pct: quote?.dayPct ?? null,
      stance: call ? call.call.toLowerCase() : null,
      zones: call ? { accumulate_below: call.addBelow, trim_above: call.trimAbove } : null,
    };
  });
  const portfolio = buildPortfolio({ rows: inputs, holdings: userDoc.watchlist_holdings ?? null, earnings, today });
  return { mode: "mine", today, pricesDay: day, portfolio, calls, withheld: countWithheld(rows, prices, levels) };
}

/** The example portfolio from My stocks, with the calls anyone can see. */
async function exampleBase(viewer: Viewer, now: Date): Promise<Base | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const today = newYorkToday(now);
  const tickers = example.portfolio.positions.map((position) => position.ticker);
  const rows = await getScreenerRows(tickers).catch(() => new Map<string, ScreenerRow>());
  const calls = callsFrom(rows, (ticker) => canSeeLevels(viewer, `US_${ticker}`), today);
  return { mode: "example", today, pricesDay: example.pricesAsOf, portfolio: example.portfolio, calls, withheld: 0 };
}

/* ── putting it together ────────────────────────────────────────────────── */

export type AnalysisReason = "signed-out" | "no-holdings" | null;

export type AnalysisPage = {
  analysis: PortfolioAnalysis;
  plan: Plan;
  trialEligible: boolean;
  /** Why the example is shown, when it is. */
  reason: AnalysisReason;
};

export async function buildAnalysis(base: Base, deep: boolean): Promise<PortfolioAnalysis> {
  const holdings = base.portfolio.positions;
  const valued = holdings.filter((position) => fin(position.weight) && position.weight! > 0);
  const basis: PortfolioAnalysis["basis"] = valued.length > 0 ? "value" : "count";
  const weightOf = (position: (typeof holdings)[number]) => (basis === "value" ? position.weight ?? 0 : 100 / holdings.length);
  const lines = holdings
    .map((position) => ({ ticker: position.ticker, name: position.name, weight: weightOf(position), sector: position.sector, position }))
    .filter((line) => line.weight > 0);
  const day = base.pricesDay ?? base.today;

  const seeds: HoldingSeed[] = holdings.map((position) => ({ ticker: position.ticker, name: position.name, shares: position.shares, avgCost: position.avgCost, price: position.price }));
  const [market, dividends] = await Promise.all([
    lines.length > 0 ? loadMix(day, lines) : Promise.resolve(null),
    seeds.some((seed) => fin(seed.shares) && seed.shares! > 0) ? loadDividendPlan(seeds).catch(() => null) : Promise.resolve(null),
  ]);

  const fundSet = new Set<string>(
    lines.filter((line) => line.sector === FUNDS_SECTOR || FUND_NAME.test(line.name)).map((line) => line.ticker),
  );
  for (const fund of market?.openFunds ?? []) fundSet.add(fund);

  const calls = buildCalls(
    lines.map((line) => ({ ticker: line.ticker, name: line.name, weight: line.weight, price: line.position.price })),
    Object.fromEntries(Object.entries(base.calls).map(([ticker, call]) => [ticker, { call: call.call as "Add" | "Hold" | "Trim", addBelow: call.addBelow, trimAbove: call.trimAbove }])),
    base.withheld,
  );
  const earnings = buildEarnings(
    lines.map((line) => ({ ticker: line.ticker, name: line.name, weight: line.weight, fund: fundSet.has(line.ticker), nextEarnings: line.position.nextEarnings?.date ?? null })),
    base.today,
  );

  const free = !deep;
  // Free reads its lines as entered; opening the funds is part of the deeper look.
  const concentration = free ? market?.concentrationTyped ?? null : market?.concentrationLook ?? market?.concentrationTyped ?? null;
  const lockedModules = free && market ? DEEP.filter((id) => market[id] !== null) : [];
  return {
    version: ANALYSIS_VERSION,
    mode: base.mode,
    pricesDay: base.pricesDay,
    basis,
    holdings: holdings.length,
    partial: lines.length > 0 && market === null,
    unvalued: basis === "value" ? holdings.filter((position) => !(fin(position.weight) && position.weight! > 0)).map((position) => position.ticker) : [],
    concentration,
    overlap: free ? null : market?.overlap ?? null,
    risk: free ? null : market?.risk ?? null,
    correlation: free ? null : market?.correlation ?? null,
    crashes: free ? null : market?.crashes ?? null,
    attribution: free ? null : market?.attribution ?? null,
    lean: free ? null : market?.lean ?? null,
    earnings,
    calls,
    income: buildIncome(dividends?.plan ?? null),
    locked: lockedModules.length > 0 ? { modules: lockedModules, funds: market?.openFunds ?? [] } : null,
  };
}

/**
 * The page's data: the signed-in person's own holdings when they have any, else the example. The example is
 * open in full on every plan, so a visitor sees what the deeper modules look like on real prices.
 */
export async function loadAnalysisPage(now: Date = new Date()): Promise<AnalysisPage | null> {
  const viewer = await getViewer();
  let base: Base | null = null;
  let reason: AnalysisReason = viewer.signedIn ? "no-holdings" : "signed-out";
  if (viewer.signedIn && viewer.uid) {
    // A failed read is not "no holdings": it throws (once retried) so the page says it could not load, rather than
    // showing a signed-in person the example as if they owned nothing.
    const uid = viewer.uid;
    const userDoc = await getUserDoc(uid).catch(() => getUserDoc(uid));
    base = userDoc ? await userBase(userDoc, viewer, now) : null;
    if (base && base.portfolio.positions.length > 0) reason = null;
    else base = null;
  }
  base ??= await exampleBase(viewer, now);
  if (!base) return null;
  const deep = base.mode === "example" || can("portfolio_analysis_deep", viewer.plan);
  return { analysis: await buildAnalysis(base, deep), plan: viewer.plan, trialEligible: viewer.trialEligible, reason };
}
