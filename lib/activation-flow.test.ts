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

  it("delivers free feed value after sign-in instead of redirecting immediately to checkout", () => {
    const unlock = source("components/feed-row-lock-teaser.tsx");
    expect(unlock).toContain('captureEvent("free_feed_unlocked"');
    expect(unlock).toContain("router.refresh()");
  });

  it("captures checkout on the server before the browser leaves for the payment provider", () => {
    const checkout = source("app/api/subscription/create-checkout/route.ts");
    expect(checkout).toContain('captureServerEventSafe(uid, "checkout_started"');
    expect(checkout.indexOf('captureServerEventSafe(uid, "checkout_started"')).toBeLessThan(
      checkout.indexOf("return NextResponse.json({ checkoutUrl })"),
    );
  });

  it("keeps the Dodo product trial enabled for eligible US monthly and yearly checkouts", () => {
    const checkout = source("app/api/subscription/create-checkout/route.ts");
    expect(checkout).toContain('const trialEligible = market === "US" && isTrialEligible(userDoc)');
    expect(checkout).not.toContain('effectivePeriod === "yearly" && isTrialEligible(userDoc)');
  });

  // The call and the written read are open to everyone. What a plan gates is
  // the levels (zones, what would change the call, the pre-earnings read), and
  // they are removed on the server, never hidden in the browser.
  it("strips the price levels on the server for stocks the viewer's plan does not cover", () => {
    const stockPage = source("components/stock-page-stream.tsx");
    const report = source("components/stock-report/report.tsx");
    expect(stockPage).toContain("const hasLevels = canSeeLevels(viewer, stock.instrument_id)");
    expect(stockPage).toContain("fullRead && !hasLevels");
    expect(stockPage).toContain("zones: { addBelow: null, addAbove: null, trimAbove: null },");
    // The reasoning goes with the levels: an uncovered stock keeps only the call, its headline and the date.
    expect(stockPage).toContain("reasons: [],");
    expect(stockPage).toContain("changers: [],");
    expect(stockPage).toContain("const preEarningsDoc = hasLevels");
    expect(stockPage).toContain("levels: hasLevels");
    expect(stockPage).not.toContain("StockDetail");
    expect(report).toContain("!data.gate.levels");
    expect(report).toContain("<LevelsLock");
  });

  it("keeps the stock unlock CTA at a mobile-safe tap height", () => {
    const report = source("components/stock-report/report.tsx");
    const gate = source("components/oa/gate.tsx");
    expect(report).toContain('<LockCard feature="stock_zones"');
    expect(gate).toContain('<OaButton size="sm" loading={busy} onClick={act} className="max-sm:min-h-11');
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
