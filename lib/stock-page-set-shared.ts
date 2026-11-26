import { normalizeStockSymbolParam } from "@/lib/stock-symbol";

/** The tickers that have a stock page, or `null` when that could not be read (then everything is linked). */
export type StockPageSet = ReadonlySet<string> | null;

/** The ticker as the stock page's address normalises it, or null (never throws on a stray "%"). */
export function normalizedTicker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normalizeStockSymbolParam(raw);
  } catch {
    return null;
  }
}

/** Whether a ticker gets a link: yes when the set could not be read. Pure, so components on either side can use it. */
export function hasStockPage(pages: StockPageSet | undefined, ticker: string | null | undefined): boolean {
  const key = normalizedTicker(ticker);
  if (!key) return false;
  return pages ? pages.has(key) : true;
}
