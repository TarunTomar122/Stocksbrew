"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { MARKET_COOKIE } from "@/lib/market";

export async function setMarket(market: "US" | "IN") {
  cookies().set(MARKET_COOKIE, market, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
