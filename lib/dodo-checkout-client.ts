"use client";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { checkoutSource } from "@/lib/product-analytics";

export async function startDodoCheckout(
  period: "monthly" | "yearly" = "monthly",
  market: "US" | "IN" = "US",
): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in to continue");

  const idToken = await user.getIdToken();
  const response = await fetch("/api/subscription/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    // `source` is the page or lock behind the last checkout click, for analytics only.
    body: JSON.stringify({ period, market, source: checkoutSource() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Checkout failed");
  if (!payload.checkoutUrl) throw new Error("No checkout URL returned");
  return payload.checkoutUrl as string;
}
