import { describe, expect, it } from "vitest";

import { pickNoticed, type HomeSources, type ReasonsSource } from "@/lib/portfolio-home/pick";

import { emptyFacts } from "./facts";
import { evaluate } from "./rules";

const empty = { state: "empty" } as const;
const base: Omit<HomeSources, "goal"> = { memo: empty, xray: empty, season: empty, dividends: empty, stress: empty, ideas: empty };
const TODAY = "2026-11-11";

function check(ticker: string, over: Parameters<typeof evaluate>[1] extends infer F ? Partial<F> : never, kind: "growth" | "dividend" = "growth") {
  const facts = { ...emptyFacts(ticker, `US_${ticker}`, ticker, TODAY), close: { value: 100, day: TODAY }, ...over };
  return evaluate({ kind, reason: null, created_at: "2026-10-01T00:00:00.000Z" }, facts, { avgCost: null, savedClose: null }, TODAY);
}

function withReasons(reasons: ReasonsSource, mode: "mine" | "example" = "mine") {
  return pickNoticed({ ...base, reasons: { state: "ready", value: reasons } }, mode);
}

describe("My stocks: what the reason watcher found", () => {
  it("leads with the worst reason, with its finding as the evidence", () => {
    const items = withReasons({
      checks: [check("NVDA", { revenueGrowth: 30 }), check("KO", { dividendCut: { day: "2026-09-15", from: 0.53, to: 0.3, pct: -43 } }, "dividend"), check("AAPL", { revenueGrowth: 4, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" })],
      withReason: 3,
      holdings: 5,
      locked: 0,
    });
    expect(items[0]).toMatchObject({
      text: "Your reason for owning KO looks broken. One other reason needs a look too.",
      evidence: "The last payment was $0.30 a share, going ex on Sep 15. That is 43% less than the $0.53 before it.",
      open: { href: "/stock/KO" },
      tone: "down",
    });
  });

  it("says when every reason holds, and how many holdings have none", () => {
    const [item] = withReasons({ checks: [check("NVDA", { revenueGrowth: 30 })], withReason: 1, holdings: 4, locked: 0 });
    expect(item).toMatchObject({ text: "The reason we checked still holds. Three holdings have no reason yet.", open: { label: "Add your reasons", href: "/portfolio?reasons=1" } });
  });

  it("asks for reasons when there are none, but not in the example", () => {
    expect(withReasons({ checks: [], withReason: 0, holdings: 6, locked: 0 })[0]).toMatchObject({ text: "You have not said why you own any of your 6 holdings." });
    expect(withReasons({ checks: [], withReason: 0, holdings: 6, locked: 0 }, "example")).toEqual([]);
  });

  it("speaks about the example as the example", () => {
    const [item] = withReasons({ checks: [check("NVDA", { revenueGrowth: 4, revenueGrowthPrior: 15, priorLabel: "fiscal 2025" })], withReason: 1, holdings: 1, locked: 0 }, "example");
    expect(item!.text).toBe("In the example, the reason for owning NVDA is weaker.");
  });
});
