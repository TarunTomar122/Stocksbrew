import { describe, expect, it, vi } from "vitest";

// React's request cache only exists inside the server runtime.
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

import { resolveIsSubscribed, type UserDoc } from "./watchlist";

/**
 * The same table as backend/tests/test_subscription_entitlement.py
 * (IsProUserMatchesTheAppTest). The Python email jobs decide who gets a Pro
 * email with `is_pro_user`; it must agree with what the app shows, case for
 * case. Change one side and this table, and the other side's test fails.
 */
const CASES: Array<[string, Record<string, unknown> | null, boolean]> = [
  ["empty", {}, false],
  ["none", null, false],
  ["subscribed, no status", { is_subscribed: true }, true],
  ["subscribed, active", { is_subscribed: true, subscriptionStatus: "active" }, true],
  ["subscribed, processing", { is_subscribed: true, subscriptionStatus: "processing" }, true],
  ["subscribed, cancelled", { is_subscribed: true, subscriptionStatus: "cancelled" }, false],
  ["subscribed, on_hold", { is_subscribed: true, subscriptionStatus: "on_hold" }, false],
  ["subscribed, upper-case expired", { is_subscribed: true, subscriptionStatus: " EXPIRED " }, false],
  ["flag missing, trialing", { subscriptionStatus: "trialing" }, true],
  ["flag missing, on_trial", { subscriptionStatus: "on_trial" }, true],
  ["flag false, active", { is_subscribed: false, subscriptionStatus: "active" }, true],
  ["flag false, no status", { is_subscribed: false }, false],
  ["gift, future", { proGifted: true, proGiftExpiresAt: "2099-01-01T00:00:00Z" }, true],
  ["gift, past", { proGifted: true, proGiftExpiresAt: "2020-01-01T00:00:00Z", is_subscribed: true }, false],
  ["gift, bad date", { proGifted: true, proGiftExpiresAt: "soon" }, false],
];

describe("resolveIsSubscribed matches the Python is_pro_user", () => {
  it.each(CASES)("%s", (_name, doc, expected) => {
    expect(resolveIsSubscribed(doc as UserDoc | null)).toBe(expected);
  });
});
