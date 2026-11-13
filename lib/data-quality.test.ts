import { describe, expect, it } from "vitest";

import { parseDataQuality } from "./data-quality";

describe("parseDataQuality", () => {
  it("reads the job's doc and drops what does not fit", () => {
    const parsed = parseDataQuality({
      as_of: "2026-11-13T22:40:00+00:00",
      stocks: 779,
      totals: { error: 3, warn: "x" },
      rules: [
        { id: "pe_vs_price_eps", label: "P/E far from price over EPS", severity: "error", count: 2, worst: [{ ticker: "AMKR", field: "pe", value: 49.6, expected: 15, price: 37.11, extra: null }, { field: "pe" }] },
        { id: "broken" },
        { id: "stale_facts", severity: "odd", count: 0, worst: null },
      ],
      withheld: { "ttm_growth_vs_quarters:withheld": 6, bad: "1" },
    });
    expect(parsed).toEqual({
      asOf: "2026-11-13T22:40:00+00:00",
      stocks: 779,
      totals: { error: 3, warn: 0 },
      rules: [
        { id: "pe_vs_price_eps", label: "P/E far from price over EPS", severity: "error", count: 2, worst: [{ ticker: "AMKR", field: "pe", value: 49.6, expected: 15, context: { price: 37.11 } }] },
        { id: "stale_facts", label: "stale_facts", severity: "warn", count: 0, worst: [] },
      ],
      withheld: { "ttm_growth_vs_quarters:withheld": 6 },
    });
  });

  it("is null for anything that is not the doc", () => {
    expect(parseDataQuality(null)).toBeNull();
    expect(parseDataQuality({ rules: [] })).toBeNull();
    expect(parseDataQuality({ as_of: "x" })).toBeNull();
  });
});
