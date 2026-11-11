import { describe, expect, it } from "vitest";
import type { MemoItem } from "@/lib/memo/types";
import { explainCall, explainDays, explainMover } from "./explain";

function item(over: Partial<MemoItem>): MemoItem {
  return { id: "x", kind: "move", text: "", href: "/stock/NVDA", linkLabel: "Why it moved", tone: "down", tickers: ["NVDA"], source: "Researched move explanations", asOf: "2026-11-09", ...over };
}

const bare = item({ id: "move:NVDA:2026-11-09", text: "Nvidia fell 5.2% on Monday, Nov 9." });
const told = item({ id: "move:AAPL:2026-11-10", tickers: ["AAPL"], asOf: "2026-11-10", text: "On Tuesday, Nov 10, Apple rose 3.1% after strong iPhone sales." });
const mover = { ticker: "NVDA", name: "Nvidia", pct: -5.2, points: -0.8, href: "/stock/NVDA/moves/2026-11-09" };

describe("memo explanations", () => {
  it("says nothing for a move with no confirmed reason, and keeps the evidence and Ask", () => {
    const out = explainMover({ changed: [bare], hurt: [], look: [] }, mover as never, true);
    expect(out.text).toBeNull();
    expect(out.source).toBeNull();
    expect(out.evidence?.href).toBe("/stock/NVDA/moves/2026-11-09");
    expect(out.ask.href).toContain("ctx=stock%3ANVDA");
  });

  it("uses a move that carries its reason", () => {
    const out = explainMover({ changed: [told], hurt: [], look: [] }, { ...mover, ticker: "AAPL", pct: 3.1 } as never, false);
    expect(out.text).toContain("strong iPhone sales");
  });

  it("never falls back to a grouped call line or a call line without its reason", () => {
    const grouped = item({ id: "calls:keep", kind: "call", tickers: ["NVDA", "MSFT"], text: "Our call moved to Keep on two holdings: NVIDIA and Microsoft.", asOf: "2026-11-10" });
    const plain = item({ id: "call:NVDA:2026-11-09", kind: "call", text: "Our call on Nvidia moved from Buy more to Keep on Monday, Nov 9." });
    const call = { ticker: "NVDA", from: "Add", to: "Hold", date: "2026-11-09" };
    expect(explainCall({ changed: [grouped, plain], hurt: [], look: [] }, call as never, true).text).toBeNull();
    const reasoned = { ...plain, text: `${plain.text} "Growth is slowing."` };
    expect(explainCall({ changed: [grouped, reasoned], hurt: [], look: [] }, call as never, true).text).toContain("Growth is slowing");
  });

  it("only puts reasoned moves and reports on a chart day", () => {
    const days = explainDays({ changed: [bare, told], hurt: [], look: [], subject: "example" } as never, [
      { day: "2026-11-06", portfolio: 0, market: 0 },
      { day: "2026-11-09", portfolio: -1, market: -0.5 },
      { day: "2026-11-10", portfolio: 0.4, market: 0.2 },
    ]);
    expect(days[1]!.stories).toHaveLength(0);
    expect(days[2]!.stories.map((story) => story.ticker)).toEqual(["AAPL"]);
  });
});
