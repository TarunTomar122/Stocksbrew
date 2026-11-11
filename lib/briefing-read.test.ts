import { describe, expect, it } from "vitest";

import type { Briefing, BriefingItem } from "@/lib/briefing";
import { groupBriefingSections } from "@/lib/briefing-groups";
import { briefingRead, firstSentence, holdingsFirst, sessionLine } from "@/lib/briefing-read";
import type { BriefingGroup } from "@/lib/briefing-groups";

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
    expect(read?.insights[1].soWhat).toBeUndefined();
    expect(read?.insights[2].action).toEqual({ label: "Our view on CBRS", href: "/stock/CBRS" });
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
    expect(quietDay?.insights[0].text).toBe("Our call moved to Buy more.");
  });

  it("reads the market view from its explained moves", () => {
    const lead = { ...cbrs, relation: "market" as const, needs_you: true };
    const read = briefingRead({ ...base, mode: "market" }, groupBriefingSections({ ...sections([]), needs_you: [lead] }, "market"));
    expect(read?.headline).toBe("CBRS rose 7.9%, the biggest move today with news behind it.");
    // The index is the first line under the story.
    expect(read?.insights.map((insight) => insight.id)[0]).toBe("index");
    expect(read?.insights[0]!.text).toBe("The S&P 500 is up 2.33%.");
    expect(read?.insights).toHaveLength(2);
  });
  it("says a cause-first reason company first, with the name in place of the ticker", () => {
    const hims = item({
      id: "h",
      kind: "price_move",
      ticker: "HIMS",
      name: "Hims & Hers Health, Inc.",
      relation: "market",
      needs_you: true,
      reason_status: "confirmed",
      why: "Earnings miss and guidance cut trigger Hims & Hers selloff.",
      day_change_pct: -16.5,
    });
    const read = briefingRead({ ...base, mode: "market" }, groupBriefingSections({ ...sections([]), needs_you: [hims] }, "market"));
    // With the reason in it the headline is long enough; "the biggest move" goes under the index line.
    expect(read?.headline).toBe("Hims & Hers Health fell 16.5% after earnings that missed expectations and a lower forecast.");
    expect(read?.insights[0]).toMatchObject({ id: "index", text: "The S&P 500 is up 2.33%.", soWhat: "Hims & Hers Health's 16.5% fall was the biggest move today with news behind it." });
    // The lead's reason is in the headline, so its row is not repeated below.
    expect(read?.insights.some((insight) => insight.tickers?.includes("HIMS"))).toBe(false);
    expect(read?.headlineTickers).toEqual(["HIMS"]);
  });

  it("folds stocks you watch sitting in their add zone into one line read against the index", () => {
    const zone = (ticker: string, pct: number) =>
      item({ id: `z-${ticker}`, kind: "zone_entered", ticker, relation: "watching", headline: `${ticker} is in its add zone: $10.00, below $10.50`, day_change_pct: pct });
    const read = briefingRead(
      { ...base, market: { ...base.market, indices: [{ name: "S&P 500", price: 7505, change_pct: -0.59 }] } },
      groupBriefingSections(sections([zone("VRT", -3.4), zone("INTC", -1.8), zone("TSLA", -0.6), zone("LLY", -0.1)])),
    );
    const insight = read?.insights.find((entry) => entry.id === "add-zones");
    expect(insight?.text).toBe("4 stocks you watch are below their buy-more price: VRT, INTC, TSLA and 1 more.");
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
    expect(read?.headline).toBe("CBRS rose 7.9% on Monday, the biggest move with news behind it.");
    expect(read?.insights[0].text).toBe("The S&P 500 is up 2.33%.");
    expect(read?.insights[1].text).toBe("CBRS rose 7.9% on Monday: Cerebras signed a cloud deal.");
  });
});

