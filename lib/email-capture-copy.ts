/**
 * The no-account morning email's words, in one place, so the form, the confirmation email and the confirm page make
 * the same promise, and only what backend/mail/subscribers.py really sends: before the US open, and only on a trading
 * day something happens to the stocks (a big move, a report today or tomorrow, a call we changed with its reason).
 * Never "each morning". Pure: safe in client and server code.
 */

/** "NVDA", "NVDA and AMD", "NVDA, AMD and TSLA". */
export function joinTickers(tickers: readonly string[]): string {
  if (tickers.length <= 1) return tickers[0] ?? "";
  return `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
}

/** The form's one line: at most 10 words. */
export function capturePromise(ticker?: string | null): string {
  return ticker ? `Get ${ticker} in your inbox before the open` : "The day's biggest moves, before the open";
}

/** When it comes, said once in the confirmation email and on the confirm page. */
export function whenLine(tickers: readonly string[]): string {
  if (tickers.length === 1) return `Only on days ${tickers[0]} moves a lot, reports or gets a new call.`;
  if (tickers.length > 1) return "Only on days one of your stocks moves a lot, reports or gets a new call.";
  return "Only on trading days with a big move or a report.";
}

/** What the confirmation email's headline promises. */
export function confirmHeadline(tickers: readonly string[]): string {
  return tickers.length
    ? `Confirm, and we'll email you about ${joinTickers(tickers)} before the open.`
    : "Confirm, and we'll email you the day's biggest moves before the open.";
}

/**
 * What the form says once a signup is in. The route answers every signup the same (new, waiting or already confirmed),
 * so the words must be true for all of them: a confirmed address gets no confirmation email, at most one "add NVDA to
 * your morning email?" email for a new stock.
 */
export const SENT_COPY = "Done. If this email is new, check your inbox.";
