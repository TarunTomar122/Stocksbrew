/**
 * Two header numbers on the stock page that used to come straight from the Yahoo `fundamentals` block on
 * `tm_latest_prices`, and went wrong there:
 *
 * - The past year's range. That block is refreshed less often than the quote, so Coca-Cola showed a $96.90
 *   price beside a $65.35 to $84.04 "past year's range". The range is now worked out from the same daily
 *   closes the chart draws, with today's price on the end, so the price can never sit outside it. Those
 *   closes are adjusted for dividends and are closes, not intraday highs and lows, so for a dividend payer the low
 *   reads a little under the raw 52-week low other sites quote. It matches the chart on the same card, which is
 *   the comparison a reader makes here.
 * - The dividend yield. Yahoo changed `dividendYield` from a fraction to a percent and the stored values are a
 *   mix of both (0.0261 for KO, 0.51 for NVDA), which printed as 0.03%. The yield is now one definition
 *   everywhere on the page and on the dividend planner: the annual dividend at the current rate divided by
 *   today's price.
 * - The P/E. Yahoo's `pe_ttm` in that block is written once, when a stock is added, and never refreshed (the price
 *   jobs fetch quotes only), so after a big move it was far off: Amkor showed 49.6× at $37 when its earnings put it
 *   near 15×. A US stock's P/E is now today's price over the last four quarters' diluted earnings per share from the
 *   facts, when those are in dollars; otherwise the facts' own weekly P/E (Finviz); and none for a loss.
 */

import type { StockFacts, StockFundamentals } from "@/lib/stock";
import type { ChartPoint } from "@/lib/stock-chart";

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const YEAR_MS = 365 * 86_400_000;

/**
 * Low and high close over the year to `asOf` (a YYYY-MM-DD), including today's price. Needs at least 150 closes
 * in the window, so a stock with a few months of history is not given a "past year" it does not have; falls back
 * to the stored range only when today's price sits inside it.
 */
export function pastYearRange(
  closes: readonly ChartPoint[] | null | undefined,
  price: number | null | undefined,
  asOf: string,
  stored?: { low?: number | null; high?: number | null } | null,
  /** Today's intraday low and high, so the year's range always contains today's. */
  today?: { low?: number | null; high?: number | null } | null,
): { low: number; high: number } | null {
  const end = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  const hasPrice = fin(price) && price > 0;
  if (Number.isFinite(end) && closes?.length) {
    const window = closes.filter((point) => {
      const at = Date.parse(`${point.date.slice(0, 10)}T00:00:00Z`);
      return fin(point.close) && point.close > 0 && Number.isFinite(at) && at <= end && end - at <= YEAR_MS;
    });
    if (window.length >= 150) {
      const values = window.map((point) => point.close);
      if (hasPrice) values.push(price);
      for (const value of [today?.low, today?.high]) if (fin(value) && value > 0) values.push(value);
      const low = Math.min(...values);
      const high = Math.max(...values);
      return high > low ? { low, high } : null;
    }
  }
  const low = stored?.low;
  const high = stored?.high;
  if (!fin(low) || !fin(high) || high <= low) return null;
  // A stored range the price has already left is out of date: show nothing rather than a contradiction.
  if (hasPrice && (price < low * 0.995 || price > high * 1.005)) return null;
  return { low, high };
}

/** The annual dividend at the current rate as a percent of `price`, or null when either is missing. */
export function dividendYieldPct(annualDividend: number | null | undefined, price: number | null | undefined): number | null {
  if (!fin(annualDividend) || annualDividend <= 0 || !fin(price) || price <= 0) return null;
  return (annualDividend / price) * 100;
}

/**
 * Today's price over the last four quarters' diluted EPS: a number for a profit, null for a loss, undefined when the
 * facts cannot say (no TTM figure, or one the facts job could not confirm is in dollars). A loss is a loss in any
 * currency, so a four-quarter loss is null even when the amount itself cannot be used.
 */
export function livePe(
  facts: Pick<StockFacts, "financials"> | null | undefined,
  price: number | null | undefined,
): number | null | undefined {
  const financials = facts?.financials;
  if (!financials || financials.fiscal_year !== "TTM") return undefined;
  const eps = financials.eps_diluted;
  if (fin(eps) && eps <= 0) return null;
  if (financials.currency !== "USD" || financials.reported_currency) return undefined;
  if (!fin(eps) || !fin(price) || price <= 0) return undefined;
  return price / eps;
}

/**
 * A US stock's P/E now, for every surface that shows one: `livePe` when the facts can say, else the facts' weekly
 * (Finviz) P/E, else null. Never Yahoo's `fundamentals.pe_ttm` (see the file comment).
 */
export function currentPe(
  facts: Pick<StockFacts, "financials" | "quick_stats"> | null | undefined,
  price: number | null | undefined,
): number | null {
  const pe = livePe(facts, price);
  if (pe !== undefined) return pe;
  const weekly = facts?.quick_stats?.pe_ttm;
  return fin(weekly) && weekly > 0 ? weekly : null;
}

/**
 * The stored fundamentals with the two header numbers made consistent with the quote: the past year's range from
 * the daily closes (or nothing, when the stored one is out of date) and `dividend_yield_pct` at today's price.
 */
export function consistentFundamentals(
  fundamentals: StockFundamentals | null,
  input: {
    closes: readonly ChartPoint[] | null;
    price: number | null;
    today: string;
    annualDividend: number | null | undefined;
    dayLow?: number | null;
    dayHigh?: number | null;
    /** For a US stock, the facts the P/E is worked out from (see the file comment). Other markets keep theirs. */
    market?: "US" | "IN";
    facts?: Pick<StockFacts, "financials" | "quick_stats"> | null;
  },
): StockFundamentals | null {
  const range = pastYearRange(
    input.closes,
    input.price,
    input.today,
    { low: fundamentals?.week_52_low, high: fundamentals?.week_52_high },
    { low: input.dayLow, high: input.dayHigh },
  );
  const yieldPct = dividendYieldPct(input.annualDividend, input.price);
  const pe = input.market === "US" ? currentPe(input.facts, input.price) : null;
  if (!fundamentals && !range && yieldPct === null && pe === null) return null;
  const next: StockFundamentals = { ...(fundamentals ?? {}) };
  delete next.week_52_low;
  delete next.week_52_high;
  delete next.dividend_yield_pct;
  if (range) {
    next.week_52_low = range.low;
    next.week_52_high = range.high;
  }
  // The yield and the "$3.92 a year" beside it come from the same annual figure.
  if (yieldPct !== null) {
    next.dividend_yield_pct = yieldPct;
    next.annual_dividend = input.annualDividend!;
  } else delete next.annual_dividend;
  if (input.market === "US") {
    delete next.pe_ttm;
    if (pe !== null) next.pe_ttm = pe;
  }
  return next;
}
