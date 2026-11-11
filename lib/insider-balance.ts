/**
 * Insider buying against selling over one window, the one number /insiders
 * and /filings both quote. Both pages read the same two lists (the newest
 * INSIDER_TRADE_ROWS trades and the newest INSIDER_BUY_ROWS buys, merged
 * without repeats) and count them here, so they cannot disagree:
 *
 * - the window is the last 7 days by filing day in New York, today included;
 * - every open-market sale counts, pre-set 10b5-1 plan sales too, and the
 *   planned share is reported beside it;
 * - when a capped trade list does not reach back past the window's first day,
 *   the window is not fully held and there is no balance rather than a short one.
 */
import type { InsiderTrade } from "@/lib/follow-shared";

/** Rows of `getInsiderTrades` and `getInsiderBuys` both pages read, so they share a cache entry too. */
export const INSIDER_TRADE_ROWS = 1500;
export const INSIDER_BUY_ROWS = 500;
export const INSIDER_BALANCE_DAYS = 7;

const DAY = 86_400_000;

/** The New York calendar day of an instant. */
export function nyDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** The filing day of an insider trade: its stored date, else the day part of its New York filing time. */
export function filingDay(trade: Pick<InsiderTrade, "filing_date" | "filed_at">): string {
  return (trade.filing_date || trade.filed_at || "").slice(0, 10);
}

/** [first, last] filing day of the `days` days ending today in New York. */
export function balanceWindow(now: number, days = INSIDER_BALANCE_DAYS): [string, string] {
  const today = nyDay(now);
  return [shiftDay(today, -(days - 1)), today];
}

/** Lists merged without repeats, the first copy of an id winning. */
export function mergeTrades(...lists: ReadonlyArray<ReadonlyArray<InsiderTrade>>): InsiderTrade[] {
  const seen = new Set<string>();
  const out: InsiderTrade[] = [];
  for (const list of lists) {
    for (const trade of list) {
      if (seen.has(trade.id)) continue;
      seen.add(trade.id);
      out.push(trade);
    }
  }
  return out;
}

export type InsiderBalance = {
  from: string;
  to: string;
  days: number;
  bought: number;
  sold: number;
  /** The part of `sold` under pre-set 10b5-1 plans. */
  plannedSold: number;
  /** Rounded dollars sold per dollar bought; null when nothing was bought. */
  ratio: number | null;
  /** Whole percent of `sold` that was pre-scheduled; null when nothing was sold. */
  plannedPct: number | null;
  buyCompanies: number;
  sellCompanies: number;
};

/**
 * The balance over the window. `trades` is the newest-first mixed list and
 * `buys` the buys-only list; `tradesLimit` says `trades` is a capped read (how many
 * rows it asked for), so a list that stops inside the window reads as not held.
 */
export function insiderBalance(input: {
  trades: ReadonlyArray<InsiderTrade>;
  buys?: ReadonlyArray<InsiderTrade>;
  now: number;
  days?: number;
  tradesLimit?: number;
}): InsiderBalance | null {
  const days = input.days ?? INSIDER_BALANCE_DAYS;
  const [from, to] = balanceWindow(input.now, days);
  // The loader drops a few rows after its query (lines it cannot show), so a full read can come back a little
  // short of the limit: whenever the list is a capped read, it has to reach back past the window's first day.
  if (input.tradesLimit !== undefined) {
    const oldest = input.trades.reduce((min, trade) => {
      const day = filingDay(trade);
      return day && day < min ? day : min;
    }, "9999-12-31");
    if (oldest >= from) return null;
  }
  let bought = 0;
  let sold = 0;
  let plannedSold = 0;
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  for (const trade of mergeTrades(input.buys ?? [], input.trades)) {
    const day = filingDay(trade);
    const value = trade.value ?? 0;
    if (day < from || day > to || !(value > 0)) continue;
    if (trade.tx_type === "buy") {
      bought += value;
      buyers.add(trade.symbol);
    } else {
      sold += value;
      sellers.add(trade.symbol);
      if (trade.plan_10b5_1) plannedSold += value;
    }
  }
  return {
    from,
    to,
    days,
    bought,
    sold,
    plannedSold,
    ratio: bought > 0 ? Math.round(sold / bought) : null,
    plannedPct: sold > 0 ? Math.round((plannedSold / sold) * 100) : null,
    buyCompanies: buyers.size,
    sellCompanies: sellers.size,
  };
}
