import { describe, expect, it } from "vitest";

import { blockStrings, linksIn } from "@/lib/docs/build";
import { cagr, drawdownRecovery, futureValue, positionSize, yearsBetween } from "@/lib/docs/calc";
import {
  GLOSSARY,
  GUIDES,
  SECTIONS,
  buildSearchIndex,
  getGuideByKey,
  guideKey,
  guidesIn,
  headingsOf,
  neighbours,
  readingMinutes,
} from "@/lib/docs";

describe("docs registry", () => {
  it("has a full course with unique addresses", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(35);
    expect(GUIDES.length).toBeLessThanOrEqual(48);
    const keys = GUIDES.map(guideKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const guide of GUIDES) expect(guide.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("puts at least one guide in every section and none outside them", () => {
    const ids = new Set(SECTIONS.map((section) => section.id));
    for (const section of SECTIONS) expect(guidesIn(section.id).length).toBeGreaterThan(0);
    for (const guide of GUIDES) expect(ids.has(guide.section)).toBe(true);
  });

  it("gives every guide a summary, a body and unique heading anchors", () => {
    for (const guide of GUIDES) {
      expect(guide.summary.length).toBeGreaterThan(40);
      expect(guide.blocks.length).toBeGreaterThan(3);
      expect(readingMinutes(guide)).toBeGreaterThanOrEqual(1);
      const ids = headingsOf(guide).map((heading) => heading.id);
      expect(new Set(ids).size, guideKey(guide)).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("only links to docs pages and anchors that exist", () => {
    for (const guide of GUIDES) {
      for (const key of guide.related ?? []) expect(getGuideByKey(key), `${guideKey(guide)} related ${key}`).not.toBeNull();
      const hrefs = guide.blocks.flatMap(blockStrings).flatMap(linksIn);
      for (const href of hrefs) {
        if (!href.startsWith("/docs")) continue;
        const [path, anchor] = href.split("#");
        const parts = path.split("/").filter(Boolean).slice(1);
        if (parts.length === 0 || parts[0] === "compare") continue;
        if (parts[0] === "glossary") {
          if (anchor) expect(GLOSSARY.some((term) => term.id === anchor), href).toBe(true);
          continue;
        }
        expect(parts.length, href).toBe(2);
        const target = getGuideByKey(parts.join("/"));
        expect(target, `${guideKey(guide)} links to ${href}`).not.toBeNull();
        if (anchor && target) expect(headingsOf(target).some((heading) => heading.id === anchor), href).toBe(true);
      }
    }
    for (const term of GLOSSARY) if (term.see) expect(getGuideByKey(term.see), term.term).not.toBeNull();
  });

  it("keeps the copy inside the house rules", () => {
    const banned = [/—/, /AI-powered/i, /actionable/i, /institutional-grade/i, /stay ahead/i, /cut through the noise/i];
    for (const guide of GUIDES) {
      const text = [guide.title, guide.summary, ...guide.blocks.flatMap(blockStrings)].join("\n");
      for (const pattern of banned) expect(pattern.test(text), `${guideKey(guide)} ${pattern}`).toBe(false);
    }
  });

  it("walks the course in order with previous and next", () => {
    expect(neighbours(GUIDES[0]).prev).toBeNull();
    expect(neighbours(GUIDES[GUIDES.length - 1]).next).toBeNull();
    expect(neighbours(GUIDES[1]).prev).toBe(GUIDES[0]);
  });

  it("indexes every guide and glossary term for search", () => {
    const index = buildSearchIndex();
    expect(index.length).toBe(GUIDES.length + GLOSSARY.length);
    expect(index.find((entry) => entry.href === "/docs/follow/what-a-13f-is")?.text).toContain("45 days");
    const ids = GLOSSARY.map((term) => term.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("docs calculators", () => {
  it("sizes a position from the risk budget and rounds shares down", () => {
    const result = positionSize({ account: 50_000, riskPct: 1, entry: 80, stop: 72, target: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shares).toBe(62);
    expect(result.positionValue).toBe(4960);
    expect(result.riskAtStop).toBe(496);
    expect(result.allocationPct).toBeCloseTo(9.92, 2);
    expect(result.rewardToRisk).toBeCloseTo(2.5, 6);
    expect(result.direction).toBe("long");
    expect(result.cappedByAllocation).toBe(false);
  });

  it("lets the allocation cap win and never spends more than the account", () => {
    const capped = positionSize({ account: 50_000, riskPct: 2, entry: 80, stop: 79, maxAllocationPct: 10 });
    expect(capped.ok && capped.shares).toBe(62);
    expect(capped.ok && capped.cappedByAllocation).toBe(true);
    const tight = positionSize({ account: 10_000, riskPct: 5, entry: 100, stop: 99.5 });
    expect(tight.ok && tight.shares).toBe(100);
    expect(tight.ok && tight.cappedByAllocation).toBe(true);
  });

  it("handles shorts, dollar risk and bad input", () => {
    const short = positionSize({ account: 20_000, riskDollars: 200, entry: 50, stop: 54, target: 40 });
    expect(short.ok && short.direction).toBe("short");
    expect(short.ok && short.shares).toBe(50);
    expect(short.ok && short.rewardToRisk).toBeCloseTo(2.5, 6);
    expect(positionSize({ account: 1000, riskPct: 1, entry: 50, stop: 50 }).ok).toBe(false);
    expect(positionSize({ account: 1000, riskPct: 0.1, entry: 500, stop: 400 }).ok).toBe(false);
    expect(positionSize({ account: 0, riskPct: 1, entry: 50, stop: 40 }).ok).toBe(false);
    const wrongSide = positionSize({ account: 20_000, riskPct: 1, entry: 50, stop: 45, target: 48 });
    expect(wrongSide.ok && wrongSide.targetOnWrongSide).toBe(true);
    expect(wrongSide.ok && wrongSide.rewardToRisk).toBeNull();
  });

  it("computes CAGR the way the guides say", () => {
    const result = cagr(10_000, 18_000, 5);
    expect(result.ok && result.cagr).toBeCloseTo(0.12475, 4);
    expect(result.ok && result.totalReturn).toBeCloseTo(0.8, 9);
    const loss = cagr(100, 75, 2);
    expect(loss.ok && loss.cagr).toBeCloseTo(-0.13397, 4);
    expect(cagr(0, 10, 1).ok).toBe(false);
    expect(cagr(10, 20, 0).ok).toBe(false);
    expect(futureValue(100, 0.1, 2)).toBeCloseTo(121, 9);
    expect(yearsBetween("2020-01-01", "2025-01-01")).toBeCloseTo(5.0021, 3);
    expect(yearsBetween("2025-01-01", "2020-01-01")).toBeNull();
  });

  it("computes the gain a drawdown needs", () => {
    const half = drawdownRecovery(50, 8);
    expect(half.ok && half.gainNeeded).toBeCloseTo(1, 9);
    expect(half.ok && half.yearsToRecover).toBeCloseTo(9.006, 2);
    const fifth = drawdownRecovery(20);
    expect(fifth.ok && fifth.gainNeeded).toBeCloseTo(0.25, 9);
    expect(fifth.ok && fifth.yearsToRecover).toBeNull();
    expect(drawdownRecovery(100).ok).toBe(false);
    expect(drawdownRecovery(0).ok).toBe(false);
  });
});
