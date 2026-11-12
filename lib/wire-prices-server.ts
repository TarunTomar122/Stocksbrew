import { getLatestPriceQuotes } from "@/lib/firestore";
import { livePriceOf, type LivePrice } from "@/lib/wire-prices";

/**
 * The latest price for each US ticker shown on the News page, in one batch read of the quote the stock page uses.
 * Never holds the page up: past `ms`, or on any failure, it gives up and the cards show their move without a price.
 */
export async function loadLivePrices(tickers: Iterable<string>, ms = 1500): Promise<Map<string, LivePrice>> {
  const unique = [...new Set([...tickers].map((ticker) => ticker.toUpperCase()).filter(Boolean))];
  const out = new Map<string, LivePrice>();
  if (unique.length === 0) return out;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const quotes = await Promise.race([getLatestPriceQuotes(unique.map((ticker) => `US_${ticker}`)).catch(() => null), timeout]);
    if (!quotes) return out;
    for (const ticker of unique) {
      const live = livePriceOf(quotes.get(`US_${ticker}`));
      if (live) out.set(ticker, live);
    }
    return out;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
