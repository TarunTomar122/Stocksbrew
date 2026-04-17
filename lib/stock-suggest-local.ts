import type { StockSuggestion } from "@/lib/api-types";
import stockUniverse from "@/lib/stock-universe.json";

/** All searchable stock tickers from the instrument universe config. */
const LOCAL_ROWS: StockSuggestion[] = stockUniverse as StockSuggestion[];

/**
 * Prefix / fuzzy match over the full instrument universe.
 */
export function suggestLocalStockTickers(
  query: string,
  options?: { market?: "us" | "india" | "all"; limit?: number },
): StockSuggestion[] {
  const q = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!q.length) return [];

  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 30);
  const marketFilter = options?.market ?? "all";

  const rows = LOCAL_ROWS.filter((r) => {
    if (marketFilter === "us") return r.market === "us";
    if (marketFilter === "india") return r.market === "india";
    return true;
  });

  const scored = rows
    .map((r) => {
      const sym = r.symbol;
      const nm = r.name.toUpperCase();
      let score = -1;
      if (sym === q) score = 10_000;
      else if (sym.startsWith(q)) score = 5000 - sym.length;
      else if (nm.includes(q)) score = 2000 + (nm.startsWith(q) ? 400 : 0);
      else if (sym.includes(q)) score = 1000 - sym.length;
      return { ...r, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);

  return scored.map(({ score: _s, ...rest }) => rest);
}
