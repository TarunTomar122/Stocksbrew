import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WEEK_MS,
  coverageAfterTrackChange,
  coverageState,
  effectiveCovered,
  fillsUsed,
  planCoverage,
  type CoverageDoc,
} from "./entitlements-coverage";

const NOW = new Date("2026-11-10T12:00:00Z");
const ids = (n: number, prefix = "US_T") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** Apply a successful change to a doc, the way the API route merges it. */
function apply(doc: CoverageDoc, isPro: boolean, requested: string[], now = NOW): CoverageDoc {
  const change = planCoverage(doc, isPro, requested, now);
  if (!change.ok) throw new Error(`${change.code}: ${change.message}`);
  return { ...doc, ...change.write };
}

describe("effectiveCovered", () => {
  it("covers everything tracked on Pro", () => {
    expect(effectiveCovered({ tracked_stocks: ids(12) }, true)).toEqual(ids(12));
  });

  it("covers the first five tracked before any choice on Free", () => {
    expect(effectiveCovered({ tracked_stocks: ids(8) }, false)).toEqual(ids(5));
    expect(effectiveCovered({ tracked_stocks: ids(2) }, false)).toEqual(ids(2));
    expect(effectiveCovered(null, false)).toEqual([]);
  });

  it("keeps an explicit choice, only for stocks still tracked, at most five", () => {
    const doc = { tracked_stocks: ["US_A", "US_B", "US_C"], covered_stocks: ["US_C", "US_GONE", "US_A"] };
    expect(effectiveCovered(doc, false)).toEqual(["US_C", "US_A"]);
    expect(effectiveCovered({ tracked_stocks: ids(9), covered_stocks: ids(9) }, false)).toHaveLength(5);
    // An explicit empty choice means nothing is covered, not "fall back to the default".
    expect(effectiveCovered({ tracked_stocks: ids(3), covered_stocks: [] }, false)).toEqual([]);
  });

  it("ignores junk in the stored fields", () => {
    expect(effectiveCovered({ tracked_stocks: ["US_A", 4, null, "US_A"], covered_stocks: "US_A" }, false)).toEqual(["US_A"]);
  });
});

describe("planCoverage on Free", () => {
  it("fills five slots on day one without using the swap", () => {
    const doc: CoverageDoc = { tracked_stocks: ids(8), covered_stocks: [] , covered_fills_used: 0 };
    const change = planCoverage(doc, false, ids(5), NOW);
    expect(change.ok).toBe(true);
    if (!change.ok) return;
    expect(change.write.covered_fills_used).toBe(5);
    expect(change.write.covered_adds_log.map((entry) => entry.kind)).toEqual(["fill", "fill", "fill", "fill", "fill"]);
    expect(coverageState({ ...doc, ...change.write }, false, NOW).swapAvailable).toBe(true);
  });

  it("refuses a sixth covered stock and says how to make room", () => {
    const doc = apply({ tracked_stocks: ids(8), covered_stocks: [], covered_fills_used: 0 }, false, ids(5));
    const change = planCoverage(doc, false, ids(6), NOW);
    expect(change.ok).toBe(false);
    if (change.ok) return;
    expect(change.code).toBe("over_limit");
    expect(change.message).toMatch(/Uncover one/);
  });

  it("allows one swap a week and names the day the next one opens", () => {
    let doc = apply({ tracked_stocks: ids(8), covered_stocks: [], covered_fills_used: 0 }, false, ids(5), new Date(daysAgo(30)));
    // Uncovering is free and immediate.
    doc = apply(doc, false, ids(4));
    expect(effectiveCovered(doc, false)).toEqual(ids(4));
    // The first new stock after the five picks is the week's swap.
    doc = apply(doc, false, [...ids(4), "US_T5"]);
    expect(coverageState(doc, false, NOW)).toMatchObject({ swapAvailable: false, fillsLeft: 0 });
    expect(coverageState(doc, false, NOW).nextSwapAt).toBe(new Date(NOW.getTime() + WEEK_MS).toISOString());
    // A second swap the same week is refused, and nothing changes.
    const blocked = planCoverage({ ...doc, covered_stocks: ids(4) }, false, [...ids(4), "US_T6"], NOW);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("swap_used");
    expect(blocked.nextAt).toBe(new Date(NOW.getTime() + WEEK_MS).toISOString());
    expect(blocked.message).toMatch(/next swap opens/);
    // A week later it opens again.
    const later = new Date(NOW.getTime() + WEEK_MS + 1000);
    expect(planCoverage({ ...doc, covered_stocks: ids(4) }, false, [...ids(4), "US_T6"], later).ok).toBe(true);
  });

  it("lets a stock covered this week come back without spending the swap", () => {
    let doc = apply({ tracked_stocks: ids(8), covered_stocks: [], covered_fills_used: 0 }, false, ids(5));
    doc = apply(doc, false, ids(4)); // uncover US_T4
    const back = planCoverage(doc, false, ids(5), NOW);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    // Not logged again, so its week still runs from the first cover.
    expect(back.write.covered_adds_log).toHaveLength(5);
    expect(coverageState({ ...doc, ...back.write }, false, NOW).swapAvailable).toBe(true);
  });

  it("refuses to cover a stock that is not tracked", () => {
    const change = planCoverage({ tracked_stocks: ["US_A"] }, false, ["US_A", "US_B"], NOW);
    expect(change.ok).toBe(false);
    if (change.ok) return;
    expect(change.code).toBe("not_tracked");
  });

  it("counts the default covered stocks of an older account as used picks", () => {
    const legacy: CoverageDoc = { tracked_stocks: ids(7) };
    expect(fillsUsed(legacy)).toBe(5);
    // Re-saving the default changes nothing and spends nothing.
    const same = planCoverage(legacy, false, ids(5), NOW);
    expect(same.ok && same.added).toEqual([]);
    // Swapping one of them for a sixth tracked stock is the week's swap.
    const swap = planCoverage(legacy, false, [...ids(4), "US_T6"], NOW);
    expect(swap.ok).toBe(true);
    if (!swap.ok) return;
    expect(swap.write.covered_adds_log.map((entry) => entry.kind)).toEqual(["swap"]);
  });

  it("drops malformed and week-old log entries", () => {
    const doc: CoverageDoc = {
      tracked_stocks: ids(6),
      covered_stocks: ids(5),
      covered_fills_used: 5,
      covered_adds_log: [{ id: "US_T0", at: daysAgo(8), kind: "swap" }, { id: 3 }, "junk", { id: "US_T1", at: "never", kind: "swap" }],
    };
    expect(coverageState(doc, false, NOW).swapAvailable).toBe(true);
  });
});

