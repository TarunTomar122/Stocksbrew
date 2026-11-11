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

/** "NVDA", "NVDA or AAPL", "NVDA, AAPL or MSFT": the subject the rule reader takes as "any of these". */
export function anyOf(tickers: string[]): string | null {
  const symbols = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()))];
  if (symbols.length === 0 || symbols.some((symbol) => !TICKER.test(symbol))) return null;
  return symbols.length === 1 ? symbols[0]! : `${symbols.slice(0, -1).join(", ")} or ${symbols[symbols.length - 1]}`;
}

/**
 * One agent for several stocks, for a list that offers a single "watch these" instead of a link on every row:
 * "Tell me when NVDA, AAPL or MSFT moves 5% in a day".
 */
export function watchMovesHref(tickers: string[], pct = 5): string | null {
  const who = anyOf(tickers);
  const whole = Math.round(pct);
  if (!who || !(whole >= 1 && whole <= 50)) return null;
  return href(`Tell me when ${who} moves ${whole}% in a day`);
}

/** "Tell me 3 days before NVDA or AAPL reports earnings". */
export function watchEarningsManyHref(tickers: string[], days = 3): string | null {
  const who = anyOf(tickers);
  const whole = Math.round(days);
  if (!who || !(whole >= 1 && whole <= 14)) return null;
  return href(`Tell me ${whole} ${whole === 1 ? "day" : "days"} before ${who} reports earnings`);
}
