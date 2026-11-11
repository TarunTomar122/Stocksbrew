import { describe, expect, it } from "vitest";

import { AGENT_DAILY_CALL_LIMIT } from "./agent-access-config";
import {
  FEATURES,
  can,
  clip,
  clipByAge,
  describeRule,
  limitFor,
  nextStep,
  planOf,
  redactLevels,
  redactLevelsDeep,
  redactOurLevels,
  ruleFor,
  type FeatureId,
} from "./entitlements";

const ids = Object.keys(FEATURES) as FeatureId[];
const rank = (feature: FeatureId, plan: "anon" | "free" | "pro") => limitFor(feature, plan);

describe("entitlements", () => {
  it("never gives a smaller plan more than a bigger one", () => {
    for (const id of ids) {
      expect(rank(id, "anon"), id).toBeLessThanOrEqual(rank(id, "free"));
      expect(rank(id, "free"), id).toBeLessThanOrEqual(rank(id, "pro"));
    }
  });

  it("has lock copy for every feature that can be limited", () => {
    for (const id of ids) {
      const limited = ruleFor(id, "anon").kind !== "open" || ruleFor(id, "free").kind !== "open";
      if (!limited) continue;
      expect(FEATURES[id].lock.title.length, id).toBeGreaterThan(0);
      expect(FEATURES[id].lock.body.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps lock copy free of em dashes and exclamation marks", () => {
    for (const id of ids) {
      expect(`${FEATURES[id].lock.title} ${FEATURES[id].lock.body} ${FEATURES[id].name}`, id).not.toMatch(/[—!]/);
    }
  });

  it("maps viewers to plans", () => {
    expect(planOf({ signedIn: false, isSubscribed: false })).toBe("anon");
    expect(planOf({ signedIn: true, isSubscribed: false })).toBe("free");
    expect(planOf({ signedIn: true, isSubscribed: true })).toBe("pro");
  });

  it("clips lists and reports only a count of what is hidden", () => {
    const rows = Array.from({ length: 40 }, (_, i) => i);
    expect(clip("followed_sources", "free", rows)).toEqual({ items: rows.slice(0, 3), hidden: 37 });
    expect(clip("followed_sources", "pro", rows).hidden).toBe(0);
    expect(clip("followed_sources", "free", rows.slice(0, 2)).hidden).toBe(0);
  });

  it("keeps the call open to everyone and puts the levels behind coverage", () => {
    expect(can("stock_call", "anon")).toBe(true);
    expect(ruleFor("stock_zones", "free").kind).toBe("covered");
    expect(limitFor("stock_zones", "free")).toBe(5);
    expect(can("stock_zones", "anon")).toBe(false);
    expect(limitFor("covered_stocks", "pro")).toBe(Number.POSITIVE_INFINITY);
  });

  it("never gates reading what the pipeline wrote once", () => {
    for (const id of ["stock_report", "wire", "follow_directory", "strategies", "themes", "screener"] as const) {
      expect(ruleFor(id, "anon").kind, id).toBe("open");
    }
  });

  it("knows the next step", () => {
    expect(nextStep("covered_stocks", "anon")).toBe("sign_in");
    expect(nextStep("screener_call_filters", "anon")).toBe("upgrade");
    expect(nextStep("ask", "free")).toBe("upgrade");
    expect(nextStep("ask", "pro")).toBeNull();
  });

  it("describes rules in plain words", () => {
    expect(describeRule(ruleFor("covered_stocks", "free"))).toBe("5 stocks");
    expect(describeRule(ruleFor("ask", "free"))).toBe("3 questions a day");
    expect(describeRule(ruleFor("backtest_history", "free"))).toBe("Last 5 years");
    expect(describeRule(ruleFor("stock_zones", "free"))).toBe("Covered stocks");
    expect(describeRule(ruleFor("wire", "anon"))).toBe("Included");
    expect(describeRule(ruleFor("agent_api", "free"))).toBe("Not included");
  });

  it("tracks without a limit and limits coverage instead", () => {
    expect(limitFor("tracked_stocks", "free")).toBe(Number.POSITIVE_INFINITY);
    expect(limitFor("tracked_stocks", "pro")).toBe(Number.POSITIVE_INFINITY);
    expect(can("tracked_stocks", "anon")).toBe(false);
    expect(limitFor("covered_stocks", "free")).toBe(5);
  });

  it("puts the small counts from the table on Free", () => {
    expect(limitFor("ask", "anon")).toBe(0);
    expect(limitFor("ask", "free")).toBe(3);
    expect(limitFor("price_alerts", "free")).toBe(5);
    expect(limitFor("price_alerts", "pro")).toBe(Number.POSITIVE_INFINITY);
    expect(can("zone_alerts", "free")).toBe(false);
    expect(limitFor("agents", "free")).toBe(2);
    expect(limitFor("followed_sources", "free")).toBe(3);
    expect(limitFor("backtest", "free")).toBe(3);
    expect(limitFor("backtest_history", "free")).toBe(5);
    expect(limitFor("signals_archive", "free")).toBe(7);
    expect(limitFor("signals_archive", "pro")).toBe(Number.POSITIVE_INFINITY);
    expect(can("screener_call_filters", "free")).toBe(false);
    expect(can("screener_call_filters", "pro")).toBe(true);
  });

  it("says the agent API limit is per day, and matches what the API enforces", () => {
    const rule = ruleFor("agent_api", "pro");
    expect(rule.kind === "meter" && rule.per).toBe("day");
    expect(limitFor("agent_api", "pro")).toBe(AGENT_DAILY_CALL_LIMIT);
    expect(JSON.stringify(FEATURES)).not.toMatch(/a month|per month/i);
  });

  it("names a way out that costs nothing on every limit", () => {
    // Swap, unfollow, pause, delete, wait for the reset, or the free part that stays.
    const wayOut = /swap|unfollow|pause|remove|delete|replace|wait|reset|resets|free|on free|stay/i;
    for (const id of ids) {
      if (ruleFor(id, "free").kind === "open") continue;
      expect(FEATURES[id].lock.body, id).toMatch(wayOut);
    }
  });
});

describe("redactLevels", () => {
  it("drops the sentence that carries a level and keeps the rest", () => {
    expect(redactLevels("Add. Rank: 12th percentile of 480 stocks. The add level is $182.40 (50-day average).")).toBe(
      "Add. Rank: 12th percentile of 480 stocks.",
    );
    expect(redactLevels("Hold here. The level to reduce into is $310.00 (52-week high).")).toBe("Hold here.");
    expect(redactLevels("Accumulate below 1,240.50 on pullbacks")).toBeNull();
  });

  it("leaves prose without levels alone", () => {
    expect(redactLevels("Revenue grew 22% and margins widened.")).toBe("Revenue grew 22% and margins widened.");
    expect(redactLevels("Shares closed at $180.20 after the report.")).toBe("Shares closed at $180.20 after the report.");
    expect(redactLevels("")).toBeNull();
    expect(redactLevels(null)).toBeNull();
  });

  it("walks objects and arrays without touching numbers", () => {
    const out = redactLevelsDeep({ a: ["Fine.", "Trim above $90.00."], n: 90, nested: { s: "Buy below $10.50. Watch the guide." } });
    expect(out).toEqual({ a: ["Fine.", ""], n: 90, nested: { s: "Watch the guide." } });
  });
});

describe("clipByAge", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const rows = [
    { id: 1, at: "2026-11-10T00:00:00Z" },
    { id: 2, at: "2026-11-04T00:00:00Z" },
    { id: 3, at: "2026-11-02T00:00:00Z" },
    { id: 4, at: "not a date" },
  ];

  it("keeps the last seven days on Free and counts the rest", () => {
    const out = clipByAge("signals_archive", "free", rows, (row) => row.at, now);
    expect(out.items.map((row) => row.id)).toEqual([1, 2, 4]);
    expect(out.hidden).toBe(1);
    expect(out.days).toBe(7);
  });

  it("keeps everything on Pro and on features without a depth rule", () => {
    expect(clipByAge("signals_archive", "pro", rows, (row) => row.at, now).hidden).toBe(0);
    expect(clipByAge("wire", "free", rows, (row) => row.at, now).items).toHaveLength(4);
  });
});


describe("redactOurLevels", () => {
  it("cuts our own level phrases and keeps analyst targets and news", () => {
    expect(redactOurLevels("Shares fell 5%. Check the add zone at $470. The price is 2.1% above it.")).toBe("Shares fell 5%. The price is 2.1% above it.");
    expect(redactOurLevels("Call: add below $182.40, trim above $260.")).toBe("");
    expect(redactOurLevels("Alert me below $150")).toBe("");
    expect(redactOurLevels("Analysts lifted their target to $250. The stock found support near $200.")).toBe(
      "Analysts lifted their target to $250. The stock found support near $200.",
    );
  });

  it("never returns an empty card when given a fallback", () => {
    expect(redactOurLevels("The add level is $182.40.", "Open TSLA for the news.")).toBe("Open TSLA for the news.");
    expect(redactOurLevels(null, "Open TSLA.")).toBe("Open TSLA.");
  });
});
