import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import type { TheRead } from "@/lib/insights";
import { BENCHMARK_SYMBOL, loadDailySeries, loadExamplePortfolio } from "@/lib/portfolio-data";
import { shortCompanyName } from "@/lib/plain-copy";
import {
  EPISODES,
  buildStressRead,
  episodeCloses,
  runStressTest,
  weightHoldings,
  type EpisodeCloses,
  type StressResult,
} from "@/lib/stress-test";
import type { UserDoc } from "@/lib/watchlist";

/**
 * Server inputs for /portfolio/stress: each holding's adjusted daily closes
 * from `tm_price_history_daily` (backend/agentdata/prices.py), cut down to the
 * closes at each episode's edges, and today's weights from the example
 * portfolio or the signed-in person's holdings. Read-only.
 */

type RawSeries = { dates?: unknown; closes?: unknown; instrument_type?: unknown };

class NoSeries extends Error {}

async function readEpisodeCloses(symbol: string): Promise<EpisodeCloses> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  const raw = doc.exists ? (doc.data() as RawSeries) : null;
  const dates = Array.isArray(raw?.dates) ? raw!.dates : [];
  const closes = Array.isArray(raw?.closes) ? raw!.closes : [];
  const n = Math.min(dates.length, closes.length);
  const series = { dates: [] as string[], closes: [] as number[] };
  for (let i = 0; i < n; i++) {
    const date = dates[i];
    const close = closes[i];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      series.dates.push(date);
      series.closes.push(close);
    }
  }
  // Thrown, not returned, so a symbol the price job has not reached is not cached as "no history" for hours.
  if (series.dates.length < 2) throw new NoSeries(symbol);
  const fund = raw?.instrument_type === "ETF" || raw?.instrument_type === "MUTUALFUND";
  return episodeCloses(series, EPISODES, fund);
}

// Only the episode edges are cached (a few hundred bytes a symbol); old closes do not change.
// The episode windows are part of the key, so editing EPISODES never serves edges cut for the old list.
const EPISODE_KEY = EPISODES.map((episode) => `${episode.id}:${episode.start}:${episode.end}`).join(",");
const getEpisodeCloses = unstable_cache(readEpisodeCloses, ["stress-episode-closes-v2", EPISODE_KEY], { revalidate: 12 * 3600 });

async function loadEpisodeCloses(symbols: string[]): Promise<Map<string, EpisodeCloses>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const loaded = await Promise.all(unique.map((symbol) => getEpisodeCloses(symbol).catch(() => null)));
  const out = new Map<string, EpisodeCloses>();
  unique.forEach((symbol, index) => {
    const value = loaded[index];
    if (value) out.set(symbol, value);
  });
  return out;
}

export type StressView = {
  result: StressResult;
  read: TheRead | null;
  mode: "live" | "example";
  /** Day the weights are priced on (the example's quote day), else null for live quotes. */
  pricesAsOf: string | null;
  /** First and last close in the S&P 500 series, for the period line. */
  history: { first: string | null; last: string | null };
};

export async function buildStressView(
  input: Array<{ ticker: string; name: string; value: number | null }>,
  mode: StressView["mode"],
  pricesAsOf: string | null,
): Promise<StressView | null> {
  const weighted = weightHoldings(input);
  if (weighted.holdings.length === 0) return null;
  const closes = await loadEpisodeCloses([...weighted.holdings.map((holding) => holding.ticker), BENCHMARK_SYMBOL]);
  const benchmark = closes.get(BENCHMARK_SYMBOL) ?? null;
  const result = runStressTest(weighted, closes, benchmark);
  return {
    result,
    read: buildStressRead(result, { example: mode === "example" }),
    mode,
    pricesAsOf,
    history: { first: benchmark?.first ?? null, last: benchmark?.last ?? null },
  };
}

/** The example portfolio from the Portfolio page, at its own weights. */
export async function loadExampleStress(): Promise<StressView | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const holdings = example.portfolio.positions
    .filter((position) => position.kind === "holding")
    .map((position) => ({ ticker: position.ticker, name: shortCompanyName(position.name) || position.ticker, value: position.value }));
  return buildStressView(holdings, "example", example.pricesAsOf);
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function tickerFromId(id: string): string {
  return id.split("_").slice(1).join(".");
}

/**
 * A signed-in person's holdings (not the watching list), valued at the latest
 * quote, else the last stored close, else the value they typed in. Null when
 * they mark no US holding.
 */
export async function loadUserStress(userDoc: UserDoc | null): Promise<StressView | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const holdingsMap = userDoc?.watchlist_holdings ?? {};
  const ids = tracked.filter((id) => kinds[id] === "holding" && id.startsWith("US_"));
  if (ids.length === 0) return null;
  const [quotes, labels] = await Promise.all([
    getLatestPriceQuotes(ids).catch(() => new Map()),
    getInstrumentLabels(ids).catch(() => new Map()),
  ]);
  const tickerOf = (id: string) => (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
  const needClose = ids.filter((id) => num(quotes.get(id)?.quote?.current) === null).map(tickerOf);
  const closes = needClose.length > 0 ? await loadDailySeries(needClose).catch(() => new Map()) : new Map();
  const holdings = ids.map((id) => {
    const ticker = tickerOf(id);
    const holding = holdingsMap[id];
    const series = closes.get(ticker);
    const price = num(quotes.get(id)?.quote?.current) ?? (series ? num(series.closes[series.closes.length - 1]) : null);
    const quantity = num(holding?.quantity);
    const entered = num(holding?.market_value);
    const value = quantity !== null && quantity > 0 && price !== null && price > 0 ? quantity * price : entered !== null && entered > 0 ? entered : null;
    return { ticker, name: shortCompanyName(labels.get(id)?.name) || ticker, value };
  });
  return buildStressView(holdings, "live", null);
}
