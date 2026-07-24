import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("first Radar activation flow", () => {
  it("identifies the Firebase user before emitting the signup event", () => {
    const signIn = source("lib/sign-in.ts");
    expect(signIn.indexOf("identifyUser(result.user.uid")).toBeGreaterThan(-1);
    expect(signIn.indexOf("identifyUser(result.user.uid")).toBeLessThan(
      signIn.indexOf("trackUserSignedIn({"),
    );
  });

  it("uses a real sign-in action on the signed-out Radar instead of linking to itself", () => {
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
});
