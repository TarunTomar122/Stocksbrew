import { describe, expect, it } from "vitest";

import type { ScreenerRow } from "@/lib/screener-shared";

import { matchBasket, sectorMedianPe, sortMembers } from "./match";
import { parseBasketRequest } from "./parse";
import type { ThemeLine } from "./topics";

function row(symbol: string, extra: Partial<ScreenerRow>): ScreenerRow {
  return { symbol, name: `${symbol} Inc.`, ...extra };
}

const ROWS: ScreenerRow[] = [
  row("VST", { sector: "Utilities", industry: "Utilities - Independent Power Producers", market_cap: 48e9, pe: 30 }),
  row("CEG", { sector: "Utilities", industry: "Electric Utilities", market_cap: 92e9, pe: 35 }),
  row("AEP", { sector: "Utilities", industry: "Electric Utilities", market_cap: 71e9, pe: 18 }),
  row("MOD", { sector: "Industrials", industry: "Auto Parts & Thermal Management", market_cap: 14e9 }),
  row("ANET", { sector: "Technology", industry: "Communications Equipment", market_cap: 220e9 }),
  row("JPM", { sector: "Financials", industry: "Banks - Diversified", market_cap: 800e9, pe: 15 }),
  row("FBP", { sector: "Financials", industry: "Financials", name: "First BanCorp", market_cap: 3e9, pe: 10 }),
  row("WFC", { sector: "Financials", industry: "Banks - Diversified", market_cap: 250e9, pe: 13 }),
  row("BX", { sector: "Financials", industry: "Asset Management", market_cap: 200e9, pe: 40 }),
  row("ICE", { sector: "Financials", industry: "Financial Exchanges", market_cap: 90e9, pe: 30 }),
  row("SPY", { benchmark: true, market_cap: 1e12 }),
];

const THEMES = new Map<string, ThemeLine[]>([
  ["VST", [{ slug: "energy", theme: "Energy", role: "Dispatchable generation", text: "Vistra owns power plants." }]],
  [
    "CEG",
    [
      { slug: "energy", theme: "Energy", role: "Reliable power", text: "Its nuclear plants deliver steady electricity." },
      { slug: "ai-capex", theme: "AI capex", role: "Reliable power", text: "Nuclear plants for AI campuses." },
    ],
  ],
  ["MOD", [{ slug: "ai-capex", theme: "AI capex", role: "Cooling", text: "Cooling for data centers." }]],
  ["ANET", [{ slug: "ai-capex", theme: "AI capex", role: "Networking", text: "Ethernet switches that connect AI servers." }]],
]);

describe("matchBasket", () => {
  it("builds AI power under $50B from research roles, never from a stray word", () => {
    const result = matchBasket(parseBasketRequest("AI power stocks under $50B").spec, { rows: ROWS, themes: THEMES });
    // AEP is a power company but nothing we hold ties it to AI or power demand; ANET's "switches" is not grid equipment.
    expect(result.subjectCount).toBe(3);
    expect(result.members.map((member) => member.row.symbol)).toEqual(["VST", "MOD"]);
    expect(result.funnel).toEqual([{ label: "worth less than $50 billion", removed: 1, examples: ["CEG"] }]);
    expect(result.members[0]!.why).toBe("Our Energy research lists it for dispatchable generation. It is worth $48 billion.");
  });

  it("merges two research hits with the same role into one clause", () => {
    const result = matchBasket(parseBasketRequest("AI power stocks").spec, { rows: ROWS, themes: THEMES });
    const ceg = result.members.find((member) => member.row.symbol === "CEG")!;
    expect(ceg.why).toBe("Our Energy and AI capex research list it for reliable power. It is worth $92 billion.");
  });

  it("finds banks by industry and by name, and keeps those under their sector's middle P/E", () => {
    const result = matchBasket(parseBasketRequest("cheap banks").spec, { rows: ROWS, themes: THEMES });
    expect(result.subjectCount).toBe(3);
    // Financials P/Es: 10, 13, 15, 30, 40, so the middle is 15 and JPM (15) is not below it.
    expect(result.members.map((member) => member.row.symbol)).toEqual(["FBP", "WFC"]);
    expect(result.members[0]!.why).toBe(
      "By its name, it is one of the banks. It trades on 10.0 times earnings, against 15.0 for the middle financials stock.",
    );
  });

  it("leaves out the benchmark and the excluded subject", () => {
    const result = matchBasket(parseBasketRequest("financials except banks").spec, { rows: ROWS, themes: THEMES });
    expect(result.members.map((member) => member.row.symbol)).toEqual(["BX", "ICE"]);
  });

  it("uses the catalogue's industry when the snapshot only repeats the sector", () => {
    const rows = [row("XYZ", { sector: "Financials", industry: "Financials", market_cap: 5e9 })];
    const result = matchBasket(parseBasketRequest("insurers").spec, { rows, themes: new Map(), industries: new Map([["XYZ", "Property & Casualty Insurance"]]) });
    expect(result.members[0]?.why).toBe("It is in property & casualty insurance. It is worth $5 billion.");
  });
});

describe("helpers", () => {
  it("needs five positive P/Es before a sector has a middle", () => {
    const medians = sectorMedianPe(ROWS);
    expect(medians.get("Financials")).toBe(15);
    expect(medians.has("Utilities")).toBe(false);
  });

  it("sorts missing values and negative P/Es last, whichever way", () => {
    const members = [row("A", { pe: -5, market_cap: 1 }), row("B", { pe: 12, market_cap: 1 }), row("C", { market_cap: 9 }), row("D", { pe: 8, market_cap: 1 })].map((r) => ({ row: r }));
    expect(sortMembers(members, { field: "pe", dir: "asc" }).map((item) => item.row.symbol)).toEqual(["D", "B", "C", "A"]);
  });
});
