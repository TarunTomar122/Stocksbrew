/**
 * Practice account: $100,000 of paper money per signed-in user. Pure logic,
 * no I/O. Orders fill at the latest stored daily close, there are no fees,
 * and nothing here touches a real account.
 *
 * Stored in `tm_practice_accounts/{uid}` by `lib/practice-store.ts`.
 */

export const PRACTICE_START_CASH = 100_000;
export const PRACTICE_BENCHMARK = "SPY";
export const PRACTICE_MAX_TRADES = 2000;
const SHARE_STEP = 10_000; // four decimal places

export type PracticeQuote = { price: number; date: string };

export type PracticeTrade = {
  id: string;
  at: string;
  side: "buy" | "sell";
  symbol: string;
  shares: number;
  price: number;
  /** The session the fill price comes from. */
  price_date: string;
  amount: number;
};

export type PracticePosition = { shares: number; cost: number };

export type PracticeAccount = {
  version: 1;
  uid: string;
  started_at: string;
  start_cash: number;
  cash: number;
  positions: Record<string, PracticePosition>;
  trades: PracticeTrade[];
  /** The comparison: the same starting money put into SPY at this close. */
  benchmark: { symbol: string; date: string; close: number };
  updated_at: string;
};

export type PracticeOrder = { side: "buy" | "sell"; symbol: string; shares?: number; dollars?: number };

export type PracticeOrderResult =
  | { ok: true; account: PracticeAccount; trade: PracticeTrade }
  | { ok: false; code: "invalid" | "no_price" | "not_enough_cash" | "not_enough_shares" | "log_full"; message: string };

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundShares(value: number): number {
  return Math.round(value * SHARE_STEP) / SHARE_STEP;
}

export function newPracticeAccount(uid: string, now: string, benchmark: PracticeQuote): PracticeAccount {
  return {
    version: 1,
    uid,
    started_at: now,
    start_cash: PRACTICE_START_CASH,
    cash: PRACTICE_START_CASH,
    positions: {},
    trades: [],
    benchmark: { symbol: PRACTICE_BENCHMARK, date: benchmark.date, close: benchmark.price },
    updated_at: now,
  };
}

/** Returns a new account; the one passed in is not changed. */
export function applyPracticeOrder(
  account: PracticeAccount,
  order: PracticeOrder,
  quote: PracticeQuote | null,
  now: string,
): PracticeOrderResult {
  const symbol = (order.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) return { ok: false, code: "invalid", message: "Enter a ticker." };
  if (order.side !== "buy" && order.side !== "sell") return { ok: false, code: "invalid", message: "Choose buy or sell." };
  if (!quote || !(quote.price > 0)) {
    return {
      ok: false,
      code: "no_price",
      message: `We have no stored closing price for ${symbol}, so it cannot be traded in practice yet.`,
    };
  }
  if (account.trades.length >= PRACTICE_MAX_TRADES) {
    return { ok: false, code: "log_full", message: "This practice account has reached its trade limit." };
  }

  const held = account.positions[symbol]?.shares ?? 0;
  let shares: number;
  if (typeof order.shares === "number" && Number.isFinite(order.shares)) {
    shares = roundShares(order.shares);
  } else if (typeof order.dollars === "number" && Number.isFinite(order.dollars)) {
    // Round down so a dollar order never costs more than the dollars given.
    shares = Math.floor((order.dollars / quote.price) * SHARE_STEP) / SHARE_STEP;
  } else {
    return { ok: false, code: "invalid", message: "Enter a number of shares or a dollar amount." };
  }
  if (!(shares > 0)) return { ok: false, code: "invalid", message: "The order is too small to fill." };
  if (shares > 1e9) return { ok: false, code: "invalid", message: "That order is too large." };

  const amount = cents(shares * quote.price);
  const positions = { ...account.positions };
  let cash = account.cash;
  if (order.side === "buy") {
    if (amount > cash + 0.005) {
      return {
        ok: false,
        code: "not_enough_cash",
        message: `That costs $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} and the account has $${cash.toLocaleString("en-US", { minimumFractionDigits: 2 })} in cash.`,
      };
    }
    cash = cents(cash - amount);
    const current = positions[symbol] ?? { shares: 0, cost: 0 };
    positions[symbol] = { shares: roundShares(current.shares + shares), cost: cents(current.cost + amount) };
  } else {
    if (shares > held + 1e-9) {
      return {
        ok: false,
        code: "not_enough_shares",
        message: held > 0 ? `The account holds ${held} shares of ${symbol}.` : `The account holds no ${symbol}.`,
      };
    }
    const current = positions[symbol] as PracticePosition;
    const left = roundShares(current.shares - shares);
    cash = cents(cash + amount);
    if (left <= 0) delete positions[symbol];
    else positions[symbol] = { shares: left, cost: cents(current.cost * (left / current.shares)) };
  }

  const trade: PracticeTrade = {
    id: `${now}-${account.trades.length + 1}`,
    at: now,
    side: order.side,
    symbol,
    shares,
    price: quote.price,
    price_date: quote.date,
    amount,
  };
  return {
    ok: true,
    trade,
    account: { ...account, cash, positions, trades: [...account.trades, trade], updated_at: now },
  };
}

