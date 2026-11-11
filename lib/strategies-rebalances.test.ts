import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { dayBefore, isRebalance, newestFirst, recentForFollowed, type StrategyRebalance } from "@/lib/strategies-rebalances";

function record(slug: string, date: string, extra: Partial<StrategyRebalance> = {}): StrategyRebalance {
  return {
    slug,
    name: slug,
    kind: "stocks",
    date,
    signal_date: date,
    trade_date: date,
    previous_as_of: null,
    headline: "2 stocks came in, 2 left and 23 stayed.",
    why: "",
    rule: "",
    added: [],
    removed: [],
    kept: [],
    reweighted: 0,
    held: 25,
    previously_held: 25,
    cash_weight: 0,
    previous_cash_weight: 0,
    market_ok: true,
    source: "",
    generated_at: "",
    ...extra,
  };
}

describe("strategy rebalances", () => {
  it("accepts only well-formed records", () => {
    expect(isRebalance(record("a", "2026-11-02"))).toBe(true);
    expect(isRebalance({ ...record("a", "2026-11-02"), date: "Nov 2" })).toBe(false);
    expect(isRebalance({ slug: "a" })).toBe(false);
    expect(isRebalance(null)).toBe(false);
  });

  it("sorts newest first and keeps one per strategy and day", () => {
    const out = newestFirst([record("a", "2026-10-01"), record("a", "2026-11-02"), record("a", "2026-11-02")]);
    expect(out.map((item) => item.date)).toEqual(["2026-11-02", "2026-10-01"]);
  });

  it("keeps the latest recent rebalance of each followed strategy only", () => {
    const items = [record("a", "2026-11-02"), record("a", "2026-10-01"), record("b", "2026-11-02"), record("c", "2026-10-30")];
    const out = recentForFollowed(items, ["a", "c"], "2026-10-31");
    expect(out.map((item) => `${item.slug}:${item.date}`)).toEqual(["a:2026-11-02"]);
    expect(recentForFollowed(items, [], "2026-10-01")).toEqual([]);
  });

  it("counts days back across a month end", () => {
    expect(dayBefore("2026-12-03", 5)).toBe("2026-11-28");
    expect(dayBefore("2026-03-01", 1)).toBe("2026-02-28");
  });
});
