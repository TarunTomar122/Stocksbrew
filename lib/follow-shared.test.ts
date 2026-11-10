import { describe, expect, it } from "vitest";

import {
  MAX_FOLLOWED,
  activitySize,
  chartGeometry,
  chartY,
  daysBetween,
  excess,
  fmtBracket,
  fmtDate,
  fmtFiledAt,
  fmtFrac,
  fmtPoints,
  fmtShares,
  fmtUsd,
  fmtWeight,
  isValidSourceSlug,
  normalizeFollowed,
  quarterLabel,
  sortSources,
  sparkPath,
  stockHref,
  toggleFollowed,
  type FollowSource,
  type PerfCard,
  type PerfStats,
} from "@/lib/follow-shared";

function stats(overrides: Partial<PerfStats> = {}): PerfStats {
  return {
    r_1m: null,
    r_3m: null,
    r_ytd: null,
    r_1y: null,
    r_since: null,
    annualized: null,
    max_drawdown: null,
    ...overrides,
  };
}

function card(
  fund: Partial<PerfStats>,
  spy: Partial<PerfStats> = {},
): PerfCard {
  return {
    start_date: "2013-08-15",
    end_date: "2026-11-09",
    ended: false,
    fund: stats(fund),
    spy: stats(spy),
    covered_weight_latest: 0.96,
    covered_weight_avg: 0.95,
  };
}

function source(
  slug: string,
  name: string,
  performance: PerfCard | null,
  latest = "2026-08-14",
): FollowSource {
  return {
    id: slug,
    slug,
    kind: "fund",
    name,
    person: "",
    style: "",
    active: true,
    latest_date: latest,
    headline: "",
    top_holdings: [],
    performance,
    source: "",
    source_url: "",
    updated_at: "",
  };
}

describe("formatting", () => {
  it("writes fractions as signed percents and leaves missing values empty", () => {
    expect(fmtFrac(0.1234)).toBe("+12.3%");
    expect(fmtFrac(-0.0549)).toBe("−5.5%");
    expect(fmtFrac(0)).toBe("0.0%");
    expect(fmtFrac(-0.0001)).toBe("0.0%");
    expect(fmtFrac(14.7)).toBe("+1,470%");
    expect(fmtFrac(-0.394, 1, false)).toBe("−39.4%");
    expect(fmtFrac(0.394, 1, false)).toBe("39.4%");
    expect(fmtFrac(null)).toBe("");
    expect(fmtFrac(Number.NaN)).toBe("");
  });

  it("writes the gap to the index in points", () => {
    expect(fmtPoints(0.031)).toBe("+3.1");
    expect(fmtPoints(-1.352)).toBe("−135.2");
    expect(fmtPoints(undefined)).toBe("");
  });

  it("shortens dollars, shares, weights and brackets", () => {
    expect(fmtUsd(65_950_296_923)).toBe("$66.0B");
    expect(fmtUsd(1_190_000_000)).toBe("$1.19B");
    expect(fmtUsd(299_300_000_000)).toBe("$299.3B");
    expect(fmtUsd(580_504)).toBe("$581K");
    expect(fmtUsd(8_000.5)).toBe("$8.0K");
    expect(fmtUsd(999_990)).toBe("$1.0M");
    expect(fmtUsd(999_960_000)).toBe("$1.00B");
    expect(fmtUsd(99_990)).toBe("$100K");
    expect(fmtUsd(null)).toBe("");
    expect(fmtShares(227_917_808)).toBe("227.9M");
    expect(fmtShares(3_564)).toBe("3,564");
    expect(fmtWeight(0.2204)).toBe("22.0%");
    expect(fmtWeight(0.000002)).toBe("<0.1%");
    expect(fmtWeight(null)).toBe("");
    expect(fmtBracket(1001, 15000)).toBe("$1K to $15K");
    expect(fmtBracket(50_000_000, null)).toBe("over $50M");
    expect(fmtBracket(null, null)).toBe("");
  });

  it("formats dates without a timezone shifting the day", () => {
    expect(fmtDate("2026-08-14")).toBe("Aug 14, 2026");
    expect(fmtDate("2026-01-01T00:30:00+00:00", false)).toBe("Jan 1");
    expect(fmtDate("")).toBe("");
    expect(fmtFiledAt("2026-11-06T16:32:10")).toBe("Nov 6, 4:32 PM ET");
    expect(fmtFiledAt("2026-11-06T00:05:00")).toBe("Nov 6, 12:05 AM ET");
    expect(fmtFiledAt("2026-11-06")).toBe("Nov 6");
    expect(quarterLabel("2026-06-30")).toBe("Q2 2026");
    expect(quarterLabel("2025-12-31")).toBe("Q4 2025");
    expect(daysBetween("2026-06-30", "2026-08-14")).toBe(45);
    expect(daysBetween("", "2026-08-14")).toBeNull();
  });

  it("builds stock links that survive share classes", () => {
    expect(stockHref("brk.b")).toBe("/stock/BRK.B");
  });

  it("says how big a move was", () => {
    expect(
      activitySize({ action: "new", ticker: "DHI", name: null, weight: 0.061 }),
    ).toBe("6.1% of the book");
    expect(
      activitySize({
        action: "sold",
        ticker: "STZ",
        name: null,
        prev_weight: 0.0004,
      }),
    ).toBe("was <0.1%");
    expect(
      activitySize({
        action: "added",
        ticker: "GOOGL",
        name: null,
        shares_delta_pct: 45.24,
      }),
    ).toBe("+45.2% shares");
    expect(
      activitySize({
        action: "reduced",
        ticker: "BAC",
        name: null,
        shares_delta_pct: -5.89,
      }),
    ).toBe("−5.9% shares");
    expect(
      activitySize({
        action: "buy",
        ticker: "NVDA",
        name: null,
        amount_low: 1001,
        amount_high: 15000,
      }),
    ).toBe("$1K to $15K");
    expect(activitySize({ action: "held", ticker: "X", name: null })).toBe("");
  });
});

