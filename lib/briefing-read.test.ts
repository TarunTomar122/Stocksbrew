import { describe, expect, it } from "vitest";

import type { Briefing, BriefingItem } from "@/lib/briefing";
import { groupBriefingSections } from "@/lib/briefing-groups";
import { briefingRead, comingUpAfterRead, firstSentence, holdingsFirst, readEarningsTickers, readOwnedTickers, sessionLine, worthAfterRead } from "@/lib/briefing-read";
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
    expect(read?.headline).toBe("Your holdings rose 2.1% today.");
    // Each has a card of its own in the read, which owns it (no second card under Worth knowing), so the headline
    // keeps their figures.
    expect(read?.sub).toBe("ASTS (+14.1%) and CBRS (+7.9%) moved most.");
    expect(read?.insights.map((insight) => insight.text)).toEqual([
      "One stock needs a decision: ORCL.",
      "ASTS is up 14.1% today, against +2.3% for the S&P 500.",
      "CBRS is up 7.9%: Cerebras signed a cloud deal.",
    ]);
    expect(read?.insights[1].soWhat).toBeUndefined();
    // A holding with no card of its own (in Quiet) keeps its figure in the headline: nowhere else shows it.
    const quiet = briefingRead(
      { ...base, portfolio: { value: 1000, day_change_value: 21, day_change_pct: 2.1, counted: 3, holdings: 3, as_of: null }, quiet: { text: "", names: [{ ticker: "AAPL", relation: "holding", day_change_pct: 20 }] } },
      groupBriefingSections(sections([orcl, cbrs, asts])),
    );
    expect(quiet?.sub).toBe("AAPL (+20.0%) and ASTS (+14.1%) moved most.");
    expect(read?.insights[2].action).toEqual({ label: "Our view on CBRS", href: "/stock/CBRS" });
  });

  it("reads the example against the S&P 500, on its own price day, with no clock of its own", () => {
    const portfolio = { value: 1000, day_change_value: 21, day_change_pct: 2.1, counted: 3, holdings: 3, as_of: "2026-11-11T20:59:00.000Z" };
    const today = briefingRead({ ...base, date: "2026-11-11", portfolio }, groupBriefingSections(sections([orcl, cbrs, asts])), null, Date.parse("2026-11-11T22:00:00Z"), { example: true, marketPct: 1.31 });
    expect(today?.headline).toBe("Your holdings rose 2.1% today, 0.8 points better than the S&P 500.");
    expect(today?.sub).toBe("ASTS (+14.1%) and CBRS (+7.9%) moved most.");
    // Within a tenth or so of the index, the move is in line with it: one idea, one number (owner rule 8).
    const level = briefingRead({ ...base, date: "2026-11-11", portfolio: { ...portfolio, day_change_pct: 1.2 } }, groupBriefingSections(sections([orcl, cbrs, asts])), null, Date.parse("2026-11-11T22:00:00Z"), { example: true, marketPct: 1.31 });
    expect(level?.headline).toBe("Your holdings rose 1.2% today, in line with the S&P 500.");
    expect(today?.asOf).toBeNull();
    // Before Thursday's open the example still shows Wednesday's prices: it says so instead of "today".
    const before = briefingRead({ ...base, date: "2026-11-12", portfolio }, groupBriefingSections(sections([orcl, cbrs, asts])), null, Date.parse("2026-11-12T12:00:00Z"), { example: true });
    expect(before?.headline).toBe("Your holdings rose 2.1% on Wednesday.");
  });

  it("says the earlier session's day for a member too, when the prices are from the last close", () => {
    const portfolio = { value: 1000, day_change_value: 21, day_change_pct: 2.1, counted: 3, holdings: 3, as_of: "2026-11-11T20:59:00.000Z" };
    const thursday = briefingRead({ ...base, date: "2026-11-12", portfolio }, groupBriefingSections(sections([orcl, cbrs, asts])), null, Date.parse("2026-11-12T12:00:00Z"));
    expect(thursday?.headline).toBe("Your holdings rose 2.1% on Wednesday.");
    const same = briefingRead({ ...base, date: "2026-11-11", portfolio }, groupBriefingSections(sections([orcl, cbrs, asts])), null, Date.parse("2026-11-11T22:00:00Z"));
    expect(same?.headline).toBe("Your holdings rose 2.1% today.");
  });

  it("leaves a stock out of Coming up when the read already names its report", () => {
    const nvda = item({ id: "e", kind: "earnings_upcoming", ticker: "NVDA", relation: "holding", headline: "NVDA reports earnings on Tuesday after the close", deadline_days: 6 });
    const aapl = item({ id: "e2", kind: "earnings_upcoming", ticker: "AAPL", relation: "watching", headline: "AAPL reports earnings on Thursday", deadline_days: 1 });
    const grouped = groupBriefingSections({ needs_you: [], worth_knowing: [], coming_up: [nvda, aapl], kept: [], dismissed: [] });
    const read = briefingRead({ ...base, date: "2026-11-11" }, grouped);
    const named = readEarningsTickers(read);
    expect([...named]).toEqual(["NVDA"]);
    expect(comingUpAfterRead(grouped.coming_up, named).map((group) => group.ticker)).toEqual(["AAPL"]);
    expect(comingUpAfterRead(grouped.coming_up, new Set())).toHaveLength(2);
    // With a holdings headline, NVDA has no card left once the read names its report: its figure stays in the headline.
    const portfolio = { value: 1000, day_change_value: 12, day_change_pct: 1.2, counted: 1, holdings: 1, as_of: null };
    const held = briefingRead({ ...base, date: "2026-11-11", portfolio }, groupBriefingSections({ needs_you: [], worth_knowing: [], coming_up: [{ ...nvda, day_change_pct: 2.9 }], kept: [], dismissed: [] }));
    expect(held?.headline).toBe("Your holdings rose 1.2% today.");
    expect(held?.sub).toBe("NVDA (+2.9%) moved most.");
  });

  it("reads a held stock's report against its usual move and a normal day, with the step to take", () => {
    const nvda = item({ id: "e", kind: "earnings_upcoming", ticker: "NVDA", relation: "holding", headline: "NVDA reports earnings on Tuesday after the close", deadline_days: 6 });
    const grouped = groupBriefingSections({ needs_you: [], worth_knowing: [], coming_up: [nvda], kept: [], dismissed: [] });
    const plain = briefingRead({ ...base, date: "2026-11-11" }, grouped)!.insights[0]!;
    expect(plain.figure).toBeUndefined();
    const reports = { NVDA: { usualPct: 5.94, usualKind: "median" as const, normalPct: 2.02, vsDay: "about three times a normal day" } };
    const card = briefingRead({ ...base, date: "2026-11-11" }, grouped, null, Date.now(), { reports })!.insights[0]!;
    // One whole sentence says what the figure is (judges, ship 46), so the figure carries no fragment beside it.
    expect(card.text).toBe("NVDA reports earnings on Tuesday after the close, and a report usually moves it about 5.9%.");
    expect(card.figure).toEqual({ value: "5.9%" });
    expect(card.soWhat).toBe("That is about three times NVDA's normal day of 2.0%. Check our call on NVDA before the report.");
    // One report is not a pattern: its move, the normal day, no "times".
    const single = briefingRead({ ...base, date: "2026-11-11" }, grouped, null, Date.now(), { reports: { NVDA: { usualPct: 12.4, usualKind: "single", normalPct: 2, vsDay: null } } })!.insights[0]!;
    expect(single.figure).toEqual({ value: "12%" });
    expect(single.text).toBe("NVDA reports earnings on Tuesday after the close, and its last report moved it 12%.");
    expect(single.soWhat).toBe("A normal day for NVDA is a move of about 2.0%. Check our call on NVDA before the report.");
  });

  it("leads a flagged stock's card with the flag, opens it at our call, and keeps it out of Worth knowing (judges, ship 44)", () => {
    const report = item({ id: "e", kind: "earnings_upcoming", ticker: "NVDA", relation: "holding", headline: "NVDA reports earnings on Nov 17 after the close", deadline_days: 6 });
    const news = item({ id: "n", kind: "news", ticker: "NVDA", relation: "holding", headline: "Why Bernstein downgraded Nvidia stock", day_change_pct: 2.9 });
    const amd = item({ id: "x", kind: "news", ticker: "AMD", relation: "watching", headline: "AMD rose", day_change_pct: 7.3 });
    const grouped = groupBriefingSections({ needs_you: [], worth_knowing: [news, amd], coming_up: [report], kept: [], dismissed: [] });
    const flags = { NVDA: "Your agent flagged NVDA's 5.5% drop on Nov 10." };
    const read = briefingRead({ ...base, date: "2026-11-11" }, grouped, null, Date.now(), { flags })!;
    const card = read.insights.find((insight) => insight.tickers?.[0] === "NVDA")!;
    expect(card.soWhat).toBe("Your agent flagged NVDA's 5.5% drop on Nov 10. Check our call on NVDA before the report.");
    expect(card.action).toEqual({ label: "Our call on NVDA", href: "/stock/NVDA#call" });
    expect(readOwnedTickers(read).has("NVDA")).toBe(true);
    expect(worthAfterRead(grouped.worth_knowing, read).map((group) => group.ticker)).toEqual(["AMD"]);
    // A card about several stocks owns none of them.
    expect(worthAfterRead(grouped.worth_knowing, { insights: [{ id: "d", tone: "flat", text: "x", tickers: ["NVDA", "AMD"] }] })).toHaveLength(2);
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

describe("the market read's time", () => {
  // Nov 11: the movers feed ran at 9:58 AM, but the page re-priced CRWV from a 3:03 PM quote.
  const crwv = item({
    id: "crwv",
    kind: "price_move",
    ticker: "CRWV",
    relation: "market",
    needs_you: true,
    reason_status: "confirmed",
    why: "CoreWeave raises its forecast as AI demand and capacity strengthen.",
    day_change_pct: 23.95,
    as_of: "2026-11-11T20:03:00+00:00",
  });
  const market = (index: Briefing["market"]["indices"][number]) => ({
    ...base,
    mode: "market" as const,
    date: "2026-11-11",
    market: { indices: [index], gainers: [], losers: [], as_of: "2026-11-11T14:58:01.497Z" },
  });

  it("carries the time its numbers were priced, not the movers feed's run time", () => {
    const read = briefingRead(
      market({ name: "S&P 500", price: 7549, change_pct: 1.39, as_of: "2026-11-11T20:02:00Z" }),
      groupBriefingSections({ ...sections([]), needs_you: [crwv] }, "market"),
    );
    // The oldest number shown: the index at 3:02 PM, then CRWV at 3:03 PM.
    expect(read?.asOf).toBe("2026-11-11T20:02:00Z");
    expect(read?.headline).toBe("CRWV rose 23.9%, the biggest move today with news behind it.");
    // The index line uses the index's own quote time.
    expect(read?.insights[0]?.text).toBe("As of 3:02 PM ET, the S&P 500 is up 1.39%.");
  });

  it("dates the read by its oldest move", () => {
    const soxl = { ...crwv, id: "soxl", ticker: "SOXL", name: "SOXL", day_change_pct: 20.01, as_of: "2026-11-11T19:41:00Z" };
    const read = briefingRead(
      market({ name: "S&P 500", price: 7549, change_pct: 1.39, as_of: "2026-11-11T20:02:00Z" }),
      groupBriefingSections({ ...sections([]), needs_you: [crwv, soxl] }, "market"),
    );
    expect(read?.asOf).toBe("2026-11-11T19:41:00Z");
  });

  it("gives an index with no time of its own no clock mid-session, and keeps the feed's time as the last resort", () => {
    const read = briefingRead(
      market({ name: "S&P 500", price: 7549, change_pct: 1.42 }),
      groupBriefingSections({ ...sections([]), needs_you: [{ ...crwv, as_of: null }] }, "market"),
    );
    expect(read?.asOf).toBe("2026-11-11T14:58:01.497Z");
    expect(read?.insights[0]?.text).toBe("The S&P 500 is up 1.42%.");
  });

  it("still says the index closed when the movers were priced after the close", () => {
    const read = briefingRead(
      { ...market({ name: "S&P 500", price: 7549, change_pct: 1.42 }), market: { indices: [{ name: "S&P 500", price: 7549, change_pct: 1.42 }], gainers: [], losers: [], as_of: "2026-11-11T21:10:00Z" } },
      groupBriefingSections({ ...sections([]), needs_you: [crwv] }, "market"),
    );
    expect(read?.insights[0]?.text).toBe("The S&P 500 closed up 1.42%.");
  });

  it("never dates a read that says the index closed by a midday move: that move says its own time", () => {
    // After the close: the index closed at 4 PM, CRWV's move is a 12:33 PM snapshot.
    const midday = { ...crwv, as_of: "2026-11-11T17:33:00Z" };
    const read = briefingRead(
      market({ name: "S&P 500", price: 7549, change_pct: 1.31, as_of: "2026-11-11T21:00:00Z" }),
      groupBriefingSections({ ...sections([]), needs_you: [midday] }, "market"),
      null,
      Date.parse("2026-11-11T22:00:00Z"),
    );
    expect(read?.headline).toBe("By 12:33 PM, CRWV was up 23.9%, the biggest move today with news behind it.");
    expect(read?.insights[0]?.text).toBe("The S&P 500 closed up 1.31%.");
    expect(read?.asOf).toBe("2026-11-11T21:00:00Z");
  });
});

describe("withFlags", () => {
  it("leads the first card about a flagged stock with the flag", async () => {
    const { withFlags } = await import("./briefing-read");
    const out = withFlags(
      [
        { id: "a", tone: "flat", text: "NVDA reports Tuesday.", soWhat: "Check our call on it before the report.", tickers: ["NVDA"] },
        { id: "b", tone: "flat", text: "Two stocks moved.", tickers: ["NVDA", "AMD"] },
      ],
      { NVDA: "Your agent flagged its 5.5% drop yesterday." },
    );
    expect(out[0]!.soWhat).toBe("Your agent flagged its 5.5% drop yesterday. Check our call on it before the report.");
    expect(out[1]!.soWhat).toBeUndefined();
  });
});
