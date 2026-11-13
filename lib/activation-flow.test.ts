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

  // The call, its reasons and what would change it are open to everyone, on
  // every stock. What a plan gates is the full report (zones, the whole brief,
  // the pre-earnings read, the call's history), and it is removed on the
  // server, never hidden in the browser.
  it("strips the price levels on the server for stocks the viewer's plan does not cover", () => {
    const stockPage = source("components/stock-page-stream.tsx");
    const report = source("components/stock-report/report.tsx");
    expect(stockPage).toContain("const hasLevels = canSeeLevels(viewer, stock.instrument_id)");
    expect(stockPage).toContain("fullRead && !hasLevels");
    expect(stockPage).toContain("zones: { addBelow: null, addAbove: null, trimAbove: null },");
    // The reasons stay, with any price inside them taken out; the rest of the brief goes with the levels.
    expect(stockPage).toContain("reasons: fullRead.reasons.map((item) => redactLevels(item))");
    expect(stockPage).toContain("body: null,");
    expect(stockPage).toContain("intelPro: hasLevels ? intelPro : null");
    expect(stockPage).not.toContain("callEvidence.conditions = []");
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

  it("starts new users by adding their stocks and lands them on their agent's first look, never on the plans", () => {
    const button = source("components/oa/start-free-button.tsx");
    expect(button).not.toContain('"/subscribe"');
    expect(button).toContain('"/portfolio"');
    const gate = source("components/post-signup-onboarding.tsx");
    // The dialog loads only when it opens.
    expect(gate).toContain('import("@/components/onboarding-dialog")');
    const dialog = source("components/onboarding-dialog.tsx");
    for (const id of ['id: "own"', 'id: "popular"', 'id: "import"']) expect(dialog).toContain(id);
    // The dialog's finish opens the agent's first look on their stocks (lib/first-look), recorded on their own doc.
    expect(dialog).toContain('const FINISH_HREF = "/agent"');
    expect(dialog).toContain('startFirstLook("onboarding")');
    expect(dialog).toContain('fetch("/api/track"');
    expect(dialog).toContain('captureEvent("onboarding_path_selected"');
    expect(dialog).toContain('captureEvent("onboarding_stock_added"');
    // The "how did you hear about us" question still follows the first stock.
    expect(dialog).toContain('dispatchRadarTrackChanged({ action: "add"');
  });
});
