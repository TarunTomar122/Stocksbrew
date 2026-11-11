import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { yearlyOf } from "@/lib/goal/bootstrap";
import type { MixId } from "@/lib/goal/inputs";
import { buildMix, monthlyReturns, type Mix, type MixPart } from "@/lib/goal/series";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { BENCHMARK_SYMBOL, loadDatedPrices, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { onOneDay } from "@/lib/portfolio-prices";
import { shortCompanyName } from "@/lib/plain-copy";
import { weightHoldings } from "@/lib/stress-test";
import type { UserDoc } from "@/lib/watchlist";

/**
 * Server inputs for /portfolio/goal: each holding's monthly returns from its
 * stored adjusted daily closes (`tm_price_history_daily`, written by
 * backend/agentdata/prices.py), today's weights from dated prices
 * (lib/portfolio-prices.ts), and three simple mixes to compare. The replays
 * themselves run from these series (lib/goal/bootstrap.ts). Read-only.
 */

type RawSeries = { dates?: unknown; closes?: unknown; instrument_type?: unknown };
type MonthlySeries = { returns: Array<[string, number]>; fund: boolean };

class NoSeries extends Error {}

async function readMonthly(symbol: string, today: string): Promise<MonthlySeries> {
  const doc = await adminFirestore.collection("tm_price_history_daily").doc(symbol).get();
  const raw = doc.exists ? (doc.data() as RawSeries) : null;
  const dates = Array.isArray(raw?.dates) ? (raw!.dates as unknown[]) : [];
  const closes = Array.isArray(raw?.closes) ? (raw!.closes as unknown[]) : [];
  const returns = monthlyReturns({ dates: dates as string[], closes: closes as number[] }, today);
  // Thrown, not returned, so a symbol the price job has not reached is not cached as "no history" for hours.
  if (returns.size === 0) throw new NoSeries(symbol);
  const fund = raw?.instrument_type === "ETF" || raw?.instrument_type === "MUTUALFUND";
  return { returns: [...returns.entries()], fund };
}

// A month's return never changes once the month is over; `today` is in the arguments, so the key moves with the day.
const getMonthly = unstable_cache(readMonthly, ["goal-monthly-returns-v1"], { revalidate: 12 * 3600 });

async function loadMonthly(symbols: string[], today: string): Promise<Map<string, { returns: Map<string, number>; fund: boolean }>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const loaded = await Promise.all(unique.map((symbol) => getMonthly(symbol, today).catch(() => null)));
  const out = new Map<string, { returns: Map<string, number>; fund: boolean }>();
  unique.forEach((symbol, index) => {
    const value = loaded[index];
    if (value) out.set(symbol, { returns: new Map(value.returns), fund: value.fund });
  });
  return out;
}

export type GoalMix = Mix & { id: MixId; label: string; yearly: number | null };

export type GoalData = {
  mode: "live" | "example";
  /** The mixes on offer; "own" is missing when the holdings could not be priced at all. */
  mixes: GoalMix[];
  /** Today's value of the holdings at dated prices, or null when no holding has a share count or a value. */
  portfolioValue: number | null;
  /** New York day the holdings are priced on. */
  pricesAsOf: string | null;
  /** Holdings left out of the weights because we cannot value them (no share count and no value entered). */
  unvalued: string[];
  /** "count" when no holding could be valued, so every holding counts the same. */
  basis: "value" | "count";
  /** The calendar of months the replays draw from. */
  span: { first: string; last: string };
};

const PRESETS: Array<{ id: MixId; label: string; parts: Array<{ ticker: string; name: string; weight: number }> }> = [
  { id: "spy", label: "All S&P 500", parts: [{ ticker: "SPY", name: "S&P 500", weight: 1 }] },
  { id: "qqq", label: "All Nasdaq 100", parts: [{ ticker: "QQQ", name: "Nasdaq 100", weight: 1 }] },
  {
    id: "6040",
    label: "60% S&P 500, 40% bonds",
    parts: [
      { ticker: "SPY", name: "S&P 500", weight: 0.6 },
      { ticker: "AGG", name: "US bonds (AGG)", weight: 0.4 },
    ],
  },
];

type Holding = { ticker: string; name: string; value: number | null };

