/**
 * The free-for-everyone AI tier that ships with launch. These tickers always
 * get a full news-backed or no-news LLM call on Radar - subscribers can
 * extend their personal AI tier beyond this set via the track-stock flow.
 *
 * Kept in sync with `backend/config/instrument_universe.json` universes
 * `us_ai_launch` and `in_ai_launch`. If either list changes, update both.
 */

export const US_AI_LAUNCH_INSTRUMENTS: readonly string[] = [
  "US_NVDA",
  "US_AAPL",
  "US_TSLA",
  "US_MSFT",
  "US_AMZN",
  "US_GOOGL",
  "US_META",
  "US_AMD",
  "US_PLTR",
  "US_COIN",
  "US_AVGO",
  "US_LLY",
  "US_JPM",
  "US_IDX_SPX",
  "US_NFLX",
];

export const IN_AI_LAUNCH_INSTRUMENTS: readonly string[] = [
  "IN_RELIANCE",
  "IN_HDFCBANK",
  "IN_TCS",
  "IN_INFY",
  "IN_TATAMOTORS",
  "IN_ADANIENT",
  "IN_ZOMATO",
  "IN_NYKAA",
  "IN_PAYTM",
  "IN_IRCTC",
  "IN_HAL",
  "IN_BEL",
  "IN_IRFC",
  "IN_SUNPHARMA",
  "IN_ITC",
];

const LAUNCH_SET = new Set<string>([
  ...US_AI_LAUNCH_INSTRUMENTS,
  ...IN_AI_LAUNCH_INSTRUMENTS,
]);

export function isLaunchAITier(instrumentId: string): boolean {
  return LAUNCH_SET.has(instrumentId);
}

export type StockTier = "ai_launch" | "ai_personal" | "free";

export function resolveStockTier(
  instrumentId: string,
  trackedStocks: readonly string[],
): StockTier {
  if (isLaunchAITier(instrumentId)) return "ai_launch";
  if (trackedStocks.includes(instrumentId)) return "ai_personal";
  return "free";
}
