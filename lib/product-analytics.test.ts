import { beforeEach, describe, expect, it, vi } from "vitest";

const captureEvent = vi.fn();
const registerSuperProperties = vi.fn();
vi.mock("@/lib/posthog", () => ({ captureEvent, registerSuperProperties }));

const analytics = await import("@/lib/product-analytics");

function lastCall(): [string, Record<string, unknown>] {
  return captureEvent.mock.calls.at(-1) as [string, Record<string, unknown>];
}

describe("product analytics helpers", () => {
  beforeEach(() => {
    captureEvent.mockClear();
    registerSuperProperties.mockClear();
  });

  it("names every event object_action", () => {
    analytics.trackSigninStarted({ surface: "header" });
    analytics.trackUserSignedIn({ surface: "paywall", isNewUser: true });
    analytics.trackUserSignedIn({ surface: "paywall" });
    analytics.trackLimitHit({ feature: "ask", plan: "free", limit: 3 });
    analytics.trackCheckoutClicked({ period: "monthly", market: "US", signedIn: true, surface: "pricing" });
    analytics.trackCheckoutReturned({ subscription_id: "sub_1", source: "success_modal" });
    analytics.trackAskQuestionAsked({ origin: "typed", turn: 1, question: "Why did NVDA fall?" });
    analytics.trackSearchPerformed({ surface: "header", query: "nvda", results_count: 3, found: true, ticker: "NVDA" });
    analytics.trackBacktestRun({ ok: true, holdings: 2, tickers: ["AAPL", "MSFT"], origin: "form" });
    analytics.trackAgentSwitchedOn({ template: "big-move", via: "create", enabled: true });
    analytics.trackAgentSwitchedOn({ template: "big-move", via: "toggle", enabled: false });
    const names = captureEvent.mock.calls.map((call) => call[0]);
    expect(names).toEqual([
      "signin_started",
      "user_signed_up",
      "user_signed_in",
      "limit_hit",
      "checkout_clicked",
      "checkout_returned",
      "ask_question_asked",
      "search_performed",
      "backtest_run",
      "agent_switched_on",
      "agent_paused",
    ]);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z0-9]+)+$/);
  });

  it("never sends the text of an Ask question, only a length bucket", () => {
    analytics.trackAskQuestionAsked({ origin: "typed", turn: 2, question: "Should I sell my 120 shares of TSLA at $250?" });
    const [, props] = lastCall();
    expect(JSON.stringify(props)).not.toContain("TSLA");
    expect(JSON.stringify(props)).not.toContain("120");
    expect(props).toEqual({ origin: "typed", turn: 2, length: "medium" });
  });

  it("uses the super property's plan words on limit_hit", () => {
    analytics.trackLimitHit({ feature: "ask", plan: "anonymous", limit: 0 });
    expect(lastCall()[1]).toMatchObject({ feature: "ask", plan: "anon", limit: 0 });
  });

  it("cleans and caps search queries and skips empty ones", () => {
    analytics.trackSearchPerformed({ surface: "hero", query: "  apple   inc  ", results_count: 0, found: false });
    expect(lastCall()[1]).toMatchObject({ query: "APPLE INC", found: false, results_count: 0 });
    captureEvent.mockClear();
    analytics.trackSearchPerformed({ surface: "hero", query: "   ", results_count: 0, found: false });
    expect(captureEvent).not.toHaveBeenCalled();
    expect(analytics.cleanSearchQuery("x".repeat(80))).toHaveLength(40);
  });

  it("remembers where the last checkout click came from for the server", () => {
    analytics.trackCheckoutClicked({ period: "yearly", market: "US", signedIn: false, surface: "paywall", feature: "backtest" });
    expect(analytics.checkoutSource()).toEqual({ surface: "paywall", feature: "backtest" });
    expect(lastCall()[1]).toMatchObject({ period: "yearly", signed_in: false, surface: "paywall", feature: "backtest" });
  });

  it("sets the plan super property, and marks the plan Pro on checkout return", () => {
    analytics.setAnalyticsPlan("free");
    expect(registerSuperProperties).toHaveBeenLastCalledWith({ plan: "free", signed_in: true, paywall: expect.stringMatching(/^v[12]$/) });
    analytics.setAnalyticsPlan("anon");
    expect(registerSuperProperties).toHaveBeenLastCalledWith({ plan: "anon", signed_in: false, paywall: expect.stringMatching(/^v[12]$/) });
    analytics.trackCheckoutReturned({ subscription_id: "sub_2" });
    expect(registerSuperProperties).toHaveBeenLastCalledWith({ plan: "pro", signed_in: true, paywall: expect.stringMatching(/^v[12]$/) });
  });

  it("caps list properties so payloads stay small", () => {
    analytics.trackBacktestRun({ ok: false, holdings: 14, tickers: Array.from({ length: 14 }, (_, i) => `T${i}`), origin: "preset", error_code: "limit_reached" });
    expect(String(lastCall()[1].tickers).split(",")).toHaveLength(10);
    analytics.trackScreenerFilterApplied({ fields: Array.from({ length: 20 }, (_, i) => `f${i}`), active_count: 20 });
    expect(String(lastCall()[1].fields).split(",")).toHaveLength(12);
  });

  it("reports one no-results search per pause in typing", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    try {
      analytics.trackSearchNoResults("header", "zz");
      analytics.trackSearchNoResults("header", "zzq");
      vi.advanceTimersByTime(1300);
      expect(captureEvent).toHaveBeenCalledTimes(1);
      expect(lastCall()).toEqual(["search_performed", expect.objectContaining({ query: "ZZQ", found: false })]);
      // The same query again does not repeat the event.
      analytics.trackSearchNoResults("header", "zzq");
      vi.advanceTimersByTime(1300);
      expect(captureEvent).toHaveBeenCalledTimes(1);
      // Picking something cancels a pending one.
      analytics.trackSearchNoResults("header", "abcd");
      analytics.cancelSearchNoResults("header");
      vi.advanceTimersByTime(1300);
      expect(captureEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("maps paths to app areas", () => {
    expect(analytics.pageArea("/")).toBe("landing");
    expect(analytics.pageArea("/stock/NVDA")).toBe("stock");
    expect(analytics.pageArea("/watchlist/tax?x=1")).toBe("watchlist");
    expect(analytics.pageArea(null)).toBe("landing");
  });
});
