/** Normalized ticker from `/stock/[symbol]`. Returns null if invalid. Pure: safe in any bundle. */
export function normalizeStockSymbolParam(raw: string): string | null {
  const s = decodeURIComponent(String(raw ?? "").trim()).toUpperCase();
  if (!s || s.length > 16) return null;
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(s)) return null;
  return s;
}