describe("records", () => {
  it("measures a window against the index, and not at all when either side is missing", () => {
    expect(excess(card({ r_1y: 0.136 }, { r_1y: 0.137 }), "r_1y")).toBeCloseTo(
      -0.001,
    );
    expect(excess(card({ r_1y: 0.136 }), "r_1y")).toBeNull();
    expect(excess(null, "r_1y")).toBeNull();
  });

  it("sorts followed sources first and sinks sources without a value either way", () => {
    const list = [
      source("a", "Alpha", card({ r_1y: 0.1 })),
      source("b", "Beta", null),
      source("c", "Gamma", card({ r_1y: 0.4 })),
      source("d", "Delta", card({ r_1y: -0.2 })),
    ];
    expect(sortSources(list, "r_1y", "desc").map((item) => item.slug)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
    expect(sortSources(list, "r_1y", "asc").map((item) => item.slug)).toEqual([
      "d",
      "a",
      "c",
      "b",
    ]);
    expect(
      sortSources(list, "r_1y", "desc", new Set(["b", "d"])).map(
        (item) => item.slug,
      ),
    ).toEqual(["d", "b", "c", "a"]);
    expect(sortSources(list, "name", "asc").map((item) => item.slug)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
    expect(list.map((item) => item.slug)).toEqual(["a", "b", "c", "d"]); // the input is left alone
  });

  it("draws both lines in one log-scaled box", () => {
    const curve: [string, number, number][] = [
      ["2024-12-30", 1, 1],
      ["2025-06-30", 2, 1.2],
      ["2026-06-30", 4, 1.5],
    ];
    const geometry = chartGeometry(curve);
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    expect(geometry.fund.startsWith("M0.0,")).toBe(true);
    expect(geometry.fund.split("L")).toHaveLength(3);
    expect(geometry.years.map((year) => year.label)).toEqual(["2025", "2026"]);
    expect(geometry.ticks.some((tick) => tick.label === "0%")).toBe(true);
    // Log scale: doubling twice moves the line the same distance each time.
    const step1 = chartY(geometry, 1) - chartY(geometry, 2);
    const step2 = chartY(geometry, 2) - chartY(geometry, 4);
    expect(step1).toBeCloseTo(step2);
    expect(chartY(geometry, 4)).toBeGreaterThan(0);
    expect(chartY(geometry, 1)).toBeLessThan(1);
    expect(chartGeometry([["2026-01-01", 1, 1]])).toBeNull();
  });

  it("draws a sparkline inside its box", () => {
    expect(sparkPath([1, 2, 3], 60, 20)).toBe("M0.0,20.0L30.0,10.0L60.0,0.0");
    expect(sparkPath([1], 60, 20)).toBe("");
    expect(sparkPath(undefined, 60, 20)).toBe("");
  });
});

describe("followed sources", () => {
  it("accepts directory slugs only", () => {
    expect(isValidSourceSlug("berkshire-hathaway")).toBe(true);
    expect(isValidSourceSlug("Berkshire")).toBe(false);
    expect(isValidSourceSlug("../users")).toBe(false);
    expect(isValidSourceSlug("")).toBe(false);
    expect(isValidSourceSlug(42)).toBe(false);
  });

  it("cleans whatever is stored on the user doc", () => {
    expect(
      normalizeFollowed(["scion", "scion", "BAD SLUG", 7, "nancy-pelosi"]),
    ).toEqual(["scion", "nancy-pelosi"]);
    expect(normalizeFollowed("scion")).toEqual([]);
    expect(normalizeFollowed(undefined)).toEqual([]);
    const many = Array.from(
      { length: MAX_FOLLOWED + 20 },
      (_, index) => `fund-${index}`,
    );
    expect(normalizeFollowed(many)).toHaveLength(MAX_FOLLOWED);
  });

  it("follows at the front and unfollows without touching the rest", () => {
    expect(toggleFollowed(["a", "b"], "c", true)).toEqual(["c", "a", "b"]);
    expect(toggleFollowed(["a", "b"], "a", true)).toEqual(["a", "b"]);
    expect(toggleFollowed(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleFollowed(undefined, "a", false)).toEqual([]);
    expect(toggleFollowed(["a"], "Not A Slug", true)).toEqual(["a"]);
  });
});
