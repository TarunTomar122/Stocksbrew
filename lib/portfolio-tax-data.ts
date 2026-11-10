import { getLatestPriceQuotes } from "@/lib/firestore";
import { newYorkToday } from "@/lib/portfolio-data";
import {
  buildTaxPicture,
  readTaxLotsField,
  tickerOf,
  type LegacyHolding,
  type TaxLotsField,
  type TaxPicture,
} from "@/lib/portfolio-tax";
import type { UserDoc } from "@/lib/watchlist";

/**
 * Server side of the Portfolio tax view. Reads the user's own doc (already
 * loaded by the caller) and the latest quotes; writes nothing.
 */

export type TaxPrice = { price: number; at: string | null };

export type TaxStock = {
  instrumentId: string;
  ticker: string;
  /** Marked as a holding in Portfolio. */
  holding: boolean;
  /** The old single-cost numbers, used to prefill a first lot. */
  legacy: { shares: number; cost: number } | null;
};

export type TaxViewData = {
  picture: TaxPicture;
  lots: TaxLotsField;
  stocks: TaxStock[];
  prices: Record<string, TaxPrice>;
  /** Oldest quote time among the prices used, so the label never overstates freshness. */
  pricesAsOf: string | null;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function loadTaxView(userDoc: UserDoc | null, now = new Date()): Promise<TaxViewData> {
  const today = newYorkToday(now);
  const raw = (userDoc as (UserDoc & { tax_lots?: unknown }) | null)?.tax_lots;
  const lots = readTaxLotsField(raw, today);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const positions = userDoc?.watchlist_positions ?? {};
  const allHoldings = userDoc?.watchlist_holdings ?? {};

  // Only names marked as a holding count from the old single-cost numbers.
  const holdings: Record<string, LegacyHolding> = {};
  for (const [id, holding] of Object.entries(allHoldings)) {
    if (positions[id] === "holding" && tracked.includes(id) && holding) holdings[id] = holding;
  }

  const ids = [...new Set([...Object.keys(lots), ...Object.keys(holdings)])].filter((id) => id.startsWith("US_"));
  const quotes = ids.length > 0 ? await getLatestPriceQuotes(ids).catch(() => new Map()) : new Map();
  const priceMap = new Map<string, number>();
  const prices: Record<string, TaxPrice> = {};
  let oldest: string | null = null;
  for (const id of ids) {
    const quote = quotes.get(id);
    const price = finite(quote?.quote?.current);
    if (price === null || price <= 0) continue;
    const at = typeof quote?.captured_at === "string" ? quote.captured_at : typeof quote?.updated_at === "string" ? quote.updated_at : null;
    priceMap.set(id, price);
    prices[id] = { price, at };
    if (at && (!oldest || at < oldest)) oldest = at;
  }

  const picture = buildTaxPicture({ lots, holdings, prices: priceMap, today });

  const stockIds = [...new Set([...tracked.filter((id) => id.startsWith("US_")), ...Object.keys(lots)])];
  const stocks: TaxStock[] = stockIds
    .map((id) => {
      const holding = holdings[id];
      const shares = finite(holding?.quantity);
      const cost = finite(holding?.average_cost);
      return {
        instrumentId: id,
        ticker: lots[id]?.ticker || tickerOf(id),
        holding: positions[id] === "holding",
        legacy: shares !== null && shares > 0 && cost !== null && cost >= 0 ? { shares, cost } : null,
      };
    })
    .sort((a, b) => Number(b.holding) - Number(a.holding) || a.ticker.localeCompare(b.ticker));

  return { picture, lots, stocks, prices, pricesAsOf: oldest };
}
