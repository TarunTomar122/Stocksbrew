import { addDays, daysBetween, holdingTerm, longTermFrom } from "@/lib/portfolio-tax";

import type { IdeaLot, SaleTax, TaxRates, Term } from "./types";

/**
 * The tax arithmetic behind the ideas, with US federal rules made simple:
 * one assumed rate for short-term gains (held a year or less) and one for
 * long-term gains, no state tax, no netting against the rest of the year.
 * Dates and holding terms come from lib/portfolio-tax.ts, the Taxes page's own rules.
 * The person picks the rates; these are the defaults.
 */

export const SHORT_RATES = [10, 12, 22, 24, 32, 35, 37] as const;
export const LONG_RATES = [0, 15, 20] as const;
export const DEFAULT_RATES: TaxRates = { short: 24, long: 15 };

/** How far ahead a sale's turn to long term is worth pointing out. */
export const WAIT_DAYS = 90;

/** Days after a loss sale before buying the same stock back is outside the wash-sale window. */
export const WASH_DAYS = 30;

export { addDays, daysBetween, holdingTerm, longTermFrom };

function pick(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Rates from the address (?short=24&long=15), falling back to the defaults for anything not on the list. */
export function parseRates(search: Record<string, string | string[] | undefined>): TaxRates {
  const short = Number(pick(search.short));
  const long = Number(pick(search.long));
  return {
    short: (SHORT_RATES as readonly number[]).includes(short) ? short : DEFAULT_RATES.short,
    long: (LONG_RATES as readonly number[]).includes(long) ? long : DEFAULT_RATES.long,
  };
}

/** Unknown holding periods are taxed at the short-term rate, the higher of the two, so the estimate never flatters. */
/**
 * Tax on a sale's short- and long-term parts after US netting: a loss in one
 * part first offsets a gain in the other, then each net gain is taxed at its
 * own rate. Both parts at a loss give a negative figure (tax it could save).
 * Undated shares count as short term.
 */
export function nettedTax(short: number, long: number, rates: TaxRates): number {
  let netShort = short;
  let netLong = long;
  if (netShort < 0 && netLong > 0) {
    netLong += netShort;
    netShort = 0;
    if (netLong < 0) [netShort, netLong] = [netLong, 0];
  } else if (netLong < 0 && netShort > 0) {
    netShort += netLong;
    netLong = 0;
    if (netShort < 0) [netShort, netLong] = [0, netShort];
  }
  return (netShort * rates.short + netLong * rates.long) / 100;
}

export function rateFor(term: Term, rates: TaxRates): number {
  return term === "long" ? rates.long : rates.short;
}

function fifo(a: IdeaLot, b: IdeaLot): number {
  // A lot without a date is assumed to be the oldest shares.
  if (a.acquired === b.acquired) return 0;
  if (a.acquired === null) return -1;
  if (b.acquired === null) return 1;
  return a.acquired < b.acquired ? -1 : 1;
}

/**
 * Selling `shares` at `price` today: the gain by term and the tax at the
 * rates. "fifo" sells the oldest shares first (what most brokers do unless
 * told otherwise); "highest" sells the dearest shares first, which keeps the
 * taxable gain as small as it can be.
 */
export function saleTax(
  lots: readonly IdeaLot[],
  shares: number,
  price: number,
  today: string,
  rates: TaxRates,
  method: "fifo" | "highest" = "fifo",
): SaleTax | null {
  if (lots.length === 0 || !(shares > 0) || !(price > 0)) return null;
  const order = [...lots].filter((lot) => lot.shares > 0).sort(method === "fifo" ? fifo : (a, b) => b.costPerShare - a.costPerShare || fifo(a, b));
  let left = shares;
  const out: SaleTax = { shares, proceeds: shares * price, short: 0, long: 0, unknown: 0, gain: 0, tax: 0, unmatchedShares: 0, waitUntil: null, waitTax: null };
  let lastTurn: string | null = null;
  let turnsSoon = true;
  for (const lot of order) {
    if (left <= 1e-9) break;
    const take = Math.min(left, lot.shares);
    left -= take;
    const gain = take * (price - lot.costPerShare);
    const term = holdingTerm(lot.acquired, today);
    out[term] += gain;
    out.gain += gain;
    if (term === "short" && lot.acquired) {
      const from = longTermFrom(lot.acquired);
      if (daysBetween(today, from) > WAIT_DAYS) turnsSoon = false;
      else if (!lastTurn || from > lastTurn) lastTurn = from;
    }
  }
  out.unmatchedShares = left > 1e-9 ? left : 0;
  out.tax = nettedTax(out.short + out.unknown, out.long, rates);
  // Every short-term share here turns long term soon and the sale is a gain: what waiting would cost at today's price.
  if (turnsSoon && lastTurn && out.short > 0 && out.unknown === 0) {
    out.waitUntil = lastTurn;
    out.waitTax = (out.gain * rates.long) / 100;
  }
  return out;
}
