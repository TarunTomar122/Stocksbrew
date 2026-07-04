import type { SearchEntry } from "@/lib/search";

export function scoreSearchEntry(entry: SearchEntry, q: string): number {
  const ticker = entry.ticker.toLowerCase();
  const name = entry.name.toLowerCase();
  if (ticker === q) return 100;
  if (ticker.startsWith(q)) return 80;
  if (name.startsWith(q)) return 60;
  if (ticker.includes(q)) return 40;
  if (name.includes(q)) return 20;
  return 0;
}

export function formatSearchPct(pct?: number): { text: string; positive: boolean } | null {
  if (typeof pct !== "number") return null;
  const positive = pct >= 0;
  return {
    text: `${positive ? "+" : ""}${pct.toFixed(2)}%`,
    positive,
  };
}