describe("the market view's session line", () => {
  const sectors = (ups: number, downs: number) => [
    ...Array.from({ length: ups }, (_, i) => ({ name: `Up ${i}`, day: 0.4 })),
    ...Array.from({ length: downs }, (_, i) => ({ name: `Down ${i}`, day: -0.6 })),
  ];
  const fell = { name: "S&P 500", price: 7522, change_pct: -0.37 };

  it("says when most sectors went the other way, and that the giants did it only when they did", () => {
    expect(sessionLine("The S&P 500 closed down 0.37%.", fell, { sectors: sectors(7, 4), giants: { count: 10, pct: -0.7 } })).toBe(
      "The S&P 500 closed down 0.37% even though 7 of 11 sectors rose. The 10 biggest companies lost 0.7% together and pulled it down.",
    );
    expect(sessionLine("The S&P 500 closed down 0.37%.", fell, { sectors: sectors(7, 4), giants: { count: 10, pct: -0.7, leader: { name: "NVIDIA", pct: -5.53 } } })).toBe(
      "The S&P 500 closed down 0.37% even though 7 of 11 sectors rose. The 10 biggest companies lost 0.7% together, led by NVIDIA (−5.5%), and pulled it down.",
    );
    expect(sessionLine("The S&P 500 closed down 0.37%.", fell, { sectors: sectors(7, 4), giants: { count: 10, pct: 0.2 } })).toBe(
      "The S&P 500 closed down 0.37% even though 7 of 11 sectors rose.",
    );
  });

  it("counts the sectors that went with the index, and says nothing with too few sectors", () => {
    expect(sessionLine("The S&P 500 closed down 0.37%.", fell, { sectors: sectors(3, 8) })).toBe("The S&P 500 closed down 0.37%, with 8 of 11 sectors lower.");
    expect(sessionLine("The S&P 500 is up 1.20%.", { name: "S&P 500", change_pct: 1.2 }, { sectors: sectors(11, 0) })).toBe("The S&P 500 is up 1.20%, with every sector higher.");
    expect(sessionLine("The S&P 500 closed down 0.37%.", fell, { sectors: sectors(2, 1) })).toBe("");
  });

  it("leads the market view with the session, then the biggest explained move as the first story", () => {
    const hims = item({ id: "h", kind: "price_move", ticker: "HIMS", name: "Hims & Hers Health, Inc.", relation: "market", needs_you: true, reason_status: "confirmed", why: "Earnings miss and guidance cut trigger Hims & Hers selloff.", day_change_pct: -16.5 });
    const cbrs = item({ id: "m", kind: "price_move", ticker: "CBRS", relation: "market", needs_you: true, reason_status: "confirmed", why: "Cerebras signed a cloud deal.", day_change_pct: 7.92 });
    const read = briefingRead(
      { ...base, mode: "market", market: { ...base.market, indices: [fell] } },
      groupBriefingSections({ ...sections([]), needs_you: [cbrs, hims] }, "market"),
      { sectors: sectors(7, 4), giants: { count: 10, pct: -0.7 } },
    );
    expect(read?.headline).toBe("The S&P 500 is down 0.37% even though 7 of 11 sectors rose.");
    // How the giants pulled it is the first line under the session, then the one story.
    expect(read?.insights[0]).toMatchObject({ id: "giants", tone: "down", text: "The 10 biggest companies lost 0.7% together and pulled it down." });
    expect(read?.insights[1]?.tickers).toEqual(["HIMS"]);
    expect(read?.insights[1]?.soWhat).toBe("The biggest move today with news behind it.");
    // One story under the session; the other explained moves are the list below the read.
    expect(read?.insights).toHaveLength(2);
    expect(read?.headlineTickers).toBeUndefined();
  });
});

describe("firstSentence", () => {
  it("keeps the whole first sentence, never an ellipsis, in sentence case", () => {
    expect(firstSentence("One. Two.")).toBe("One");
    expect(firstSentence("a ".repeat(100)).endsWith("…")).toBe(false);
    expect(firstSentence("Zeta Raises Outlook After Strong Q3 Earnings Beat. More.")).toBe("Zeta raises its forecast after Q3 earnings that beat expectations");
  });
});

describe("indexClock", () => {
  it("says closed after 4 PM ET, the time inside the session, and nothing for other days", async () => {
    const { indexClock } = await import("./briefing-read");
    expect(indexClock("2026-11-10T21:05:00.000Z", "2026-11-10")).toEqual({ kind: "closed" });
    expect(indexClock("2026-11-10T14:56:00.000Z", "2026-11-10")).toEqual({ kind: "intraday", clock: "9:56 AM ET" });
    expect(indexClock("2026-11-09T21:05:00.000Z", "2026-11-10")).toBeNull();
    expect(indexClock(null, "2026-11-10")).toBeNull();
  });
});

describe("holdingsFirst", () => {
  const g = (key: string, relation: BriefingGroup["relation"]) => ({ key, relation }) as BriefingGroup;
  it("puts holdings, then watched stocks, then the market, keeping each band's order", () => {
    const out = holdingsFirst({
      needs_you: [g("W1", "watching"), g("H1", "holding"), g("M", "market"), g("H2", "holding")],
      worth_knowing: [g("W2", "watching"), g("H3", "holding")],
      coming_up: [],
      settled: [g("S", "watching")],
    });
    expect(out.needs_you.map((group) => group.key)).toEqual(["H1", "H2", "W1", "M"]);
    expect(out.worth_knowing.map((group) => group.key)).toEqual(["H3", "W2"]);
    expect(out.settled.map((group) => group.key)).toEqual(["S"]);
  });
});
