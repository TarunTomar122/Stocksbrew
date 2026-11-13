import { describe, expect, it } from "vitest";

import { callMix, decide, findingsFrom, pickFindings, SHOWN_COUNTS, type LookFacts } from "./rank";
import { FINDING_WORDS, URGENT, type Finding } from "./types";

const TODAY = "2026-11-13";

function facts(over: Partial<LookFacts> = {}): LookFacts {
  return {
    today: TODAY,
    stocks: [
      { ticker: "NVDA", instrumentId: "US_NVDA", held: true },
      { ticker: "AAPL", instrumentId: "US_AAPL", held: true },
      { ticker: "TSLA", instrumentId: "US_TSLA", held: false },
      { ticker: "MSFT", instrumentId: "US_MSFT", held: false },
    ],
    calls: {},
    callChanges: {},
    quotes: {},
    reports: [],
    weekMoves: {},
    filings: [],
    insiders: [],
    results: [],
    proposals: [],
    ...over,
  };
}

const words = (text: string) => text.trim().split(/\s+/).length;

describe("findingsFrom", () => {
  it("ranks a call change to Sell some on a holding over a held stock's report next week and a watched stock's big week", () => {
    const all = findingsFrom(
      facts({
        calls: { NVDA: { call: "Trim", addBelow: null, trimAbove: null }, TSLA: { call: "Hold", addBelow: null, trimAbove: null } },
        callChanges: { NVDA: { day: "2026-11-12", from: "Keep", to: "Sell some" } },
        reports: [{ ticker: "AAPL", date: "2026-11-20", session: "amc", usualPct: 4.2 }],
        weekMoves: { TSLA: { pct: -9.4, to: TODAY, marketPct: 1.1, reason: null } },
      }),
    );
    expect(all.map((finding) => finding.kind)).toEqual(["call", "report", "move"]);
    expect(all[0]).toMatchObject({ ticker: "NVDA", figure: "Sell some", tone: "down" });
    expect(all[0]!.text).toBe("Our call moved from Keep to Sell some yesterday.");
    expect(all[1]!.text).toBe("Reports on Nov 20 after the close; it usually moves 4.2% on results.");
    expect(all[1]!.figure).toBe("In 7 days");
    expect(all[2]!.text).toBe("The S&P 500 rose 1.1% over the same five sessions.");
  });

  it("drops a call change the shown call does not agree with", () => {
    const all = findingsFrom(facts({ calls: { NVDA: { call: "Hold", addBelow: null, trimAbove: null } }, callChanges: { NVDA: { day: TODAY, from: null, to: "Sell some" } } }));
    expect(all).toEqual([]);
  });

  it("shows only the level the call allows, and a sell-some level only on a holding", () => {
    const all = findingsFrom(
      facts({
        calls: {
          NVDA: { call: "Add", addBelow: 150, trimAbove: null },
          AAPL: { call: "Trim", addBelow: null, trimAbove: 230 },
          TSLA: { call: "Trim", addBelow: null, trimAbove: 300 },
          MSFT: { call: "Add", addBelow: 300, trimAbove: null },
        },
        quotes: { NVDA: { price: 148, dayPct: -1 }, AAPL: { price: 226, dayPct: 0.5 }, TSLA: { price: 305, dayPct: 2 }, MSFT: { price: 400, dayPct: 0 } },
      }),
    );
    const byTicker = Object.fromEntries(all.map((finding) => [finding.ticker, finding]));
    expect(byTicker.NVDA).toMatchObject({ kind: "level", figure: "$150.00", figureLabel: "Buy-more level" });
    expect(byTicker.NVDA!.text).toBe("Under the price where our call says buy more.");
    expect(byTicker.AAPL!.text).toBe("1.8% below the price where our call says sell some.");
    // Watched, so its sell-some level is not news; MSFT is 25% above its buy-more level, too far to say.
    expect(byTicker.TSLA).toBeUndefined();
    expect(byTicker.MSFT).toBeUndefined();
  });

  it("uses the stored reason for a big week when there is one, and lifts a finding the agent would propose", () => {
    const all = findingsFrom(
      facts({
        weekMoves: {
          NVDA: { pct: 6.2, to: TODAY, marketPct: 0.4, reason: "Nvidia rose after a cloud deal with Oracle." },
          MSFT: { pct: 9, to: TODAY, marketPct: 0.4, reason: null },
        },
        proposals: [{ kind: "big_move", ticker: "MSFT", priority: 50, why: null, figure: null, at: null, href: null }],
      }),
    );
    expect(all.find((finding) => finding.ticker === "NVDA")!.text).toBe("Nvidia rose after a cloud deal with Oracle.");
    // Watched MSFT, lifted by the proposal the agent would draft, passes held NVDA.
    expect(all[0]!.ticker).toBe("MSFT");
  });

  it("keeps every line within the word budget and drops one that cannot fit", () => {
    const all = findingsFrom(
      facts({
        filings: [
          { ticker: "AAPL", form: "10-Q", filed: "2026-11-01", added: 2, dropped: 1, line: "AAPL's new 10-Q adds 2 risks and drops 1.", href: "/stock/AAPL#filing-changes" },
          { ticker: "NVDA", form: "10-Q", filed: "2026-11-02", added: 1, dropped: 0, line: "word ".repeat(20).trim(), href: "/stock/NVDA" },
        ],
        insiders: [
          { ticker: "TSLA", side: "buy", people: 4, value: 2_400_000, day: "2026-11-10", who: null },
          { ticker: "MSFT", side: "buy", people: 1, value: 40_000, day: "2026-11-10", who: "the CEO" },
        ],
        results: [{ ticker: "NVDA", reportDate: "2026-11-11", movePct: -6.1, epsVerdict: "beat", epsSurprisePct: 3.4 }],
      }),
    );
    for (const finding of all) expect(words(finding.text)).toBeLessThanOrEqual(FINDING_WORDS);
    expect(all.map((finding) => finding.id)).not.toContain("filing:NVDA:2026-11-02");
    // A $40K single buy is too small to count on its own; four insiders buying is a cluster.
    expect(all.find((finding) => finding.ticker === "MSFT")).toBeUndefined();
    expect(all.find((finding) => finding.ticker === "TSLA")).toMatchObject({ figure: "$2.4M", text: "4 insiders bought stock in the past month." });
    expect(all.find((finding) => finding.kind === "results")!.text).toBe("Reported on Wednesday and beat profit forecasts by 3.4%.");
  });
});

