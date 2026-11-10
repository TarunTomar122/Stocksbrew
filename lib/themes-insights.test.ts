import { describe, expect, it } from "vitest";

import type { Basket, BasketLine } from "@/lib/screener-themes";
import { buildThemeRead, buildThemesRead, lineMoves } from "@/lib/themes-insights";

function line(ticker: string, ret_1m: number, ret_ytd: number, call?: "Add" | "Hold" | "Trim"): BasketLine {
  return { company: ticker, ticker, role: "", benefit: "", breaks: "", catalyst: null, row: { symbol: ticker, ret_1m, ret_ytd, call } as BasketLine["row"] };
}

function basket(slug: string, name: string, month: number, year: number, lines: BasketLine[]): Basket {
  return {
    slug,
    name,
    thesis: "",
    size: lines.length,
    perf: { ret_1m: { pct: month, priced: lines.length, total: lines.length }, ret_3m: null, ret_ytd: { pct: year, priced: lines.length, total: lines.length }, ret_1y: null },
    benchmark: { ret_1m: -3.1, ret_3m: null, ret_ytd: 11.5, ret_1y: null },
    lead: [],
    roles: [],
    asOf: null,
    description: "",
    holds: "",
    lines,
    alsoWatching: [],
    resources: [],
  };
}

const water = basket("water", "Water infrastructure", 13.4, 20, [line("PNR", 34, 40), line("TTEK", 23, 10), line("XYL", -2, 5)]);
const ai = basket("ai", "AI capex", -17.1, 29, [line("MSFT", 2, 10, "Add"), line("LRCX", -31, 50, "Add"), line("MU", -29, 157, "Trim"), line("AVGO", -10, 20)]);
const cyber = basket("cyber", "Cybersecurity", 1, 55.7, [line("OKTA", 3, 105), line("CRWD", 1, 95)]);

describe("themes read", () => {
  it("sorts lines by their own return and skips unpriced ones", () => {
    expect(lineMoves([...water.lines, { ...line("ZZZ", 0, 0), row: null }], "ret_1m").map((row) => row.ticker)).toEqual(["PNR", "TTEK", "XYL"]);
  });

  it("names this month's leader and laggard with the names that carried them", () => {
    const read = buildThemesRead([ai, water, cyber]);
    expect(read.headline).toBe("Water infrastructure leads this month at +13.4%; AI capex lags at −17.1%.");
    expect(read.insights[0].text).toBe("Water infrastructure is +13.4% this month, 16.5 pts ahead of the S&P 500, carried by PNR +34% and TTEK +23%.");
    expect(read.insights[1].text).toBe("AI capex is −17.1% this month, 14.0 pts behind the S&P 500, dragged by LRCX −31% and MU −29%.");
    expect(read.insights[2].id).toBe("year");
  });
});

describe("one basket", () => {
  it("says who carried and who held back, how lopsided the year is, and our calls", () => {
    const read = buildThemeRead(ai);
    expect(read.headline).toBe("AI capex is trailing the S&P 500 this month: −17.1% against −3.1%.");
    expect(read.insights[0].text).toBe("LRCX −31% and MU −29% pulled it down this month; MSFT +2% held up.");
    expect(read.insights[1].text).toBe("This year it is +29.0%, 17.5 pts ahead of the S&P 500, and MU (+157%) is 66% of that gain on its own.");
    expect(read.insights[2].text).toBe("Our call says add on 2 of the 4 names (MSFT and LRCX) and trim MU.");
  });
});
