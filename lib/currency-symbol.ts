import type { MarketCode } from "@/lib/types";

/** Firestore/API currency code with fallback from app market when code is missing (`india` → ₹). */
export function currencySymbolFromCode(currency: string, market?: string): string {
  const c = String(currency || "").toUpperCase();
  if (c === "INR" || c === "IN") return "₹";
  if (c === "USD" || c === "US") return "$";
  if (c.length > 0) return `${c} `;
  const m = String(market || "").toLowerCase();
  if (m === "india") return "₹";
  return "$";
}

/** Firestore dashboard / instrument market (IN | US). */
export function currencySymbolFromMarketCode(market: MarketCode): string {
  return market === "IN" ? "₹" : "$";
}
