/** Small formatters shared by the evidence builder and the report page. Pure. */

export function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function num(value: unknown): number | null {
  return fin(value) ? value : null;
}

export function round(value: number | null | undefined, digits = 2): number | null {
  if (!fin(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** $303.0B, $41.2M, $950K. */
export function money(value: number | null | undefined): string {
  if (!fin(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function signedPct(value: number | null | undefined, digits = 1): string {
  if (!fin(value)) return "n/a";
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function pct(value: number | null | undefined, digits = 1): string {
  return fin(value) ? `${value.toFixed(digits)}%` : "n/a";
}

export function times(value: number | null | undefined, digits = 1): string {
  return fin(value) ? `${value.toFixed(digits)}x` : "n/a";
}

export function price(value: number | null | undefined): string {
  return fin(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "n/a";
}

/** "Nov 10, 2026" from an ISO date or time. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (!Number.isFinite(at)) return iso;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function median(values: number[]): number | null {
  const sorted = values.filter(fin).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The headline is one idea. A model that strings two together ("X rose 97%,
 * yet the stock trades at ...") keeps the first clause when that clause is a
 * sentence on its own; the rest is already in the five lines under it. Never
 * cut mid-clause.
 */
export function shortHeadline(text: string, maxWords = 20): string {
  const value = text.trim();
  const count = (line: string) => line.split(/\s+/).filter(Boolean).length;
  if (count(value) <= maxWords) return value;
  const joins = /(?:,\s+(?:yet|but|while|and|although|though|even as|as|with|after)\s+|;\s+|:\s+)/gi;
  for (const match of value.matchAll(joins)) {
    const head = value.slice(0, match.index).trim().replace(/[,;:]+$/, "");
    const words = count(head);
    if (words >= 8 && words <= maxWords) return `${head}.`;
    if (words > maxWords) break;
  }
  return value;
}
