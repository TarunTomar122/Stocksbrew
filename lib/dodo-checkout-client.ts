"use client";

import { getFirebaseAuth } from "@/lib/firebase-client";

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
    body: JSON.stringify({ period, market }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Checkout failed");
  if (!payload.checkoutUrl) throw new Error("No checkout URL returned");
  return payload.checkoutUrl as string;
}