function finding(id: string, ticker: string, score: number, kind: Finding["kind"] = "move"): Finding {
  return { id, kind, ticker, figure: "+1%", figureLabel: "x", tone: "up", text: "x", lead: "it moved", day: TODAY, source: "x", href: "/", score, held: true };
}

describe("pickFindings", () => {
  it("shows a count that fills the rows beside the decision card", () => {
    const many = Array.from({ length: 9 }, (_, index) => finding(`f${index}`, `T${index}`, 90 - index, (["call", "move", "report", "filing", "level", "insider", "results", "call", "move"] as const)[index]));
    expect(pickFindings(many)).toHaveLength(5);
    expect(pickFindings(many.slice(0, 4))).toHaveLength(3);
    for (let size = 0; size <= 9; size += 1) expect(SHOWN_COUNTS).toContain(pickFindings(many.slice(0, size)).length as (typeof SHOWN_COUNTS)[number]);
  });

  it("leaves out what does not matter, and keeps one per stock and at most three of a kind", () => {
    const list = [
      finding("a", "NVDA", 95, "call"),
      finding("b", "NVDA", 90, "move"),
      finding("c", "NVDA", 88, "report"),
      finding("d", "AAPL", 87, "move"),
      finding("e", "TSLA", 86, "move"),
      finding("f", "MSFT", 85, "move"),
      finding("g", "AMD", 30, "filing"),
    ];
    expect(pickFindings(list).map((item) => item.id)).toEqual(["a", "d", "e"]);
  });
});

describe("decide", () => {
  it("names the stock to look at first when something is urgent", () => {
    const shown = [finding("a", "NVDA", URGENT + 10), finding("b", "AAPL", URGENT + 2), finding("c", "TSLA", 60)];
    expect(decide({ shown, stocks: 6, complete: true, missing: 0, sources: 8 })).toEqual({ urgent: true, figure: "2 need a look", text: "Look at NVDA first: it moved." });
  });

  it("says nothing urgent and names what is worth knowing", () => {
    const decision = decide({ shown: [finding("a", "AAPL", 60)], stocks: 3, complete: true, missing: 0, sources: 8 });
    expect(decision).toEqual({ urgent: false, figure: "Nothing urgent", text: "Worth knowing: AAPL, it moved." });
  });

  it("says plainly when there is nothing at all", () => {
    const decision = decide({ shown: [], stocks: 4, complete: true, missing: 0, sources: 8 });
    expect(decision.urgent).toBe(false);
    expect(decision.figure).toBe("Nothing urgent");
    expect(decision.text).toBe("Nothing on your 4 stocks needs you today.");
    expect(words(decision.text)).toBeLessThanOrEqual(FINDING_WORDS);
  });

  it("never calls a look that could not read its sources quiet", () => {
    expect(decide({ shown: [], stocks: 4, complete: false, missing: 6, sources: 8 }).figure).toBe("Partial look");
    expect(decide({ shown: [], stocks: 1, complete: false, missing: 1, sources: 8 }).text).toBe("Nothing needs you in what I could read on your 1 stock.");
  });

  it("the facts end to end: nothing found is a decision too", () => {
    const shown = pickFindings(findingsFrom(facts({ weekMoves: { NVDA: { pct: 1.2, to: TODAY, marketPct: 0.5, reason: null } } })));
    expect(shown).toEqual([]);
    expect(decide({ shown, stocks: 4, complete: true, missing: 0, sources: 8 }).text).toBe("Nothing on your 4 stocks needs you today.");
  });
});

