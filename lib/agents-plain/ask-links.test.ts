import { describe, expect, it } from "vitest";

import { earningsRequest, moveRequest, watchEarningsHref, watchEarningsManyHref, watchMoveHref, watchMovesHref } from "./ask-links";
import { parseByRules } from "./parse";
import { buildCatalog } from "./stocks";

const catalog = buildCatalog([
  { ticker: "NVDA", name: "NVIDIA Corporation", aliases: ["NVDA", "NVIDIA"], price: 168.79 },
  { ticker: "AAPL", name: "Apple Inc.", aliases: ["AAPL", "Apple"], price: 348.63 },
  { ticker: "BRK.B", name: "Berkshire Hathaway", price: 480 },
]);

describe("watch-this-for-me requests", () => {
  it("reads a big-move request as one big-move agent on that stock", () => {
    const result = parseByRules(moveRequest("NVDA", 5)!, catalog, { hidden: [] });
    const watches = result.spec.watches;
    expect(watches).toHaveLength(1);
    expect(watches[0]!.draft.template).toBe("big-move");
    expect(watches[0]!.draft.scope).toEqual({ kind: "tickers", tickers: ["NVDA"] });
    expect(watches[0]!.draft.trigger).toMatchObject({ type: "price", rule: "moves_pct", pct: 5 });
    expect(result.spec.cannot).toEqual([]);
  });

  it("reads an earnings request as one earnings-ahead agent, three days out", () => {
    const result = parseByRules(earningsRequest("AAPL", 3)!, catalog, { hidden: [] });
    const watches = result.spec.watches;
    expect(watches).toHaveLength(1);
    expect(watches[0]!.draft.template).toBe("earnings-ahead");
    expect(watches[0]!.draft.scope).toEqual({ kind: "tickers", tickers: ["AAPL"] });
    expect(watches[0]!.draft.trigger).toMatchObject({ type: "event", event: "earnings_approaching", days_before: 3 });
    expect(result.spec.cannot).toEqual([]);
  });

  it("builds links only for a ticker and a sensible number", () => {
    expect(watchMoveHref("nvda")).toBe("/agents?q=Tell%20me%20when%20NVDA%20moves%205%25%20in%20a%20day");
    expect(watchEarningsHref("BRK.B", 3)).toContain("BRK.B");
    expect(watchMoveHref("not a ticker")).toBeNull();
    expect(watchMoveHref("NVDA", 0)).toBeNull();
    expect(watchEarningsHref("NVDA", 40)).toBeNull();
  });
});

describe("one watch for a whole list", () => {
  const request = (link: string) => decodeURIComponent(link.replace("/agents?q=", ""));

  it("reads several stocks as one agent on all of them", () => {
    const moves = parseByRules(request(watchMovesHref(["NVDA", "aapl", "NVDA"])!), catalog, { hidden: [] });
    expect(request(watchMovesHref(["NVDA", "aapl", "BRK.B"])!)).toBe("Tell me when NVDA, AAPL or BRK.B moves 5% in a day");
    expect(moves.spec.watches).toHaveLength(1);
    expect(moves.spec.watches[0]!.draft.scope).toEqual({ kind: "tickers", tickers: ["NVDA", "AAPL"] });
    expect(moves.spec.cannot).toEqual([]);
    const earnings = parseByRules(request(watchEarningsManyHref(["NVDA", "AAPL"], 3)!), catalog, { hidden: [] });
    expect(earnings.spec.watches).toHaveLength(1);
    expect(earnings.spec.watches[0]!.draft.template).toBe("earnings-ahead");
    expect(earnings.spec.watches[0]!.draft.scope).toEqual({ kind: "tickers", tickers: ["NVDA", "AAPL"] });
  });

  it("matches the one-stock link for one stock and refuses bad input", () => {
    expect(watchMovesHref(["NVDA"])).toBe(watchMoveHref("NVDA"));
    expect(watchEarningsManyHref(["AAPL"], 3)).toBe(watchEarningsHref("AAPL", 3));
    expect(watchMovesHref([])).toBeNull();
    expect(watchMovesHref(["NVDA", "not a ticker"])).toBeNull();
    expect(watchEarningsManyHref(["NVDA"], 40)).toBeNull();
  });
});

describe("one day before", () => {
  it("says day, not days, and still reads as an earnings agent", () => {
    expect(earningsRequest("NVDA", 1)).toBe("Tell me 1 day before NVDA reports earnings");
    const result = parseByRules(earningsRequest("NVDA", 1)!, catalog, { hidden: [] });
    expect(result.spec.watches[0]?.draft.trigger).toMatchObject({ event: "earnings_approaching", days_before: 1 });
    expect(moveRequest("NVDA", 0.4)).toBeNull();
  });
});
