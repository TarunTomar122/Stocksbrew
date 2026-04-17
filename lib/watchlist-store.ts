/**
 * Unified watchlist store backed by localStorage.
 * Single source of truth for the user's watched tickers.
 */

const STORAGE_KEY = "tikrr_watchlist_v2";

/** Default watchlist for new users. */
const DEFAULT_TICKERS = ["NVDA", "AMD", "MSFT", "AMZN", "AAPL", "TSM", "INTC", "META", "GOOGL", "TSLA", "PLTR", "LMT"];

function readFromStorage(): string[] {
  if (typeof window === "undefined") return DEFAULT_TICKERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TICKERS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_TICKERS;
  } catch {
    return DEFAULT_TICKERS;
  }
}

function writeToStorage(tickers: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  } catch {
    // localStorage full or unavailable
  }
}

// In-memory cache so all callers see the same list within a render
let _cache: string[] | null = null;

export function getWatchlist(): string[] {
  if (_cache === null) _cache = readFromStorage();
  return _cache;
}

export function addToWatchlist(ticker: string): string[] {
  const upper = ticker.toUpperCase();
  const current = getWatchlist();
  if (current.includes(upper)) return current;
  const next = [...current, upper];
  _cache = next;
  writeToStorage(next);
  window.dispatchEvent(new CustomEvent("tikrr:watchlist-changed", { detail: next }));
  return next;
}

export function removeFromWatchlist(ticker: string): string[] {
  const upper = ticker.toUpperCase();
  const current = getWatchlist();
  const next = current.filter((t) => t !== upper);
  _cache = next;
  writeToStorage(next);
  window.dispatchEvent(new CustomEvent("tikrr:watchlist-changed", { detail: next }));
  return next;
}

export function isInWatchlist(ticker: string): boolean {
  return getWatchlist().includes(ticker.toUpperCase());
}

export function toggleWatchlist(ticker: string): { added: boolean; watchlist: string[] } {
  if (isInWatchlist(ticker)) {
    return { added: false, watchlist: removeFromWatchlist(ticker) };
  }
  return { added: true, watchlist: addToWatchlist(ticker) };
}
