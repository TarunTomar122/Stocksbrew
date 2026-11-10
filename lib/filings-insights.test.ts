import { describe, expect, it } from "vitest";

import { buildFilingsRead, insiderWeek, weekWindows, weight } from "@/lib/filings-insights";
import type { Filing } from "@/lib/filings-shared";
import type { InsiderTrade } from "@/lib/follow-shared";

const NOW = Date.parse("2026-11-10T15:00:00Z");

function trade(id: string, symbol: string, side: "buy" | "sell", value: number, day: string, role = "Director", plan = false): InsiderTrade {
  return {
    id, symbol, company: symbol, insider: "x", insider_id: "1", role, tx_type: side, shares: 1, price: 1, value, transaction_date: day, filing_date: day,
    filed_at: `${day}T10:00:00`, lag_days: 1, shares_after: null, ownership: "direct", plan_10b5_1: plan, url: "",
  };
}

function filing(id: string, ticker: string, group: Filing["group"], filedAt: string, codes: string[] = [], form: string = group): Filing {
  return { id, ticker, company: ticker, form, group, amendment: false, headline: "Something", items: codes.map((code) => ({ code, label: code })), filedAt, url: "https://www.sec.gov/x" };
}

describe("windows", () => {
  it("are the last 7 New York days and the 7 before", () => {
    expect(weekWindows(NOW)).toEqual({ thisWeek: ["2026-11-04", "2026-11-10"], lastWeek: ["2026-10-28", "2026-11-03"] });
  });
  it("count only the side asked for, with a value", () => {
    const week = insiderWeek([trade("1", "ROK", "buy", 1e6, "2026-11-09", "President and CEO"), trade("2", "ROK", "sell", 5e6, "2026-11-09"), trade("3", "A", "buy", 1e6, "2026-10-01")], "buy", weekWindows(NOW).thisWeek);
    expect(week.value).toBe(1e6);
    expect(week.ceos).toEqual(["ROK"]);
  });
});

describe("buildFilingsRead", () => {
  it("is null with nothing filed", () => {
    expect(buildFilingsRead({ stream: [], trades: [], buys: [], mine: null, now: NOW })).toBeNull();
  });

  it("weighs selling against buying and compares with the week before", () => {
    const buys = [trade("b1", "ROK", "buy", 2e6, "2026-11-09", "President and CEO"), trade("b2", "LRN", "buy", 1e6, "2026-11-08"), trade("b0", "X", "buy", 1e6, "2026-10-30")];
    const sells = [trade("s1", "SYK", "sell", 30e6, "2026-11-09"), trade("s2", "AXP", "sell", 10e6, "2026-11-06", "CFO", true)];
    const stream = [
      filing("f1", "NKE", "8-K", "2026-11-09T20:00:00Z", ["5.02"]),
      filing("f2", "UNH", "8-K", "2026-11-08T20:00:00Z", ["5.02"]),
      filing("f3", "FDX", "8-K", "2026-10-30T20:00:00Z", ["5.02"]),
      filing("f4", "CTRN", "13D/G", "2026-11-09T20:00:00Z", [], "SC 13D"),
      filing("f5", "ROK", "8-K", "2026-11-09T20:00:00Z", ["2.02"]),
    ];
    const read = buildFilingsRead({ stream, trades: [...sells, buys[0]!], buys, mine: new Set(["ROK"]), now: NOW })!;
    expect(read.headline).toBe("Insiders sold 13x what they bought in the last 7 days; 1 company filed quarterly results.");
    expect(read.insights.map((insight) => insight.id)).toEqual(["mine", "insider-buys", "insider-sells"]);
    expect(read.insights[1]!.text).toBe("Insiders bought $3.0M of their own stock across 2 companies in the last 7 days, up from $1.0M the week before; the biggest buys were in ROK and LRN. One buyer was a CEO (ROK).");
    expect(read.insights[2]!.text).toContain("25% of it was pre-scheduled. The biggest unscheduled sellers: SYK.");
  });
});

describe("weight", () => {
  it("puts activist stakes and leadership changes before routine reports", () => {
    expect(weight(filing("a", "A", "13D/G", "2026-11-09T20:00:00Z", [], "SC 13D"))).toBeGreaterThan(weight(filing("b", "B", "8-K", "2026-11-09T20:00:00Z", ["5.02"])));
    expect(weight(filing("b", "B", "8-K", "2026-11-09T20:00:00Z", ["5.02"]))).toBeGreaterThan(weight(filing("c", "C", "10-Q", "2026-11-09T20:00:00Z")));
    expect(weight(filing("d", "D", "13D/G", "2026-11-09T20:00:00Z", [], "SC 13G"))).toBe(1);
  });
});
