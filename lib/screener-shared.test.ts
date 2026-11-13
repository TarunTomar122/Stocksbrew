import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  NUMERIC_FIELDS,
  PRESETS,
  ALL_COLUMN_IDS,
  applyFilters,
  availablePresets,
  canonicalSectorSlug,
  countActiveFilters,
  describeRange,
  FIELD_BY_ID,
  formatField,
  formatRange,
  hasCallFilters,
  parseFilters,
  parseRange,
  parseView,
  presetForLegacyScreen,
  sectorSlug,
  sectorStats,
  sortHref,
  sortRows,
  squarify,
  viewHref,
  viewToQuery,
  withoutZones,
  type ScreenerFilters,
  type ScreenerRow,
  type ScreenerView,
} from "./screener-shared";

const ROWS: ScreenerRow[] = [
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors", cap_tier: "mega", market_cap: 4.6e12, pe: 29, rev_growth: 83, day_pct: -5, ret_1m: -19, call: "Hold", zone: "add", to_add_pct: -0.2 },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer Staples", cap_tier: "mega", market_cap: 3e11, pe: 24, rev_growth: 3, day_pct: 0.4, ret_1m: 2, div_yield: 2.9, call: "Hold", zone: "between" },
  { symbol: "SMALL", name: "Small Biotech", sector: "Health Care", cap_tier: "small", market_cap: 9e8, rev_growth: 40, day_pct: 3 },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy", cap_tier: "mega", market_cap: 5e11, pe: 14, rev_growth: -4, day_pct: 1, ret_1m: 6, div_yield: 3.4, call: "Add", zone: "between" },
  { symbol: "NOPE", name: "No Data Inc" },
];

function filters(patch: Partial<ScreenerFilters>): ScreenerFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

function symbols(rows: ScreenerRow[]): string[] {
  return rows.map((row) => row.symbol);
}

describe("filter engine", () => {
  it("passes everything when nothing is set", () => {
    expect(applyFilters(ROWS, EMPTY_FILTERS)).toHaveLength(ROWS.length);
  });

  it("filters by sector slug, cap tier, call and zone", () => {
    expect(symbols(applyFilters(ROWS, filters({ sectors: ["consumer-staples", "energy"] })))).toEqual(["KO", "XOM"]);
    expect(symbols(applyFilters(ROWS, filters({ caps: ["small"] })))).toEqual(["SMALL"]);
    expect(symbols(applyFilters(ROWS, filters({ calls: ["Add"] })))).toEqual(["XOM"]);
    expect(symbols(applyFilters(ROWS, filters({ zones: ["add"] })))).toEqual(["NVDA"]);
  });

  it("treats range bounds as inclusive", () => {
    expect(symbols(applyFilters(ROWS, filters({ ranges: { pe: { min: 14, max: 24 } } })))).toEqual(["KO", "XOM"]);
    expect(symbols(applyFilters(ROWS, filters({ ranges: { rev_growth: { min: 40 } } })))).toEqual(["NVDA", "SMALL"]);
    expect(symbols(applyFilters(ROWS, filters({ ranges: { rev_growth: { max: 0 } } })))).toEqual(["XOM"]);
  });

  it("drops rows that do not have the field: unknown never counts as a match", () => {
    // SMALL and NOPE have no P/E. A "P/E under 1000" screen must not include them.
    expect(symbols(applyFilters(ROWS, filters({ ranges: { pe: { max: 1000 } } })))).toEqual(["NVDA", "KO", "XOM"]);
    expect(symbols(applyFilters(ROWS, filters({ caps: ["mega", "large", "mid", "small", "micro"] })))).not.toContain("NOPE");
  });

  it("combines criteria with AND", () => {
    const result = applyFilters(ROWS, filters({ caps: ["mega"], ranges: { div_yield: { min: 2 }, pe: { max: 20 } } }));
    expect(symbols(result)).toEqual(["XOM"]);
  });

  it("searches ticker, name and industry, every word required", () => {
    expect(symbols(applyFilters(ROWS, filters({ q: "nvda" })))).toEqual(["NVDA"]);
    expect(symbols(applyFilters(ROWS, filters({ q: "exxon" })))).toEqual(["XOM"]);
    expect(symbols(applyFilters(ROWS, filters({ q: "semiconductors" })))).toEqual(["NVDA"]);
    expect(symbols(applyFilters(ROWS, filters({ q: "small biotech" })))).toEqual(["SMALL"]);
    expect(applyFilters(ROWS, filters({ q: "small exxon" }))).toEqual([]);
    expect(symbols(applyFilters(ROWS, filters({ q: "  KO " })))).toEqual(["KO"]);
  });

  it("knows which screens use our call", () => {
    expect(hasCallFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasCallFilters(filters({ ranges: { pe: { max: 20 } } }))).toBe(false);
    expect(hasCallFilters(filters({ calls: ["Add"] }))).toBe(true);
    expect(hasCallFilters(filters({ zones: ["add"] }))).toBe(true);
    expect(hasCallFilters(filters({ ranges: { to_add_pct: { max: 0 } } }))).toBe(true);
  });

  it("strips the zones and keeps the call and everything else", () => {
    const stripped = withoutZones(ROWS[0]!);
    expect(stripped.zone).toBeUndefined();
    expect(stripped.to_add_pct).toBeUndefined();
    expect(stripped.add_below).toBeUndefined();
    expect(stripped.call).toBe("Hold");
    expect(stripped.pe).toBe(29);
    expect(ROWS[0]!.zone).toBe("add");
    expect(applyFilters([stripped], filters({ zones: ["add"] }))).toEqual([]);
  });
});