export async function buildGoalData(holdings: Holding[], mode: GoalData["mode"], pricesAsOf: string | null, now = new Date()): Promise<GoalData | null> {
  const today = newYorkToday(now);
  const weighted = weightHoldings(holdings);
  const tickers = weighted.holdings.map((holding) => holding.ticker);
  const series = await loadMonthly([...tickers, BENCHMARK_SYMBOL, ...PRESETS.flatMap((preset) => preset.parts.map((part) => part.ticker))], today);
  const benchmark = series.get(BENCHMARK_SYMBOL)?.returns;
  if (!benchmark || benchmark.size < 24) return null;

  const mixes: GoalMix[] = [];
  const finish = (id: MixId, label: string, mix: Mix | null) => {
    if (mix) mixes.push({ ...mix, id, label, yearly: yearlyOf(mix.returns) });
  };
  if (weighted.holdings.length > 0) {
    const parts: MixPart[] = weighted.holdings.map((holding) => {
      const own = series.get(holding.ticker);
      return { ticker: holding.ticker, name: holding.name, weight: holding.weight, fund: own?.fund ?? false, returns: own?.returns ?? null };
    });
    // A mix with no stored prices for any holding would just be the S&P 500 under another name.
    if (parts.some((part) => part.returns !== null)) finish("own", mode === "example" ? "The example portfolio" : "Your holdings", buildMix(benchmark, parts));
  }
  for (const preset of PRESETS) {
    // A fund we hold no prices for would be the S&P 500 under its name; leave that mix out instead.
    if (preset.parts.some((part) => !series.has(part.ticker))) continue;
    finish(
      preset.id,
      preset.label,
      buildMix(
        benchmark,
        preset.parts.map((part) => ({ ...part, fund: true, returns: series.get(part.ticker)?.returns ?? null })),
      ),
    );
  }
  const months = [...benchmark.keys()].sort();
  const valued = holdings.filter((holding) => typeof holding.value === "number" && holding.value > 0);
  return {
    mode,
    mixes,
    portfolioValue: valued.length > 0 ? valued.reduce((sum, holding) => sum + holding.value!, 0) : null,
    pricesAsOf,
    unvalued: weighted.unvalued,
    basis: weighted.basis,
    span: { first: months[0]!, last: months[months.length - 1]! },
  };
}

/** The example portfolio from the Portfolio page: invented share counts, real dated prices. */
export async function loadExampleGoal(): Promise<GoalData | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const holdings = example.portfolio.positions
    .filter((position) => position.kind === "holding")
    .map((position) => ({ ticker: position.ticker, name: shortCompanyName(position.name) || position.ticker, value: position.value }));
  return buildGoalData(holdings, "example", example.pricesAsOf);
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function tickerFromId(id: string): string {
  return id.slice(3).replace(/_/g, ".").toUpperCase();
}

/**
 * A signed-in person's US holdings (not the watching list), valued at the
 * same dated prices the Portfolio page shows, else the value they entered.
 * Null when they mark no US holding.
 */
export async function loadUserGoal(userDoc: UserDoc | null): Promise<GoalData | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const holdingsMap = userDoc?.watchlist_holdings ?? {};
  const ids = [...new Set(tracked.filter((id) => kinds[id] === "holding" && id.startsWith("US_")))];
  if (ids.length === 0) return null;
  const labels = await getInstrumentLabels(ids).catch(() => new Map<string, { ticker?: string; name?: string }>());
  const tickerOf = (id: string) => (labels.get(id)?.ticker || tickerFromId(id)).toUpperCase();
  const quoted = await loadDatedPrices(ids.map(tickerOf)).catch(() => new Map());
  const { day, prices } = onOneDay(quoted);
  const holdings = ids.map((id) => {
    const ticker = tickerOf(id);
    const holding = holdingsMap[id];
    const price = prices.get(ticker)?.price ?? null;
    const quantity = num(holding?.quantity);
    const entered = num(holding?.market_value);
    const value = quantity !== null && quantity > 0 && price !== null && price > 0 ? quantity * price : entered !== null && entered > 0 ? entered : null;
    return { ticker, name: shortCompanyName(labels.get(id)?.name) || ticker, value };
  });
  return buildGoalData(holdings, "live", day);
}
