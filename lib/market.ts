import type { Market } from "@/lib/types";

export const MARKET_COOKIE = "tikrr_market";

export function getCurrentMarket(): Market {
  // India is temporarily disabled in the frontend while we harden data quality.
  return "US";
}
