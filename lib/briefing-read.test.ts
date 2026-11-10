import { describe, expect, it } from "vitest";

import type { Briefing, BriefingItem } from "@/lib/briefing";
import { groupBriefingSections } from "@/lib/briefing-groups";
import { briefingRead, firstSentence } from "@/lib/briefing-read";

function item(overrides: Partial<BriefingItem> & Pick<BriefingItem, "id" | "kind" | "ticker">): BriefingItem {
  return {
    instrument_id: null,
    name: overrides.ticker,
    relation: "holding",
    severity: "low",
    needs_you: false,
    tone: "flat",
    headline: `${overrides.ticker} did something`,
    metric: null,
    why: "Because.",
    reason_status: "not_applicable",
    next_step: "Read it.",
    spoken: "",
    evidence: [],
    as_of: null,
    deadline_days: null,
    price: 10,
    day_change_pct: null,
    alert: null,
    href: "/",
    ...overrides,
  };
}

const base: Pick<Briefing, "mode" | "portfolio" | "market" | "quiet"> = {
  mode: "personal",
  portfolio: null,
  market: { indices: [{ name: "S&P 500", price: 7549, change_pct: 2.33 }], gainers: [], losers: [], as_of: "2026-11-09T21:46:00.000Z" },
  quiet: { text: "", names: [] },
};

const sections = (items: BriefingItem[]) => ({ needs_you: [], worth_knowing: items, coming_up: [], kept: [], dismissed: [] });

describe("briefingRead", () => {
  const orcl = item({ id: "c", kind: "call_changed", ticker: "ORCL", metric: "Trim", tone: "down", headline: "The call on ORCL changed from Hold to Trim", day_change_pct: 3.2 });
  const cbrs = item({ id: "m", kind: "price_move", ticker: "CBRS", reason_status: "confirmed", why: "Cerebras signed a cloud deal. More detail here.", day_change_pct: 7.92 });
  const asts = item({ id: "a", kind: "price_move", ticker: "ASTS", reason_status: "unconfirmed", why: "x", day_change_pct: 14.1 });

  it("leads with the holdings move and the stocks that moved most", () => {
    const read = briefingRead(
      { ...base, portfolio: { value: 1000, day_change_value: 21, day_change_pct: 2.1, counted: 3, holdings: 3, as_of: null } },
      groupBriefingSections(sections([orcl, cbrs, asts])),
    );
    expect(read?.headline).toBe("Your holdings are up 2.1% today; ASTS (+14.1%) and CBRS (+7.9%) moved most.");
    expect(read?.insights.map((insight) => insight.text)).toEqual([
      "One stock needs a decision: ORCL.",
      "ASTS is up 14.1% today, against +2.3% for the S&P 500.",
      "CBRS is up 7.9%: Cerebras signed a cloud deal.",
    ]);
    expect(read?.insights[1].soWhat).toBe("No confirmed reason yet.");
    expect(read?.insights[2].action).toEqual({ label: "Open CBRS", href: "/stock/CBRS" });
  });

  it("names the decisions when there is no holdings figure", () => {
    const read = briefingRead(base, groupBriefingSections(sections([orcl])));
    expect(read?.headline).toBe("One stock needs a decision today: ORCL.");
  });

  it("says plainly when nothing needs a decision", () => {
    expect(briefingRead(base, groupBriefingSections(sections([])))?.headline).toBe("Nothing needs a decision today.");
    expect(briefingRead(base, groupBriefingSections(sections([asts])))?.headline).toBe(
      "Nothing needs a decision today. ASTS moved most of what you hold, +14.1%.",
    );
  });

  it("does not repeat the decisions listed below, and caps the read at three", () => {
    const calls = ["A", "B", "C", "D"].map((ticker) => item({ id: ticker, kind: "call_changed", ticker, metric: "Trim" }));
    const read = briefingRead(base, groupBriefingSections(sections(calls)));
    expect(read?.headline).toBe("4 stocks need a decision today: A, B, C and 1 more.");
    expect(read?.insights).toEqual([]);
    const watched = ["W", "X", "Y", "Z"].map((ticker) => item({ id: ticker, kind: "call_changed", ticker, relation: "watching", metric: "Accumulate", tone: "up" }));
    const quietDay = briefingRead(base, groupBriefingSections(sections(watched)));
    expect(quietDay?.insights).toHaveLength(3);
    expect(quietDay?.insights[0].text).toBe("Our call moved to Accumulate.");
  });

  it("reads the market view from its explained moves", () => {
    const lead = { ...cbrs, relation: "market" as const, needs_you: true };
    const read = briefingRead({ ...base, mode: "market" }, groupBriefingSections({ ...sections([]), needs_you: [lead] }, "market"));
    expect(read?.headline).toBe("The S&P 500 is up 2.33%; CBRS made the biggest move we could explain.");
    expect(read?.insights).toHaveLength(1);
  });
  it("folds stocks you watch sitting in their add zone into one line read against the index", () => {
    const zone = (ticker: string, pct: number) =>
      item({ id: `z-${ticker}`, kind: "zone_entered", ticker, relation: "watching", headline: `${ticker} is in its add zone: $10.00, below $10.50`, day_change_pct: pct });
    const read = briefingRead(
      { ...base, market: { ...base.market, indices: [{ name: "S&P 500", price: 7505, change_pct: -0.59 }] } },
      groupBriefingSections(sections([zone("VRT", -3.4), zone("INTC", -1.8), zone("TSLA", -0.6), zone("LLY", -0.1)])),
    );
    const insight = read?.insights.find((entry) => entry.id === "add-zones");
    expect(insight?.text).toBe("4 stocks you watch are in their add zone: VRT, INTC, TSLA and 1 more.");
    expect(insight?.soWhat).toBe("The S&P 500 is down 0.59%, so most got there with the market. Reread a call before adding.");
    expect(insight?.tickers).toEqual(["VRT", "INTC", "TSLA"]);
    expect(read?.headline).toBe("Nothing needs a decision today.");
  });
  it("says which session the movers are from when they are older than the briefing's day", () => {
    const lead = { ...cbrs, relation: "market" as const, needs_you: true, as_of: "2026-11-09T21:46:00.000Z" };
    const read = briefingRead(
      { ...base, mode: "market", date: "2026-11-10" },
      groupBriefingSections({ ...sections([]), needs_you: [lead] }, "market"),
    );
    expect(read?.headline).toBe("The S&P 500 is up 2.33%; CBRS made the biggest move we could explain on Monday.");
    expect(read?.insights[0].text).toBe("CBRS rose 7.9% on Monday: Cerebras signed a cloud deal.");
  });
});

describe("firstSentence", () => {
  it("keeps the first sentence and trims long ones", () => {
    expect(firstSentence("One. Two.")).toBe("One");
    expect(firstSentence("a ".repeat(100), 20).endsWith("…")).toBe(true);
  });
});
