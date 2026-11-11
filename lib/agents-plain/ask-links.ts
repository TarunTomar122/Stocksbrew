/**
 * "Watch this for me": links from a finding elsewhere (the x-ray, the memo, the earnings planner, the stress
 * test) to the plain-English agent box on /agents, with the request filled in and read back there. Nothing is
 * saved until the person says so. Only requests the rule reader in ./parse.ts turns into an agent are offered,
 * one builder per trigger, so every link lands on an agent and never on "I can't watch that yet".
 */

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

function href(request: string): string {
  return `/agents?q=${encodeURIComponent(request)}`;
}

/** The request for a big daily move: "Tell me when NVDA moves 5% in a day". */
export function moveRequest(ticker: string, pct = 5): string | null {
  const symbol = ticker.trim().toUpperCase();
  const whole = Math.round(pct);
  if (!TICKER.test(symbol) || !(whole >= 1 && whole <= 50)) return null;
  return `Tell me when ${symbol} moves ${whole}% in a day`;
}

/** The request for an earnings reminder: "Tell me 3 days before NVDA reports earnings". */
export function earningsRequest(ticker: string, days = 3): string | null {
  const symbol = ticker.trim().toUpperCase();
  const whole = Math.round(days);
  if (!TICKER.test(symbol) || !(whole >= 1 && whole <= 14)) return null;
  return `Tell me ${whole} ${whole === 1 ? "day" : "days"} before ${symbol} reports earnings`;
}

export function watchMoveHref(ticker: string, pct = 5): string | null {
  const request = moveRequest(ticker, pct);
  return request ? href(request) : null;
}

export function watchEarningsHref(ticker: string, days = 3): string | null {
  const request = earningsRequest(ticker, days);
  return request ? href(request) : null;
}
