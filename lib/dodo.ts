/**
 * Dodo Payments server-side helper.
 * All calls are server-only - this file must never be imported on the client.
 */

const DODO_MODE = process.env.DODO_MODE ?? "test";
export const DODO_BASE =
  DODO_MODE === "live"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";

export function dodoHeaders(): HeadersInit {
  const key = process.env.DODO_API_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

export function isDodoConfigured(): boolean {
  const key = process.env.DODO_API_KEY ?? "";
  return Boolean(key) && key !== "sk_your_key_here";
}

/** The product ID to use for a given billing period and market. */
export function productIdFor(period: "monthly" | "yearly", market: "US" | "IN" = "US"): string {
  if (market === "IN") {
    // India only has monthly billing; yearly is not offered.
    return process.env.DODO_PRODUCT_ID_INDIA ?? "";
  }
  return period === "yearly"
    ? (process.env.DODO_PRODUCT_ID_YEARLY ?? "")
    : (process.env.DODO_PRODUCT_ID_MONTHLY ?? "");
}
