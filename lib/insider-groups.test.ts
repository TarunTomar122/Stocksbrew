import { describe, expect, it } from "vitest";

import { clusterIsOffPrice, priceIsOff, slimInsiderTrade, type InsiderTrade } from "@/lib/follow-shared";
import { groupInsiderTrades, roleKind } from "@/lib/insider-groups";

function trade(id: string, extra: Partial<InsiderTrade> = {}): InsiderTrade {
  return {
    id,
    symbol: "TSM",
    company: "Taiwan Semiconductor",
    insider: `Insider ${id}`,
    insider_id: id,
    role: "VP",
    tx_type: "buy",
    shares: 50,
    price: 70.5,
    value: 3525,
    transaction_date: "2026-11-06",
    filing_date: "2026-11-10",
    filed_at: `2026-11-10T06:${id.padStart(2, "0")}:00`,
    lag_days: 4,
    shares_after: null,
    ownership: "indirect",
    plan_10b5_1: false,
    url: `https://sec.gov/${id}`,
    ...extra,
  };
}

describe("groupInsiderTrades", () => {
  it("folds a dozen vice presidents buying on one day at one price into one row", () => {
    const vps = Array.from({ length: 12 }, (_, i) => trade(String(i + 1), { insider: ["Jun He", "Lipen Yuan", "Min Cao"][i] ?? `VP ${i + 1}` }));
    const other = trade("99", { symbol: "ROK", role: "President and CEO, Director", price: 386.36, value: 1_545_440, shares: 4000 });
    const items = groupInsiderTrades([vps[0]!, other, ...vps.slice(1)]);
    expect(items).toHaveLength(2);
    const group = items[0]!;
    expect(group.kind).toBe("group");
    if (group.kind !== "group") return;
    expect(group.label).toBe("12 vice presidents");
    expect(group.names).toBe("Jun He, Lipen Yuan and 10 more");
    expect(group.shares).toBe(600);
    expect(group.value).toBe(3525 * 12);
    expect(group.price).toBeCloseTo(70.5);
    expect(items[1]).toEqual({ kind: "trade", trade: other });
  });

  it("keeps rows apart when the price, the day, the side or the job differ, and leaves pairs alone", () => {
    const rows = [
      trade("1"),
      trade("2"),
      trade("3", { price: 79.39 }),
      trade("4", { transaction_date: "2026-11-05" }),
      trade("5", { tx_type: "sell" }),
      trade("6", { role: "Director" }),
    ];
    expect(groupInsiderTrades(rows).every((item) => item.kind === "trade")).toBe(true);
  });

  it("reads the kind of job from the Form 4 role line", () => {
    expect(roleKind("SVP and Deputy Co-COO")).toBe("chief");
    expect(roleKind("VP")).toBe("vp");
    expect(roleKind("Senior Vice President")).toBe("vp");
    expect(roleKind("Director")).toBe("director");
    expect(roleKind("Director, 10% owner")).toBe("owner");
    expect(roleKind("Controller")).toBe("officer");
  });
});

describe("prices that are not the listed share's", () => {
  // TSM's ADR traded between about $190 and $400 over the year; TSMC's employee plan buys Taiwan shares at $70.50.
  const tsm = { lo: 190, hi: 410 };

  it("flags a price more than twice outside the 52-week range, and nothing without a range", () => {
    expect(priceIsOff(70.5, tsm)).toBe(true);
    expect(priceIsOff(357, tsm)).toBe(false);
    expect(priceIsOff(900, tsm)).toBe(true);
    expect(priceIsOff(70.5, null)).toBe(false);
    expect(priceIsOff(null, tsm)).toBe(false);
  });

  it("drops a stored row priced off the range unless the job already checked it", () => {
    const raw = { id: "x", symbol: "TSM", tx_type: "buy", price: 70.5, shares: 50, value: 3525 };
    expect(slimInsiderTrade(raw, tsm)).toBeNull();
    expect(slimInsiderTrade(raw, null)?.price).toBe(70.5);
    expect(slimInsiderTrade({ ...raw, price: 357 }, tsm)?.price).toBe(357);
    // A home-market line keeps its value without a price; a checked row is trusted.
    expect(slimInsiderTrade({ ...raw, foreign_line: true, price_comparable: false }, tsm)).toMatchObject({ price: null, value: 3525 });
    expect(slimInsiderTrade({ ...raw, price_comparable: true }, tsm)?.price).toBe(70.5);
    expect(slimInsiderTrade({ ...raw, price_comparable: false }, tsm)).toBeNull();
  });

  it("drops a stored cluster whose members mostly bought off the range", () => {
    const members = [
      { insider: "Michael R. Splinter", role: "Director", value: 300_000, shares: 840 },
      ...Array.from({ length: 7 }, (_, i) => ({ insider: `VP ${i}`, role: "VP", value: 3525, shares: 50 })),
    ];
    expect(clusterIsOffPrice({ members }, tsm)).toBe(true);
    expect(clusterIsOffPrice({ members: members.slice(0, 2) }, tsm)).toBe(false);
    expect(clusterIsOffPrice({ members }, null)).toBe(false);
  });
});
