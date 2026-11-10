import { loadPriceSeries, PRICE_SOURCE } from "@/lib/backtest";
import { adminFirestore } from "@/lib/firebase-admin";
import {
  PRACTICE_BENCHMARK,
  applyPracticeOrder,
  newPracticeAccount,
  practiceCurve,
  valuePracticeAccount,
  type PracticeAccount,
  type PracticeOrder,
  type PracticeQuote,
  type PracticeTrade,
  type PracticeView,
} from "@/lib/practice";

/**
 * Reads and writes practice accounts in `tm_practice_accounts/{uid}`. Server
 * only. The document is created by the first order, so opening the page writes
 * nothing.
 */

const COLLECTION = "tm_practice_accounts";

export type PracticePayload = {
  view: PracticeView;
  /** False until the first order: the view is a fresh $100,000 that is not stored yet. */
  opened: boolean;
  source: string;
};

type Series = { dates: string[]; closes: number[] };

function lastQuote(series: Series | undefined): PracticeQuote | null {
  if (!series || series.dates.length === 0) return null;
  const index = series.dates.length - 1;
  const price = series.closes[index];
  return price > 0 ? { price, date: series.dates[index] } : null;
}

function isAccount(value: unknown): value is PracticeAccount {
  const item = value as Partial<PracticeAccount> | null;
  return Boolean(
    item &&
      item.version === 1 &&
      typeof item.cash === "number" &&
      item.positions &&
      typeof item.positions === "object" &&
      Array.isArray(item.trades) &&
      item.benchmark &&
      typeof item.benchmark.close === "number",
  );
}

async function readAccount(uid: string): Promise<PracticeAccount | null> {
  const doc = await adminFirestore.collection(COLLECTION).doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return isAccount(data) ? data : null;
}

export function buildPracticeView(account: PracticeAccount, prices: Record<string, Series>): PracticeView {
  const quotes: Record<string, PracticeQuote | undefined> = {};
  for (const symbol of Object.keys(prices)) quotes[symbol] = lastQuote(prices[symbol]) ?? undefined;
  return { ...valuePracticeAccount(account, quotes), curve: practiceCurve(account, prices) };
}

export async function getPracticePayload(uid: string): Promise<PracticePayload | null> {
  const stored = await readAccount(uid);
  const symbols = [PRACTICE_BENCHMARK, ...Object.keys(stored?.positions ?? {}), ...(stored?.trades ?? []).map((trade) => trade.symbol)];
  const prices = await loadPriceSeries(symbols);
  const benchmark = lastQuote(prices[PRACTICE_BENCHMARK]);
  if (!benchmark) return null;
  const account = stored ?? newPracticeAccount(uid, new Date().toISOString(), benchmark);
  return { view: buildPracticeView(account, prices), opened: stored !== null, source: PRICE_SOURCE };
}

export type PracticeTradeResponse =
  | { ok: true; trade: PracticeTrade; payload: PracticePayload }
  | { ok: false; code: string; message: string };

export async function placePracticeOrder(uid: string, order: PracticeOrder): Promise<PracticeTradeResponse> {
  const symbol = (order.symbol ?? "").trim().toUpperCase();
  const prices = await loadPriceSeries([PRACTICE_BENCHMARK, symbol]);
  const benchmark = lastQuote(prices[PRACTICE_BENCHMARK]);
  if (!benchmark) return { ok: false, code: "unavailable", message: "Prices are not available right now. Try again in a minute." };
  const quote = lastQuote(prices[symbol]);
  const now = new Date().toISOString();
  const ref = adminFirestore.collection(COLLECTION).doc(uid);

  // Read and write in one transaction so two orders sent at once cannot both spend the same cash.
  const result = await adminFirestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : null;
    if (snapshot.exists && !isAccount(data)) {
      return { ok: false as const, code: "unreadable", message: "This practice account could not be read, so nothing was changed." };
    }
    const account = isAccount(data) ? data : newPracticeAccount(uid, now, benchmark);
    const applied = applyPracticeOrder(account, { ...order, symbol }, quote, now);
    if (applied.ok) transaction.set(ref, applied.account as unknown as Record<string, unknown>);
    return applied;
  });
  if (!result.ok) return { ok: false, code: result.code, message: result.message };

  const all = await loadPriceSeries([PRACTICE_BENCHMARK, ...Object.keys(result.account.positions), ...result.account.trades.map((trade) => trade.symbol)]);
  return {
    ok: true,
    trade: result.trade,
    payload: { view: buildPracticeView(result.account, all), opened: true, source: PRICE_SOURCE },
  };
}

/** A worked example for people who are signed out, built from real stored closes. Never stored. */
export async function getPracticeExample(): Promise<PracticePayload | null> {
  const plan: { symbol: string; dollars: number; offset: number }[] = [
    { symbol: "SPY", dollars: 30_000, offset: 0 },
    { symbol: "AAPL", dollars: 15_000, offset: 0 },
    { symbol: "MSFT", dollars: 15_000, offset: 0 },
    { symbol: "JPM", dollars: 10_000, offset: 5 },
    { symbol: "XLE", dollars: 8_000, offset: 12 },
    { symbol: "TLT", dollars: 10_000, offset: 20 },
  ];
  const prices = await loadPriceSeries(plan.map((item) => item.symbol));
  const bench = prices[PRACTICE_BENCHMARK];
  const sessions = 63;
  if (!bench || bench.dates.length <= sessions) return null;
  const start = bench.dates.length - 1 - sessions;
  const quoteAt = (symbol: string, day: string): PracticeQuote | null => {
    const series = prices[symbol];
    if (!series) return null;
    const index = series.dates.indexOf(day);
    return index >= 0 && series.closes[index] > 0 ? { price: series.closes[index], date: day } : null;
  };
  const startDay = bench.dates[start];
  let account = newPracticeAccount("example", `${startDay}T21:00:00.000Z`, { price: bench.closes[start], date: startDay });
  for (const item of plan) {
    const day = bench.dates[start + item.offset];
    const applied = applyPracticeOrder(account, { side: "buy", symbol: item.symbol, dollars: item.dollars }, quoteAt(item.symbol, day), `${day}T21:00:00.000Z`);
    if (applied.ok) account = applied.account;
  }
  const trimDay = bench.dates[start + 40];
  const trim = applyPracticeOrder(
    account,
    { side: "sell", symbol: "AAPL", shares: Math.floor((account.positions.AAPL?.shares ?? 0) / 3) },
    quoteAt("AAPL", trimDay),
    `${trimDay}T21:00:00.000Z`,
  );
  if (trim.ok) account = trim.account;
  if (account.trades.length === 0) return null;
  return { view: buildPracticeView(account, prices), opened: false, source: PRICE_SOURCE };
}
