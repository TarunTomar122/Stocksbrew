export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode HTML entities, including double-encoded values like &amp;amp;. */
export function decodeTextEntities(value: string): string {
  let out = String(value ?? "");
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1)).trim()}…`;
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Returns a human-readable relative time string for a given ISO date string.
 * Safe to call in server components - no client-side Date.now() drift.
 * Examples: "just now", "5m ago", "2h ago", "Apr 16"
 */
export function relativeTime(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Currency symbol for a given market. Centralized so every price display on
 * the stock pages / scorecard can call the same helper instead of hardcoding
 * "$" - which broke for IN stocks. Expand as new markets come online.
 */
export function currencySymbolFor(
  marketOrCurrency: string | undefined | null,
): string {
  const s = String(marketOrCurrency ?? "").toUpperCase();
  if (s === "IN" || s === "INR") return "₹";
  if (s === "US" || s === "USD") return "$";
  if (s === "EUR") return "€";
  if (s === "GBP") return "£";
  if (s === "JPY") return "¥";
  return "$"; // Safe default - matches our US-first launch.
}

/**
 * Derive the market from an instrument_id like "IN_TATAPOWER" or "US_NVDA".
 * Used on stock pages where we want the stock's own currency, not the
 * currently-selected market. Returns null if the id doesn't match the
 * `{MARKET}_{TICKER}` convention.
 */
export function marketFromInstrumentId(
  instrumentId: string | undefined | null,
): "US" | "IN" | null {
  if (!instrumentId) return null;
  const prefix = instrumentId.split("_", 1)[0]?.toUpperCase();
  if (prefix === "US" || prefix === "IN") return prefix;
  return null;
}

export function coerceIsoDate(value: string | undefined, fallback = new Date(0).toISOString()): string {
  if (!value) {
    return fallback;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }
  return new Date(timestamp).toISOString();
}
