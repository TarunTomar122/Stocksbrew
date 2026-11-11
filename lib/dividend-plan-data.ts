import { unstable_cache } from "next/cache";

import {
  buildDividendPlan,
  parseAnnouncedRow,
  parseHistoryDoc,
  type AnnouncedDividend,
  type DividendHistory,
  type DividendPlan,
  type PlanHoldingInput,
} from "@/lib/dividend-plan";
import { adminFirestore } from "@/lib/firebase-admin";
import { loadDatedPrices, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { onOneDay } from "@/lib/portfolio-prices";
import { shortCompanyName } from "@/lib/plain-copy";
import { getScreenerRows } from "@/lib/screener";
import type { UserDoc } from "@/lib/watchlist";

/**
 * Server loaders for `/portfolio/dividends`. Read-only.
 *
 * - Past payments per stock: `tm_dividend_history` (`backend/agentdata/dividend_history.py`).
 * - Announced dividends: `tm_agent_calendar` rows of kind "dividend" (`backend/agentdata/calendar_events.py`).
 * - Payout ratio and company name: the screening snapshot (`tm_screener_snapshot`).
 * - Price for the yield: the last stored close (`tm_price_history_daily`).
 */

const HISTORY = "tm_dividend_history";
const CALENDAR = "tm_agent_calendar";

class NoHistory extends Error {}

async function readHistory(symbol: string): Promise<DividendHistory> {
  const doc = await adminFirestore.collection(HISTORY).doc(symbol).get();
  const parsed = doc.exists ? parseHistoryDoc(doc.data()) : null;
  // Thrown, not returned, so a stock the job has not reached yet is not cached as "no records" for hours.
  if (!parsed) throw new NoHistory(symbol);
  return parsed;
}

// The job runs once a day; a few hours of cache is plenty.
const getHistory = unstable_cache(readHistory, ["dividend-history-v2"], { revalidate: 6 * 3600 });

async function readAnnounced(since: string): Promise<Array<AnnouncedDividend & { ticker: string }>> {
  const snap = await adminFirestore.collection(CALENDAR).where("kind", "==", "dividend").where("date", ">=", since).get();
  return snap.docs.map((doc) => parseAnnouncedRow(doc.data())).filter((row): row is AnnouncedDividend & { ticker: string } => row !== null);
}

export const getAnnounced = unstable_cache(readAnnounced, ["dividend-announced-v1"], { revalidate: 1800 });

export type HoldingSeed = { ticker: string; name: string | null; shares: number | null; avgCost: number | null; price?: number | null };

export type DividendPlanData = {
  plan: DividendPlan;
  /** Last close used for the yields. */
  pricesAsOf: string | null;
  /** False when the dividend calendar could not be read, so announced payments may be missing. */
  calendarOk: boolean;
};

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The plan for a set of holdings, from stored data only. */
export async function loadDividendPlan(seeds: HoldingSeed[], now = new Date()): Promise<DividendPlanData> {
  const today = newYorkToday(now);
  const tickers = [...new Set(seeds.map((seed) => seed.ticker.toUpperCase()))];
  // Announced rows whose cash can still land in this month: ex-dates up to about four months back.
  const since = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 130 * 86_400_000).toISOString().slice(0, 10);
  let calendarOk = true;
  const [histories, announced, screener, quoted] = await Promise.all([
    Promise.all(tickers.map((ticker) => getHistory(ticker).catch(() => null))),
    getAnnounced(since).catch((error) => {
      console.warn("[dividends] calendar read failed:", error);
      calendarOk = false;
      return [] as Array<AnnouncedDividend & { ticker: string }>;
    }),
    getScreenerRows(tickers).catch(() => new Map()),
    // The same dated quotes as the portfolio and stock pages, never an unfinished history bar.
    loadDatedPrices(tickers).catch(() => new Map()),
  ]);
  const historyOf = new Map(tickers.map((ticker, index) => [ticker, histories[index] ?? null]));
  const announcedOf = new Map<string, AnnouncedDividend[]>();
  for (const row of announced) {
    const list = announcedOf.get(row.ticker) ?? [];
    list.push({ exDate: row.exDate, payDate: row.payDate, amount: row.amount });
    announcedOf.set(row.ticker, list);
  }

  const { day: pricesAsOf, prices } = onOneDay(quoted);
  const inputs: PlanHoldingInput[] = seeds.map((seed) => {
    const ticker = seed.ticker.toUpperCase();
    const row = screener.get(ticker);
    const last = prices.get(ticker)?.price;
    const price = fin(seed.price) && seed.price > 0 ? seed.price : fin(last) ? last : fin(row?.price) ? row!.price! : null;
    return {
      ticker,
      // One short name everywhere, so the read and the list never say "Nvidia" and "NVIDIA".
      name: shortCompanyName(seed.name || row?.name) || ticker,
      shares: fin(seed.shares) && seed.shares > 0 ? seed.shares : null,
      avgCost: fin(seed.avgCost) && seed.avgCost > 0 ? seed.avgCost : null,
      price,
      history: historyOf.get(ticker) ?? null,
      announced: announcedOf.get(ticker) ?? [],
      payout: fin(row?.payout) ? row!.payout! : null,
      sector: typeof row?.sector === "string" ? row.sector : null,
    };
  });

  return { plan: buildDividendPlan(inputs, today), pricesAsOf, calendarOk };
}

/** "US_BRK.B" -> "BRK.B"; other markets are left out (the history covers US stocks). */
function usTicker(instrumentId: string): string | null {
  if (!instrumentId.startsWith("US_")) return null;
  const ticker = instrumentId.slice(3).replace(/_/g, ".").trim().toUpperCase();
  return ticker || null;
}

/** The signed-in user's holdings: tracked stocks marked as a holding, with any share count and cost they entered. */
export function holdingSeeds(userDoc: UserDoc | null): HoldingSeed[] {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const positions = userDoc?.watchlist_positions ?? {};
  const holdings = userDoc?.watchlist_holdings ?? {};
  const out: HoldingSeed[] = [];
  for (const id of tracked) {
    if (positions[id] !== "holding") continue;
    const ticker = usTicker(id);
    if (!ticker) continue;
    const holding = holdings[id];
    out.push({
      ticker,
      name: null,
      shares: fin(holding?.quantity) ? holding!.quantity! : null,
      avgCost: fin(holding?.average_cost) ? holding!.average_cost! : null,
    });
  }
  return out;
}

/** The example portfolio the Portfolio page shows visitors: invented shares and costs, real prices and dividends. */
export async function exampleSeeds(): Promise<HoldingSeed[] | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  return example.portfolio.positions.map((position) => ({
    ticker: position.ticker,
    name: position.name,
    shares: position.shares,
    avgCost: position.avgCost,
    price: position.price,
  }));
}