describe("callMix", () => {
  it("counts our calls, and is null without any", () => {
    expect(callMix({})).toBeNull();
    expect(
      callMix({ A: { call: "Add", addBelow: null, trimAbove: null }, B: { call: "Hold", addBelow: null, trimAbove: null }, C: { call: "Hold", addBelow: null, trimAbove: null } }),
    ).toEqual({ buyMore: 1, keep: 2, sellSome: 0 });
  });
});

describe("level groups", () => {
  it("says several stocks at their buy-more price once, on one card", () => {
    const all = findingsFrom(
      facts({
        calls: { NVDA: { call: "Add", addBelow: 150, trimAbove: null }, MSFT: { call: "Add", addBelow: 402, trimAbove: null }, TSLA: { call: "Add", addBelow: 300, trimAbove: null } },
        quotes: { NVDA: { price: 148, dayPct: -1 }, MSFT: { price: 400, dayPct: 0 }, TSLA: { price: 305, dayPct: 2 } },
      }),
    );
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: "level", ticker: "NVDA", also: ["MSFT", "TSLA"], figure: "3 stocks" });
    expect(all[0]!.text).toBe("At or near the price where our call says buy more.");
    expect(decide({ shown: all, stocks: 4, complete: true, missing: 0, sources: 8 }).text).toBe("Look at NVDA, MSFT and TSLA first: they are near their buy-more price.");
  });
});

describe("a long level group", () => {
  it("says how many in the decision rather than naming them all", () => {
    const tickers = ["NVDA", "AAPL", "TSLA", "MSFT", "AMD"];
    const all = findingsFrom(
      facts({
        stocks: tickers.map((ticker) => ({ ticker, instrumentId: `US_${ticker}`, held: true })),
        calls: Object.fromEntries(tickers.map((ticker) => [ticker, { call: "Add" as const, addBelow: 100, trimAbove: null }])),
        quotes: Object.fromEntries(tickers.map((ticker) => [ticker, { price: 99, dayPct: 0 }])),
      }),
    );
    const decision = decide({ shown: pickFindings(all), stocks: 5, complete: true, missing: 0, sources: 8 });
    expect(decision.text).toBe("5 of your stocks are at or near their buy-more price.");
  });

  it("starts the decision on a single stock when one is urgent too", () => {
    const group = { ...finding("g", "NVDA", 95, "level"), also: ["AAPL", "TSLA", "MSFT"] };
    expect(decide({ shown: [group, finding("r", "AMD", 88, "report")], stocks: 9, complete: true, missing: 0, sources: 8 }).text).toBe("Look at AMD first: it moved.");
  });
});

describe("one card per stock", () => {
  it("counts the stocks a grouped card names, so none of them shows twice", () => {
    const group = { ...finding("g", "NVDA", 95, "level"), also: ["AAPL"] };
    expect(pickFindings([group, finding("r", "AAPL", 90, "report"), finding("m", "TSLA", 80, "move")]).map((item) => item.id)).toEqual(["g", "m"]);
  });

  it("keeps a call to Sell some on a stock they only watch out of the urgent pile", () => {
    const all = findingsFrom(facts({ calls: { TSLA: { call: "Trim", addBelow: null, trimAbove: null } }, callChanges: { TSLA: { day: TODAY, from: "Keep", to: "Sell some" } } }));
    expect(all[0]!.score).toBeLessThan(URGENT);
  });
});

describe("Needs you", () => {
  it("leaves out a stock Needs you already asks about, any event on it, and keeps it out of a level group", () => {
    const all = findingsFrom(
      facts({
        results: [{ ticker: "NVDA", reportDate: "2026-11-10", movePct: -8.7, epsVerdict: "miss", epsSurprisePct: 7.3 }],
        weekMoves: { NVDA: { pct: 14.2, to: TODAY, marketPct: 3.3, reason: null } },
        reports: [{ ticker: "AAPL", date: "2026-11-17", session: "amc", usualPct: null }],
        calls: { TSLA: { call: "Add", addBelow: 300, trimAbove: null }, MSFT: { call: "Add", addBelow: 402, trimAbove: null } },
        quotes: { TSLA: { price: 299, dayPct: 0 }, MSFT: { price: 400, dayPct: 0 } },
        needsYou: [
          { kind: "results", ticker: "NVDA" },
          { kind: "level_reached", ticker: "TSLA" },
          { kind: "agent_pause", ticker: null },
        ],
      }),
    );
    expect(all.map((finding) => finding.id).sort()).toEqual(["level:MSFT:buy", "report:AAPL:2026-11-17"]);
    expect(all.find((finding) => finding.kind === "level")!.also).toBeUndefined();
  });
});