export type PracticeRow = {
  symbol: string;
  shares: number;
  cost: number;
  average_cost: number;
  price: number | null;
  price_date: string | null;
  value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  weight: number | null;
};

export type PracticeView = {
  started_at: string;
  start_cash: number;
  cash: number;
  rows: PracticeRow[];
  equity: number;
  total_pnl: number;
  total_return: number;
  /** Positions we could not price are counted at cost, and listed here. */
  unpriced: string[];
  benchmark: {
    symbol: string;
    start_date: string;
    start_close: number;
    close: number | null;
    date: string | null;
    return: number | null;
    /** What the starting money would be worth in the benchmark. */
    value: number | null;
  };
  price_as_of: string | null;
  trades: PracticeTrade[];
  curve: { dates: string[]; account: number[]; benchmark: number[] } | null;
};

export function valuePracticeAccount(
  account: PracticeAccount,
  quotes: Record<string, PracticeQuote | undefined>,
): Omit<PracticeView, "curve"> {
  const rows: PracticeRow[] = [];
  const unpriced: string[] = [];
  let invested = 0;
  for (const symbol of Object.keys(account.positions).sort()) {
    const position = account.positions[symbol];
    const quote = quotes[symbol];
    const value = quote ? cents(position.shares * quote.price) : null;
    if (value === null) unpriced.push(symbol);
    invested += value ?? position.cost;
    rows.push({
      symbol,
      shares: position.shares,
      cost: position.cost,
      average_cost: position.shares > 0 ? position.cost / position.shares : 0,
      price: quote?.price ?? null,
      price_date: quote?.date ?? null,
      value,
      pnl: value === null ? null : cents(value - position.cost),
      pnl_pct: value === null || !(position.cost > 0) ? null : value / position.cost - 1,
      weight: null,
    });
  }
  const equity = cents(account.cash + invested);
  for (const row of rows) row.weight = row.value === null || !(equity > 0) ? null : row.value / equity;
  rows.sort((a, b) => (b.value ?? b.cost) - (a.value ?? a.cost));

  const bench = quotes[account.benchmark.symbol];
  const benchReturn = bench && account.benchmark.close > 0 ? bench.price / account.benchmark.close - 1 : null;
  return {
    started_at: account.started_at,
    start_cash: account.start_cash,
    cash: account.cash,
    rows,
    equity,
    total_pnl: cents(equity - account.start_cash),
    total_return: equity / account.start_cash - 1,
    unpriced,
    benchmark: {
      symbol: account.benchmark.symbol,
      start_date: account.benchmark.date,
      start_close: account.benchmark.close,
      close: bench?.price ?? null,
      date: bench?.date ?? null,
      return: benchReturn,
      value: benchReturn === null ? null : cents(account.start_cash * (1 + benchReturn)),
    },
    price_as_of: bench?.date ?? null,
    trades: [...account.trades].reverse(),
  };
}

type Series = { dates: string[]; closes: number[] };

/**
 * The account's value at each close since it started, replaying the trade log.
 * A trade counts from the session its fill price came from.
 */
export function practiceCurve(
  account: PracticeAccount,
  prices: Record<string, Series | undefined>,
): PracticeView["curve"] {
  const bench = prices[account.benchmark.symbol];
  if (!bench) return null;
  const startIndex = bench.dates.indexOf(account.benchmark.date);
  if (startIndex < 0) return null;
  const dates = bench.dates.slice(startIndex);
  if (dates.length < 2) return null;

  const cursor: Record<string, number> = {};
  const lastClose: Record<string, number> = {};
  const shares: Record<string, number> = {};
  let cash = account.start_cash;
  let next = 0;
  const accountCurve: number[] = [];
  const benchCurve: number[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const day = dates[i];
    while (next < account.trades.length && account.trades[next].price_date <= day) {
      const trade = account.trades[next];
      const sign = trade.side === "buy" ? 1 : -1;
      shares[trade.symbol] = (shares[trade.symbol] ?? 0) + sign * trade.shares;
      cash -= sign * trade.amount;
      if (lastClose[trade.symbol] === undefined) lastClose[trade.symbol] = trade.price;
      next += 1;
    }
    let total = cash;
    for (const symbol of Object.keys(shares)) {
      if (!(shares[symbol] > 1e-9)) continue;
      const series = prices[symbol];
      if (series) {
        let at = cursor[symbol] ?? 0;
        while (at < series.dates.length && series.dates[at] <= day) {
          lastClose[symbol] = series.closes[at];
          at += 1;
        }
        cursor[symbol] = at;
      }
      total += shares[symbol] * (lastClose[symbol] ?? 0);
    }
    accountCurve.push(cents(total));
    benchCurve.push(cents((account.start_cash * bench.closes[startIndex + i]) / account.benchmark.close));
  }
  return { dates, account: accountCurve, benchmark: benchCurve };
}
