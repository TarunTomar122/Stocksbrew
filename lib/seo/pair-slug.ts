/**
 * Stock-against-stock addresses (/compare/amd-vs-nvda). No imports, so
 * middleware.ts can use it on the edge to send the reverse order to the
 * canonical address.
 */

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;

/** A ticker from a URL segment, upper case, or null when it cannot be one. */
export function cleanTicker(raw: string | null | undefined): string | null {
  let text = String(raw ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  const upper = text.toUpperCase();
  return TICKER_RE.test(upper) ? upper : null;
}

/* ── Stock against stock ──────────────────────────────────────────────── */

export type ParsedPair = {
  a: string;
  b: string;
  /** The address this pair lives at: lower case, tickers in alphabetical order. */
  slug: string;
  /** Whether the requested slug already is that address. */
  isCanonical: boolean;
};

/** "/compare/amd-vs-nvda": lower case, tickers in alphabetical order. */
export function pairSlug(first: string, second: string): string {
  const [a, b] = [first.toLowerCase(), second.toLowerCase()].sort();
  return `${a}-vs-${b}`;
}

export function pairHref(first: string, second: string): string {
  return `/compare/${pairSlug(first, second)}`;
}

/**
 * Reads "nvda-vs-amd" into its two tickers and the canonical address. Null
 * for anything that is not exactly two different tickers, and for the product
 * comparisons (stocksbrew-vs-*), which live under /docs/compare.
 */
export function parsePairSlug(raw: string | null | undefined): ParsedPair | null {
  let text = String(raw ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  const parts = text.split(/-vs-/i);
  if (parts.length !== 2) return null;
  const first = cleanTicker(parts[0]);
  const second = cleanTicker(parts[1]);
  if (!first || !second || first === second) return null;
  if (first === "STOCKSBREW" || second === "STOCKSBREW") return null;
  const slug = pairSlug(first, second);
  const [a, b] = [first, second].sort();
  return { a: a!, b: b!, slug, isCanonical: text === slug };
}

