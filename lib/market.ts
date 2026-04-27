import { cookies } from "next/headers";

import type { Market } from "@/lib/types";

export const MARKET_COOKIE = "tikrr_market";

export function getCurrentMarket(): Market {
  const val = cookies().get(MARKET_COOKIE)?.value;
  return val === "IN" ? "IN" : "US";
}
