import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFeatures, listedFeatureIds, type Feature, type FeatureId, type Plan, type Rule } from "./entitlements";

/**
 * The tighter Free/Pro line (PAYWALL_V2=1) lives in the same table as today's
 * line. These tests hold both lines to the same rules, and check that the flag
 * off leaves today's line exactly as it was.
 */

const PLANS: Plan[] = ["anon", "free", "pro"];

function limitIn(table: Record<FeatureId, Feature>, id: FeatureId, plan: Plan): number {
  const rule: Rule = table[id][plan];
  if (rule.kind === "open") return Number.POSITIVE_INFINITY;
  if (rule.kind === "locked") return 0;
  if (rule.kind === "covered") return limitIn(table, "covered_stocks", plan);
  return rule.max;
}

describe.each([
  ["today's line", false],
  ["the tighter line", true],
])("%s", (_label, v2) => {
  const table = buildFeatures(v2);
  const ids = Object.keys(table) as FeatureId[];

  it("never gives a smaller plan more than a bigger one", () => {
    for (const id of ids) {
      expect(limitIn(table, id, "anon"), id).toBeLessThanOrEqual(limitIn(table, id, "free"));
      expect(limitIn(table, id, "free"), id).toBeLessThanOrEqual(limitIn(table, id, "pro"));
    }
  });

  it("has lock copy, a free way out and no em dashes on every limited row", () => {
    const wayOut = /swap|unfollow|pause|remove|delete|replace|wait|reset|resets|free|on free|stay|change/i;
    for (const id of ids) {
      const row = table[id];
      if (PLANS.every((plan) => row[plan].kind === "open")) continue;
      expect(row.lock.title.length, id).toBeGreaterThan(0);
      expect(row.lock.body, id).toMatch(wayOut);
      expect(`${row.lock.title} ${row.lock.body} ${row.name}`, id).not.toMatch(/[—!]/);
    }
  });

  it("never gates the call, reading, sources or the person's own data", () => {
    for (const id of ["stock_call", "stock_report", "wire", "follow_directory", "strategies"] as const) {
      expect(table[id].free.kind, id).toBe("open");
      expect(table[id].anon.kind, id).toBe("open");
    }
    expect(table.tracked_stocks.free.kind).toBe("open");
    expect(table.portfolio_analytics.free.kind).toBe("open");
  });
});

describe("the two lines", () => {
  it("only changes what the tighter line names", () => {
    const today = buildFeatures(false);
    const tighter = buildFeatures(true);
    const changed = (Object.keys(today) as FeatureId[]).filter((id) => JSON.stringify(today[id]) !== JSON.stringify(tighter[id]));
    expect(changed.sort()).toEqual(["agent_events", "agents"]);
  });

  it("runs one agent on Free and keeps filing and news agents for Pro", () => {
    const tighter = buildFeatures(true);
    expect(tighter.agents.free).toEqual({ kind: "count", max: 1, unit: "agent" });
    expect(tighter.agents.lock.title).toMatch(/one agent/);
    expect(tighter.agent_events.free.kind).toBe("locked");
    expect(tighter.agent_events.pro.kind).toBe("open");
  });

  it("leaves today's line as it is: two agents, and filing and news agents on Free", () => {
    const today = buildFeatures(false);
    expect(today.agents.free).toEqual({ kind: "count", max: 2, unit: "agents" });
    expect(today.agent_events.free.kind).toBe("open");
  });

  it("lists the new row on /pricing only on the tighter line", () => {
    expect(listedFeatureIds(false)).not.toContain("agent_events");
    expect(listedFeatureIds(true)).toContain("agent_events");
  });
});

describe("PAYWALL_V2 from the environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off unless set to 1: five covered stocks, today's table", async () => {
    vi.stubEnv("PAYWALL_V2", "");
    vi.resetModules();
    const flag = await import("./paywall-flag");
    const ent = await import("./entitlements");
    expect(flag.PAYWALL_V2).toBe(false);
    expect(flag.PAYWALL_VARIANT).toBe("v1");
    expect(ent.FREE_COVERED_STOCKS).toBe(5);
    expect(ent.limitFor("covered_stocks", "free")).toBe(5);
    expect(ent.limitFor("agents", "free")).toBe(2);
    expect(ent.can("agent_events", "free")).toBe(true);
    expect(ent.lockCopy("covered_stocks").title).toBe("Free covers five stocks");
  });

  it("on: three covered stocks, one agent, filing and news agents on Pro, and the copy says three", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    const flag = await import("./paywall-flag");
    const ent = await import("./entitlements");
    expect(flag.PAYWALL_VARIANT).toBe("v2");
    expect(ent.FREE_COVERED_STOCKS).toBe(3);
    expect(ent.limitFor("covered_stocks", "free")).toBe(3);
    expect(ent.limitFor("stock_zones", "free")).toBe(3);
    expect(ent.limitFor("agents", "free")).toBe(1);
    expect(ent.can("agent_events", "free")).toBe(false);
    expect(ent.can("agent_events", "pro")).toBe(true);
    expect(ent.lockCopy("covered_stocks").title).toBe("Free covers three stocks");
    expect(ent.lockCopy("briefing_personal").body).toMatch(/three stocks/);
    expect(JSON.stringify(ent.FEATURES)).not.toMatch(/\bfive (covered|stocks)\b/);
  });

  it("on: an agent that watches filings or news cannot run on Free, everything else can", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    const { planMayRun, usesProEvents } = await import("./agent-jobs");
    const filing = { trigger: { type: "event" as const, event: "sec_filing" as const } };
    const news = { trigger: { type: "event" as const, event: "news" as const } };
    const earnings = { trigger: { type: "event" as const, event: "earnings_approaching" as const, days_before: 3 } };
    const price = { trigger: { type: "price" as const, rule: "crosses_below" as const, level: 100 } };
    expect(usesProEvents(filing) && usesProEvents(news)).toBe(true);
    expect(usesProEvents(earnings) || usesProEvents(price)).toBe(false);
    expect(planMayRun(filing, "free")).toBe(false);
    expect(planMayRun(news, "free")).toBe(false);
    expect(planMayRun(earnings, "free")).toBe(true);
    expect(planMayRun(price, "free")).toBe(true);
    expect(planMayRun(news, "pro")).toBe(true);
  });

  it("off: Free runs filing and news agents as it does today", async () => {
    vi.stubEnv("PAYWALL_V2", "");
    vi.resetModules();
    const { planMayRun } = await import("./agent-jobs");
    expect(planMayRun({ trigger: { type: "event", event: "news" } }, "free")).toBe(true);
  });
});
