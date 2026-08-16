import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("first Watchlist activation flow", () => {
  it("identifies the Firebase user before emitting the signup event", () => {
    const signIn = source("lib/sign-in.ts");
    expect(signIn.indexOf("identifyUser(result.user.uid")).toBeGreaterThan(-1);
    expect(signIn.indexOf("identifyUser(result.user.uid")).toBeLessThan(
      signIn.indexOf("trackUserSignedIn({"),
    );
  });

  it("uses a real sign-in action on the signed-out Watchlist instead of linking to itself", () => {
    const states = source("components/radar-next/states.tsx");
    expect(states).toContain("StartRadarButton");
    expect(states).toContain('surface="radar_page"');
    expect(states).not.toContain('href="/watchlist"');
  });

  it("delivers free feed value after sign-in instead of redirecting immediately to checkout", () => {
    const unlock = source("components/feed-row-lock-teaser.tsx");
    expect(unlock).toContain('captureEvent("free_feed_unlocked"');
    expect(unlock).toContain("router.refresh()");
  });

  it("captures checkout on the server before the browser leaves for the payment provider", () => {
    const checkout = source("app/api/subscription/create-checkout/route.ts");
    expect(checkout).toContain('captureServerEvent(uid, "checkout_started"');
    expect(checkout.indexOf('captureServerEvent(uid, "checkout_started"')).toBeLessThan(
      checkout.indexOf("return NextResponse.json({ checkoutUrl })"),
    );
  });

  it("keeps the Dodo product trial enabled for eligible US monthly and yearly checkouts", () => {
    const checkout = source("app/api/subscription/create-checkout/route.ts");
    expect(checkout).toContain('const trialEligible = market === "US" && isTrialEligible(userDoc)');
    expect(checkout).not.toContain('effectivePeriod === "yearly" && isTrialEligible(userDoc)');
  });

  it("keeps the Pro intelligence masked on non-Pro stock pages", () => {
    const stockPage = source("components/stock-page-stream.tsx");
    const stockDetail = source("components/stock-detail.tsx");
    expect(stockPage).toContain("const shouldLoadAI = subscribed");
    expect(stockDetail).toContain("const showLockedVerdict = !subscribed");
    expect(stockDetail).toContain("<LockedVerdictCall");
  });

  it("keeps every stock unlock CTA at a mobile-safe tap height", () => {
    const trialGate = source("components/stock-trial-gate.tsx");
    const legacyGate = source("components/locked-verdict-call.tsx");
    expect(trialGate).toContain("min-h-14");
    expect(legacyGate).toContain("min-h-14");
    expect(legacyGate).not.toContain("inline-flex h-10");
  });

  it("shows the bulk Watchlist action after signed-out auth resolution", () => {
    const bulkTrack = source("components/track-in-radar-button.tsx");
    expect(bulkTrack).toContain("const { user, loading, initialAuthed } = useUser()");
    expect(bulkTrack).toContain("const isLoading = loading && !initialAuthed");
    expect(bulkTrack).not.toContain("const isLoading = !initialAuthed");
  });

  it("starts new users with one real stock task and records the chosen path", () => {
    const onboarding = source("components/post-signup-onboarding.tsx");
    expect(onboarding).toContain('id: "research"');
    expect(onboarding).toContain('id: "watchlist"');
    expect(onboarding).toContain('id: "holdings"');
    expect(onboarding).toContain('captureEvent("onboarding_path_selected"');
    expect(onboarding).toContain('captureEvent("onboarding_stock_researched"');
    expect(onboarding).toContain('captureEvent("onboarding_stock_added"');
  });
});
