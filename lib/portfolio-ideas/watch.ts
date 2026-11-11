/**
 * "Tell me if UNH falls another 5%": a price-level request the plain-English
 * agent box on /agents reads as one price agent (lib/agents-plain/parse.ts,
 * the "drops below" rule). Nothing is saved until the person confirms it there.
 * Same idea as lib/agents-plain/ask-links.ts, for the one trigger it lacks.
 */

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** The level a further fall of `pct` percent would reach: whole dollars above $20, cents below. */
export function levelBelow(price: number, pct = 5): number | null {
  if (!(price > 0) || !(pct > 0 && pct < 50)) return null;
  const level = price * (1 - pct / 100);
  return level >= 20 ? Math.round(level) : Math.round(level * 100) / 100;
}

export function dropRequest(ticker: string, price: number, pct = 5): string | null {
  const symbol = ticker.trim().toUpperCase();
  const level = levelBelow(price, pct);
  if (!TICKER.test(symbol) || level === null || level <= 0) return null;
  const shown = Number.isInteger(level) ? String(level) : level.toFixed(2);
  return `Tell me if ${symbol} drops below $${shown}`;
}

export function watchDropHref(ticker: string, price: number, pct = 5): string | null {
  const request = dropRequest(ticker, price, pct);
  return request ? `/agents?q=${encodeURIComponent(request)}` : null;
}