describe("sorting", () => {
  it("sorts numbers both ways and keeps unknowns last either way", () => {
    expect(symbols(sortRows(ROWS, { id: "pe", dir: "asc" }))).toEqual(["XOM", "KO", "NVDA", "SMALL", "NOPE"]);
    expect(symbols(sortRows(ROWS, { id: "pe", dir: "desc" }))).toEqual(["NVDA", "KO", "XOM", "SMALL", "NOPE"]);
  });

  it("sorts text and the call in a meaningful order", () => {
    expect(symbols(sortRows(ROWS, { id: "symbol", dir: "asc" }))).toEqual(["KO", "NOPE", "NVDA", "SMALL", "XOM"]);
    expect(symbols(sortRows(ROWS, { id: "call", dir: "asc" })).slice(0, 3)).toEqual(["XOM", "NVDA", "KO"]);
  });

  it("is stable for ties and does not mutate its input", () => {
    const before = symbols(ROWS);
    expect(symbols(sortRows(ROWS, { id: "cap_tier" as string, dir: "asc" }))).toHaveLength(5);
    expect(symbols(ROWS)).toEqual(before);
  });
});

describe("URL format", () => {
  it("parses ranges in every shape", () => {
    expect(parseRange("10..25")).toEqual({ min: 10, max: 25 });
    expect(parseRange("..15")).toEqual({ max: 15 });
    expect(parseRange("20..")).toEqual({ min: 20 });
    expect(parseRange("-5..5")).toEqual({ min: -5, max: 5 });
    expect(parseRange("1.5..")).toEqual({ min: 1.5 });
    expect(parseRange("5")).toEqual({ min: 5 });
    expect(parseRange("25..10")).toEqual({ min: 10, max: 25 });
    expect(parseRange("")).toBeNull();
    expect(parseRange("..")).toBeNull();
    expect(parseRange("abc..3")).toBeNull();
    expect(parseRange("1..2..3")).toBeNull();
  });

  it("formats ranges back to the same text", () => {
    for (const text of ["10..25", "..15", "20..", "-5..5", "1.5.."]) {
      expect(formatRange(parseRange(text)!)).toBe(text);
    }
  });

  it("reads filters from a query and ignores junk", () => {
    const parsed = parseFilters({
      q: "  chips ",
      sector: "Technology,health-care,healthcare",
      cap: "mega,LARGE,giant",
      call: "add,Trim,buy",
      zone: "add,nowhere",
      pe: "..25",
      rev_growth: "10..",
      bogus: "1..2",
      roe: "not-a-range",
    });
    expect(parsed.q).toBe("chips");
    expect(parsed.sectors).toEqual(["technology", "health-care"]);
    expect(parsed.caps).toEqual(["mega", "large"]);
    expect(parsed.calls).toEqual(["Add", "Trim"]);
    expect(parsed.zones).toEqual(["add"]);
    expect(parsed.ranges).toEqual({ pe: { max: 25 }, rev_growth: { min: 10 } });
  });

  it("round-trips a full view through the query string", () => {
    const view: ScreenerView = {
      tab: "screen",
      period: "day_pct",
      preset: null,
      filters: {
        q: "bank & trust",
        sectors: ["financials", "real-estate"],
        caps: ["large", "mid"],
        calls: ["Add", "Hold"],
        zones: ["add"],
        ranges: { pe: { max: 18 }, div_yield: { min: 1.5, max: 6 }, ret_1y: { min: -10 } },
      },
      sort: { id: "div_yield", dir: "asc" },
      columns: ["price", "div_yield", "pe", "call"],
    };
    const query = viewToQuery(view);
    expect(parseView(new URLSearchParams(query))).toEqual(view);
  });

  it("writes nothing for the default view and keeps links short", () => {
    const view = parseView({});
    expect(view.filters).toEqual(EMPTY_FILTERS);
    expect(view.sort).toEqual(DEFAULT_SORT);
    expect(view.columns).toEqual(DEFAULT_COLUMNS);
    expect(viewToQuery(view)).toBe("");
    expect(viewHref(view)).toBe("/screener");
  });

  it("gives equal screens equal links whatever order the params came in", () => {
    const a = parseView({ pe: "..20", sector: "energy", rev_growth: "5.." });
    const b = parseView({ rev_growth: "5..", pe: "..20", sector: "energy" });
    expect(viewToQuery(a)).toBe(viewToQuery(b));
    expect(viewToQuery(a)).toBe("sector=energy&pe=..20&rev_growth=5..");
  });

  it("loads a preset by slug and keeps the link as the slug", () => {
    const preset = PRESETS[0]!;
    const view = parseView({ preset: preset.slug });
    expect(view.preset).toBe(preset.slug);
    expect(view.filters.ranges).toEqual(preset.filters.ranges);
    expect(view.sort).toEqual(preset.sort);
    expect(view.columns).toEqual(preset.columns);
    expect(viewToQuery(view)).toBe(`preset=${preset.slug}`);
  });

  it("lets explicit filters win over a preset and drops unknown presets", () => {
    const edited = parseView({ preset: PRESETS[0]!.slug, pe: "..12" });
    expect(edited.preset).toBeNull();
    expect(edited.filters.ranges).toEqual({ pe: { max: 12 } });
    expect(parseView({ preset: "does-not-exist" }).preset).toBeNull();
  });

  it("keeps a custom sort or column set on top of a preset", () => {
    const preset = PRESETS[0]!;
    const view = parseView({ preset: preset.slug, sort: "ret_1y.desc", cols: "price,pe" });
    expect(view.sort).toEqual({ id: "ret_1y", dir: "desc" });
    expect(view.columns).toEqual(["price", "pe"]);
    expect(parseView(new URLSearchParams(viewToQuery(view)))).toEqual(view);
  });

  it("rejects unknown sort ids and column ids", () => {
    expect(parseView({ sort: "password.desc" }).sort).toEqual(DEFAULT_SORT);
    expect(parseView({ cols: "nope,also_nope" }).columns).toEqual(DEFAULT_COLUMNS);
    expect(parseView({ cols: "pe,nope,pe,price" }).columns).toEqual(["pe", "price"]);
  });

  it("carries the sectors tab and its period", () => {
    const view = parseView({ tab: "sectors", period: "ret_1m" });
    expect(view.tab).toBe("sectors");
    expect(view.period).toBe("ret_1m");
    expect(viewToQuery(view)).toBe("tab=sectors&period=ret_1m");
    expect(parseView({ tab: "nonsense", period: "ret_10y" })).toMatchObject({ tab: "screen", period: "day_pct" });
  });

  it("toggles the sort direction on the active column", () => {
    const view = parseView({});
    expect(sortHref(view, "market_cap", true)).toBe("/screener?sort=market_cap.asc");
    expect(sortHref(view, "pe", true)).toBe("/screener?sort=pe.desc");
    expect(sortHref(view, "symbol", false)).toBe("/screener?sort=symbol.asc");
  });

  it("maps old sector ids onto today's sectors", () => {
    expect(canonicalSectorSlug("Big Tech")).toBe("technology");
    expect(canonicalSectorSlug("healthcare")).toBe("health-care");
    expect(canonicalSectorSlug("financial-services")).toBe("financials");
    expect(canonicalSectorSlug("Energy")).toBe("energy");
    expect(sectorSlug("Consumer Discretionary")).toBe("consumer-discretionary");
  });

  it("counts active filters", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(filters({ q: "x", sectors: ["energy", "materials"], ranges: { pe: { max: 3 }, roe: { min: 1 } } }))).toBe(4);
  });
});

