/**
 * Hardcoded local user for MVP testing.
 * Replace with real Firebase Auth + Firestore once auth is built.
 */

export type LocalUser = {
  name: string;
  firstName: string;
  email: string;
  market: "us" | "india";
  /** Uppercase ticker symbols the user is watching. */
  watchlist: string[];
};

export const LOCAL_USER: LocalUser = {
  name: "Tanay Tomar",
  firstName: "Tanay",
  email: "tanay@tikrr.online",
  market: "us",
  watchlist: ["NVDA", "AMD", "MSFT", "AMZN", "AAPL", "TSM", "INTC", "META", "GOOGL", "TSLA", "PLTR", "LMT"],
};