describe("planCoverage on Pro", () => {
  it("stores any choice without a limit or a swap", () => {
    const change = planCoverage({ tracked_stocks: ids(20) }, true, ids(20), NOW);
    expect(change.ok).toBe(true);
    expect(coverageState({ tracked_stocks: ids(20) }, true, NOW)).toMatchObject({ swapAvailable: true, nextSwapAt: null });
  });
});

describe("coverageAfterTrackChange", () => {
  it("covers new stocks while picks last, then tracks the rest uncovered", () => {
    const doc: CoverageDoc = { tracked_stocks: ids(3), covered_stocks: ids(3), covered_fills_used: 3 };
    const write = coverageAfterTrackChange(doc, false, ids(9), NOW);
    expect(write?.covered_stocks).toEqual(ids(5));
    expect(write?.covered_fills_used).toBe(5);
    expect(write?.covered_adds_log.every((entry) => entry.kind === "fill")).toBe(true);
  });

  it("never spends the weekly swap", () => {
    const doc: CoverageDoc = { tracked_stocks: ids(5), covered_stocks: ids(4), covered_fills_used: 5 };
    const write = coverageAfterTrackChange(doc, false, [...ids(5), "US_NEW"], NOW);
    expect(write?.covered_stocks).toEqual(ids(4));
    expect(write?.covered_adds_log.some((entry) => entry.kind === "swap")).toBe(false);
  });

  it("frees the slot of a stock that stops being tracked", () => {
    const doc: CoverageDoc = { tracked_stocks: ids(5), covered_stocks: ids(5), covered_fills_used: 5 };
    expect(coverageAfterTrackChange(doc, false, ids(4), NOW)?.covered_stocks).toEqual(ids(4));
  });

  it("pins down an older account's default so track and untrack cannot rotate coverage", () => {
    // Before: the first five of seven tracked are covered by default.
    const legacy: CoverageDoc = { tracked_stocks: ids(7) };
    const write = coverageAfterTrackChange(legacy, false, ids(7).slice(1), NOW);
    // Untracking US_T0 does not slide US_T5 into coverage.
    expect(write?.covered_stocks).toEqual(["US_T1", "US_T2", "US_T3", "US_T4"]);
    expect(write?.covered_fills_used).toBe(5);
  });

  it("does nothing on Pro", () => {
    expect(coverageAfterTrackChange({ tracked_stocks: ids(3) }, true, ids(30), NOW)).toBeNull();
  });
});

describe("picks made before the Free limit shrank", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("can each be picked back once, without a fill or the weekly swap", () => {
    // A lapsed Pro that had chosen seven: Free keeps the first five, the other two stay pickable.
    let doc: CoverageDoc = { tracked_stocks: ids(8), covered_stocks: ids(7), covered_fills_used: 5 };
    expect(coverageState(doc, false, NOW).held).toEqual(["US_T5", "US_T6"]);
    doc = apply(doc, false, ids(5).filter((id) => id !== "US_T0"));
    expect(coverageState(doc, false, NOW).held).toEqual(["US_T5", "US_T6"]);
    doc = apply(doc, false, [...ids(5).filter((id) => id !== "US_T0"), "US_T5"]);
    expect(doc.covered_adds_log).toEqual([]);
    expect(coverageState(doc, false, NOW).held).toEqual(["US_T6"]);
    expect(coverageState(doc, false, NOW).swapAvailable).toBe(true);
  });

  it("on the tighter line, a Free account with five keeps three and can choose any of its five", async () => {
    vi.stubEnv("PAYWALL_V2", "1");
    vi.resetModules();
    const cov = await import("./entitlements-coverage");
    const doc: CoverageDoc = { tracked_stocks: ids(6), covered_stocks: ids(5), covered_fills_used: 5 };
    const state = cov.coverageState(doc, false, NOW);
    expect(state.covered).toEqual(ids(3));
    expect(state.held).toEqual(["US_T3", "US_T4"]);
    const dropped = cov.planCoverage(doc, false, ["US_T1", "US_T2"], NOW);
    if (!dropped.ok) throw new Error(dropped.message);
    const after = { ...doc, ...dropped.write };
    const picked = cov.planCoverage(after, false, ["US_T1", "US_T2", "US_T4"], NOW);
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.write.covered_adds_log).toEqual([]);
  });
});