describe("presets and catalogue", () => {
  it("only references real fields, columns and sortable ids", () => {
    const columns = new Set(ALL_COLUMN_IDS);
    for (const preset of PRESETS) {
      for (const id of Object.keys(preset.filters.ranges ?? {})) expect(FIELD_BY_ID.has(id), `${preset.slug}: ${id}`).toBe(true);
      for (const id of preset.columns) expect(columns.has(id), `${preset.slug}: ${id}`).toBe(true);
      expect(parseView({ sort: `${preset.sort.id}.${preset.sort.dir}` }).sort).toEqual(preset.sort);
      expect(preset.description.length).toBeGreaterThan(30);
    }
    expect(new Set(PRESETS.map((preset) => preset.slug)).size).toBe(PRESETS.length);
    expect(new Set(NUMERIC_FIELDS.map((field) => field.id)).size).toBe(NUMERIC_FIELDS.length);
  });

  it("marks every preset that uses the call as Pro", () => {
    for (const preset of PRESETS) {
      expect(Boolean(preset.pro), preset.slug).toBe(hasCallFilters({ ...EMPTY_FILTERS, ...preset.filters }));
    }
  });

  it("offers a preset only when the snapshot carries its fields", () => {
    expect(availablePresets(undefined)).toEqual([]);
    const some = availablePresets({ earnings_in_days: 200, vol_90d: 600, div_yield: 400, div_growth: 300, payout: 39 });
    expect(some.map((preset) => preset.slug)).toEqual(["earnings-next-7-days"]);
  });

  it("sends old thematic screens to the preset that replaced them", () => {
    expect(presetForLegacyScreen("cheap_growth")?.slug).toBe("cheap-vs-own-history");
    expect(presetForLegacyScreen("smart_money")?.slug).toBe("widely-held-and-rated");
    expect(presetForLegacyScreen("unknown")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats each unit and leaves unknowns empty", () => {
    expect(formatField(FIELD_BY_ID.get("price")!, 1234.5)).toBe("$1,234.50");
    expect(formatField(FIELD_BY_ID.get("market_cap")!, 4.6e12)).toBe("$4.60T");
    expect(formatField(FIELD_BY_ID.get("day_pct")!, -5.031)).toBe("−5.03%");
    expect(formatField(FIELD_BY_ID.get("day_pct")!, 0)).toBe("0.00%");
    expect(formatField(FIELD_BY_ID.get("pe")!, 29.14)).toBe("29.1×");
    expect(formatField(FIELD_BY_ID.get("earnings_in_days")!, 0)).toBe("today");
    expect(formatField(FIELD_BY_ID.get("earnings_in_days")!, 6)).toBe("6d");
    expect(formatField(FIELD_BY_ID.get("buys_chg_3m")!, 2)).toBe("+2");
    expect(formatField(FIELD_BY_ID.get("buys_chg_3m")!, -1)).toBe("−1");
    expect(formatField(FIELD_BY_ID.get("op_margin")!, -8)).toBe("−8.0%");
    expect(formatField(FIELD_BY_ID.get("pe")!, undefined)).toBe("");
    expect(formatField(FIELD_BY_ID.get("pe")!, Number.NaN)).toBe("");
  });

  it("describes a range in words", () => {
    expect(describeRange(FIELD_BY_ID.get("pe")!, { max: 25 })).toBe("P/E 25.0× or less");
    expect(describeRange(FIELD_BY_ID.get("rev_growth")!, { min: 10 })).toBe("Sales growth 10.0% or more");
    expect(describeRange(FIELD_BY_ID.get("div_yield")!, { min: 1.5, max: 6 })).toBe("Yield 1.50% to 6.00%");
  });
});

describe("sector aggregates", () => {
  it("weights each sector's change by market cap and ranks by size", () => {
    const stats = sectorStats([
      { symbol: "A", sector: "Technology", market_cap: 300, day_pct: 2, ret_1m: 10 },
      { symbol: "B", sector: "Technology", market_cap: 100, day_pct: -2 },
      { symbol: "C", sector: "Energy", market_cap: 50, day_pct: 1 },
      { symbol: "D", sector: "Technology", day_pct: 50 },
      { symbol: "E" },
    ]);
    expect(stats.map((stat) => stat.name)).toEqual(["Technology", "Energy"]);
    const tech = stats[0]!;
    expect(tech.count).toBe(3);
    expect(tech.marketCap).toBe(400);
    expect(tech.change.day_pct).toBeCloseTo((2 * 300 - 2 * 100) / 400, 10);
    // Only A has a 1-month return, so the sector's is A's.
    expect(tech.change.ret_1m).toBe(10);
    expect(tech.change.ret_ytd).toBeUndefined();
    expect(tech.advancing).toBeCloseTo((2 / 3) * 100, 10);
    expect(tech.best).toEqual({ symbol: "D", pct: 50 });
    expect(tech.worst).toEqual({ symbol: "B", pct: -2 });
    expect(tech.slug).toBe("technology");
  });
});

describe("treemap", () => {
  it("fills the box with areas proportional to value", () => {
    const rects = squarify(
      [
        { value: 6, data: "a" },
        { value: 6, data: "b" },
        { value: 4, data: "c" },
        { value: 3, data: "d" },
        { value: 2, data: "e" },
        { value: 2, data: "f" },
        { value: 1, data: "g" },
        { value: 0, data: "zero" },
        { value: -3, data: "negative" },
      ],
      0,
      0,
      600,
      400,
    );
    expect(rects).toHaveLength(7);
    const total = rects.reduce((sum, rect) => sum + rect.w * rect.h, 0);
    expect(total).toBeCloseTo(600 * 400, 4);
    const a = rects.find((rect) => rect.data === "a")!;
    const g = rects.find((rect) => rect.data === "g")!;
    expect((a.w * a.h) / (g.w * g.h)).toBeCloseTo(6, 6);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.x + rect.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it("does not overlap", () => {
    const rects = squarify(
      [5, 4, 3, 2, 1, 1, 1].map((value, index) => ({ value, data: index })),
      10,
      20,
      300,
      200,
    );
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW > 1e-6 && overlapH > 1e-6, `${i} overlaps ${j}`).toBe(false);
      }
    }
  });

  it("returns nothing for an empty or zero-sized input", () => {
    expect(squarify([], 0, 0, 10, 10)).toEqual([]);
    expect(squarify([{ value: 1, data: 1 }], 0, 0, 0, 10)).toEqual([]);
  });
});

describe("P/E against its own history", () => {
  const field = FIELD_BY_ID.get("pe_hist_pctile")!;
  it("says the ends in words and the middle as a place out of 100", () => {
    expect(formatField(field, 0)).toBe("Lowest");
    expect(formatField(field, 0.3)).toBe("Lowest");
    expect(formatField(field, 12.4)).toBe("12 of 100");
    expect(formatField(field, 100)).toBe("Highest");
    expect(formatField(field, null)).toBe("");
  });
});
