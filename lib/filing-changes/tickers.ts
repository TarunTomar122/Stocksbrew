/** Which stocks the filing check reads: pure helpers over user docs. */

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** "US_BRK_B" → "BRK.B"; null for anything that is not a US stock id. */
export function tickerOfId(raw: unknown): string | null {
  const id = String(raw ?? "").trim().toUpperCase();
  if (!id.startsWith("US_") || id.length <= 3) return null;
  const ticker = id.slice(3).replace(/_/g, ".");
  return TICKER.test(ticker) ? ticker : null;
}

/** Every US ticker anyone tracks or holds: holdings first, then watched names, each once. */
export function trackedTickers(users: ReadonlyArray<{ tracked_stocks?: unknown; watchlist_positions?: unknown }>): string[] {
  const held = new Set<string>();
  const watched = new Set<string>();
  for (const user of users) {
    const positions = user.watchlist_positions && typeof user.watchlist_positions === "object" ? (user.watchlist_positions as Record<string, unknown>) : {};
    const ids = [...(Array.isArray(user.tracked_stocks) ? user.tracked_stocks : []), ...Object.keys(positions)];
    for (const raw of ids) {
      const ticker = tickerOfId(raw);
      if (!ticker) continue;
      if (positions[String(raw)] === "holding") held.add(ticker);
      else watched.add(ticker);
    }
  }
  return [...held, ...[...watched].filter((ticker) => !held.has(ticker))];
}
