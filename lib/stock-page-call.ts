import { unstable_cache } from "next/cache";

import { getStockIntelligenceDoc, getStockPageView, getStockSummary, resolveStockPageViewSections } from "@/lib/stock";
import { buildStockRead, readLooksBroken } from "@/lib/stock-read";
import type { StockPageCall } from "@/lib/stock-page-call-shared";

/**
 * The stock page's quote and call for one stock, read from the same documents in the same order as
 * components/stock-page-stream.tsx: the price from tm_latest_prices (getStockSummary), the brief from the stored
 * page view while its intelligence is under a day old, else from the brief's own document. Kept a minute, the stock
 * page's own clock (its route revalidates every 60 seconds), so the compare desk's example pair does not read the
 * store on every visit. Null when we have no such stock; the call is null where the stock page would show no read
 * (no brief, or one written from an error page). A failed read throws, so it is never kept.
 */
async function loadStockPageCallUncached(symbol: string, market: "US" | "IN" = "US"): Promise<StockPageCall | null> {
  const stock = await getStockSummary(symbol, market);
  if (!stock) return null;
  const view = await getStockPageView(market, stock.instrument_id).catch(() => null);
  const { sections, directNeeded } = resolveStockPageViewSections(view, Date.now(), stock.instrument_id);
  const intelligence = directNeeded.intelligence
    ? await getStockIntelligenceDoc(stock.instrument_id, market).catch(() => null)
    : sections.intelligence;
  const built = buildStockRead(intelligence);
  const read = built && !readLooksBroken(built) ? built : null;
  const price = typeof stock.price === "number" && Number.isFinite(stock.price) && stock.price > 0 ? stock.price : null;
  return {
    symbol: stock.ticker,
    price,
    priceAt: stock.captured_at ?? null,
    dayPct: typeof stock.day_change_pct === "number" && Number.isFinite(stock.day_change_pct) ? stock.day_change_pct : null,
    call: read?.call ?? null,
    zones: read ? read.zones : { addBelow: null, addAbove: null, trimAbove: null },
    callAt: read?.writtenAt ?? null,
  };
}

export const loadStockPageCall = unstable_cache(loadStockPageCallUncached, ["stock-page-call-v1"], { revalidate: 60 });

/** The same for several stocks at once, by ticker; a failed read is left out, so the caller keeps its stored row. */
export async function loadStockPageCalls(symbols: readonly string[], market: "US" | "IN" = "US"): Promise<Map<string, StockPageCall>> {
  const out = new Map<string, StockPageCall>();
  const settled = await Promise.all(symbols.map((symbol) => loadStockPageCall(symbol, market).catch(() => null)));
  settled.forEach((call, index) => {
    if (call) out.set(symbols[index]!.toUpperCase(), call);
  });
  return out;
}
