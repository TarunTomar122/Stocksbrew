import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = {
  init: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  setPersonProperties: vi.fn(),
  captureException: vi.fn(),
  get_distinct_id: vi.fn(() => "anon-1"),
  get_property: vi.fn((): string | undefined => "anonymous"),
};
vi.mock("posthog-js", () => ({ default: ph }));

function browser(hostname: string, storage: Record<string, string> = {}) {
  vi.stubGlobal("window", {
    location: { hostname },
    localStorage: { getItem: (key: string) => storage[key] ?? null, setItem: () => undefined },
  });
}

async function load() {
  vi.resetModules();
  return import("@/lib/posthog");
}

describe("browser analytics gate", () => {
  beforeEach(() => {
    for (const fn of Object.values(ph)) fn.mockClear();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends nothing from localhost in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    browser("localhost");
    const { captureEvent, identifyUser } = await load();
    captureEvent("stock_viewed", { ticker: "NVDA" });
    identifyUser("uid-1");
    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it("sends nothing from a preview deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    browser("tikrr-git-x.vercel.app");
    const { captureEvent } = await load();
    captureEvent("stock_viewed");
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("prints instead of sending when the debug flag is on outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    browser("localhost", { sb_analytics_debug: "1" });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { captureEvent } = await load();
    captureEvent("checkout_clicked", { period: "monthly", feature: undefined });
    expect(ph.capture).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    const [label, payload] = info.mock.calls[0] as [string, string];
    expect(label).toBe("[analytics] capture checkout_clicked");
    expect(JSON.parse(payload)).toEqual({ $environment: "dev", app_version: "dev", period: "monthly" });
    info.mockRestore();
  });

  it("sends on the production site with environment and version registered", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abcdef1234");
    browser("www.stocksbrew.online");
    const { captureEvent, loadPostHog } = await load();
    captureEvent("stock_viewed", { ticker: "NVDA", empty: undefined });
    // posthog-js is not loaded with the page: nothing reaches it until it arrives.
    expect(ph.init).not.toHaveBeenCalled();
    await loadPostHog();
    expect(ph.init).toHaveBeenCalledTimes(1);
    const config = ph.init.mock.calls[0]![1] as { capture_pageview: boolean; capture_exceptions: boolean; loaded: (c: typeof ph) => void };
    expect(config.capture_pageview).toBe(false);
    expect(config.capture_exceptions).toBe(true);
    config.loaded(ph);
    expect(ph.register).toHaveBeenCalledWith({ $environment: "production", app_version: "abcdef1" });
    expect(ph.capture).toHaveBeenCalledWith("stock_viewed", { ticker: "NVDA" }, { timestamp: expect.any(Date) });
  });

  it("queues calls made before posthog-js loads and replays them in order, with their own times", async () => {
    vi.stubEnv("NODE_ENV", "production");
    browser("www.stocksbrew.online");
    const { captureEvent, registerSuperProperties, loadPostHog } = await load();
    const order: string[] = [];
    ph.capture.mockImplementation((name: string) => {
      order.push(`capture:${name}`);
    });
    ph.register.mockImplementation(() => {
      order.push("register");
    });
    const before = Date.now();
    captureEvent("$pageview", { path: "/briefing" });
    registerSuperProperties({ plan: "free" });
    captureEvent("stock_viewed", { ticker: "NVDA" });
    expect(ph.capture).not.toHaveBeenCalled();
    await loadPostHog();
    expect(ph.init).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["capture:$pageview", "register", "capture:stock_viewed"]);
    const sentAt = (ph.capture.mock.calls[0] as unknown as [string, unknown, { timestamp: Date }])[2].timestamp.getTime();
    expect(sentAt).toBeGreaterThanOrEqual(before);
    expect(sentAt).toBeLessThanOrEqual(Date.now());
    ph.capture.mockReset();
    ph.register.mockReset();
  });

  it("does not reset an anonymous visitor, only an identified one", async () => {
    vi.stubEnv("NODE_ENV", "production");
    browser("www.stocksbrew.online");
    const { resetAnalyticsIfIdentified, loadPostHog } = await load();
    ph.get_property.mockReturnValue("anonymous");
    resetAnalyticsIfIdentified();
    await loadPostHog();
    expect(ph.reset).not.toHaveBeenCalled();
    ph.get_property.mockReturnValue("identified");
    resetAnalyticsIfIdentified();
    expect(ph.reset).toHaveBeenCalledTimes(1);
  });

  it("identifies with the uid only once, and never throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    browser("www.stocksbrew.online");
    const { identifyUser, captureEvent, loadPostHog } = await load();
    identifyUser("uid-9");
    await loadPostHog();
    expect(ph.identify).toHaveBeenCalledWith("uid-9", {});
    ph.get_distinct_id.mockReturnValue("uid-9");
    identifyUser("uid-9");
    expect(ph.identify).toHaveBeenCalledTimes(1);
    ph.capture.mockImplementation(() => {
      throw new Error("blocked by an extension");
    });
    expect(() => captureEvent("anything")).not.toThrow();
  });

  it("keeps sending GA4 events when posthog-js cannot be loaded", async () => {
    vi.stubEnv("NODE_ENV", "production");
    browser("www.stocksbrew.online");
    const gtag = vi.fn();
    (globalThis.window as unknown as { gtag: typeof gtag }).gtag = gtag;
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST");
    vi.doMock("posthog-js", () => {
      throw new Error("blocked by an extension");
    });
    const { captureEvent, loadPostHog } = await load();
    captureEvent("stock_viewed", { ticker: "NVDA" });
    await loadPostHog();
    captureEvent("stock_viewed", { ticker: "AMD" });
    expect(ph.capture).not.toHaveBeenCalled();
    expect(gtag).toHaveBeenCalledTimes(2);
    vi.doUnmock("posthog-js");
  });
});
