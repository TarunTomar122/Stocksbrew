import { describe, expect, it } from "vitest";

import { analyticsEnvironment, appVersion, isPrivatePath, maskReplayText, shouldSendClientEvents, shouldSendServerEvents } from "@/lib/analytics-env";

describe("analytics environment gate", () => {
  it("counts only the production hosts on a production build as production", () => {
    expect(analyticsEnvironment({ hostname: "www.stocksbrew.online", nodeEnv: "production", vercelEnv: "production" })).toBe("production");
    expect(analyticsEnvironment({ hostname: "stocksbrew.online", nodeEnv: "production" })).toBe("production");
    expect(analyticsEnvironment({ hostname: "WWW.STOCKSBREW.ONLINE", nodeEnv: "production" })).toBe("production");
  });

  it("keeps localhost and next dev out", () => {
    expect(analyticsEnvironment({ hostname: "localhost", nodeEnv: "production" })).toBe("dev");
    expect(analyticsEnvironment({ hostname: "127.0.0.1", nodeEnv: "production" })).toBe("dev");
    expect(analyticsEnvironment({ hostname: "mac.local", nodeEnv: "production" })).toBe("dev");
    expect(analyticsEnvironment({ hostname: "www.stocksbrew.online", nodeEnv: "development" })).toBe("dev");
    expect(analyticsEnvironment({ hostname: "", nodeEnv: "production" })).toBe("dev");
  });

  it("keeps Vercel previews and unknown hosts out, even on the production domain", () => {
    expect(analyticsEnvironment({ hostname: "tikrr-git-branch.vercel.app", nodeEnv: "production", vercelEnv: "preview" })).toBe("preview");
    expect(analyticsEnvironment({ hostname: "tikrr.vercel.app", nodeEnv: "production", vercelEnv: "production" })).toBe("preview");
    expect(analyticsEnvironment({ hostname: "www.stocksbrew.online", nodeEnv: "production", vercelEnv: "preview" })).toBe("preview");
    expect(analyticsEnvironment({ hostname: "evil-copy.example", nodeEnv: "production" })).toBe("preview");
  });

  it("sends from the browser only in production with a key", () => {
    expect(shouldSendClientEvents("production", "phc_x")).toBe(true);
    expect(shouldSendClientEvents("production", "")).toBe(false);
    expect(shouldSendClientEvents("production", undefined)).toBe(false);
    expect(shouldSendClientEvents("preview", "phc_x")).toBe(false);
    expect(shouldSendClientEvents("dev", "phc_x")).toBe(false);
  });

  it("sends from the server only on Vercel production, or with an explicit opt-in elsewhere", () => {
    const key = { NEXT_PUBLIC_POSTHOG_KEY: "phc_x" };
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(true);
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "development" })).toBe(false);
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "production" })).toBe(false);
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "production", POSTHOG_SERVER_CAPTURE: "1" })).toBe(true);
    expect(shouldSendServerEvents({ ...key, NODE_ENV: "production", VERCEL_ENV: "production", POSTHOG_SERVER_CAPTURE: "0" })).toBe(false);
    expect(shouldSendServerEvents({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
  });

  it("masks replay text on portfolio and account pages only", () => {
    expect(isPrivatePath("/watchlist")).toBe(true);
    expect(isPrivatePath("/watchlist/tax")).toBe(true);
    expect(isPrivatePath("/practice")).toBe(true);
    expect(isPrivatePath("/profile")).toBe(true);
    expect(isPrivatePath("/watchlists-explained")).toBe(false);
    expect(isPrivatePath("/stock/NVDA")).toBe(false);
    expect(maskReplayText("$12,400.50 in NVDA", "/watchlist")).toBe("********** ** ****");
    expect(maskReplayText("$12,400.50 in NVDA", "/stock/NVDA")).toBe("$12,400.50 in NVDA");
  });

  it("shortens the commit sha for app_version", () => {
    expect(appVersion("54a69c4e1b2c3d")).toBe("54a69c4");
    expect(appVersion("")).toBe("dev");
    expect(appVersion(undefined)).toBe("dev");
  });
});
