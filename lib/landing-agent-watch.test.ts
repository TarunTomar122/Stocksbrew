import { describe, expect, it } from "vitest";

import type { Comparison } from "@/lib/filing-changes/diff";
import type { FilingChangesDoc } from "@/lib/filing-changes/store";
import { rollUp } from "@/lib/thesis-monitor/check";
import { judgeConditions, wordCount, type ConditionInputs } from "@/lib/thesis-watch/conditions";

import {
  CARD_WORDS,
  EXAMPLE_LINES,
  askOf,
  earningsSentence,
  lineAsk,
  pickEarningsCard,
  pickFilingCard,
  pickLineCard,
  pickMoveCard,
  replayCard,
  spanWords,
  thesisSentence,
  type WatchCard,
} from "./landing-agent-watch";

const TODAY = "2026-11-13";

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/${filed}.htm`, headings: 40 },
    base: { form: "10-K", accession: "acc-base", filed: "2025-02-05", period: null, url: "https://www.sec.gov/base.htm", headings: 42 },
    added: [],
    dropped: [],
    reworded: [],
    same: 38,
    reason: null,
    ...patch,
  };
}

function doc(ticker: string, latest: Comparison, history: Comparison[] = []): FilingChangesDoc {
  return { version: 1, ticker, company: ticker, cik: 1, latest, history, updated_at: "2026-11-13T00:00:00Z", source: "SEC EDGAR" };
}

const LONG =
  "Issues related to artificial intelligence may result in reputational, competitive and financial harm to the Company, regulatory action, legal liability, and other adverse effects to the Company's business.";

describe("pickFilingCard", () => {
  it("takes the newest filing whose added risk fits a card line, skipping one that can't be quoted", () => {
    const card = pickFilingCard(
      [
        doc("AAPL", comparison("10-K", "2026-11-03", { added: [LONG] })),
        doc("NVDA", comparison("10-Q", "2026-08-26", { added: ["Our indebtedness may adversely affect our financial condition."] })),
        doc("AMD", comparison("10-K", "2026-02-04", { added: ["We may be required to satisfy obligations under guarantees."] })),
      ],
      TODAY,
    );
    expect(card).toMatchObject({ ticker: "NVDA", form: "10-Q", filed: "2026-08-26", op: "added", count: 1 });
    expect(wordCount(card!.quote)).toBeLessThanOrEqual(CARD_WORDS);
  });

  it("never stands a dropped risk in for a new one, and shows nothing when no heading fits or nothing changed", () => {
    expect(pickFilingCard([doc("PLTR", comparison("10-K", "2026-02-17", { dropped: ["Our stock price may be volatile."] }))], TODAY)).toBeNull();
    expect(pickFilingCard([doc("AAPL", comparison("10-K", "2026-11-03", { added: [LONG] }))], TODAY)).toBeNull();
    expect(pickFilingCard([doc("LLY", comparison("10-Q", "2026-10-29", { status: "no_changes" }))], TODAY)).toBeNull();
    expect(pickFilingCard([], TODAY)).toBeNull();
  });

  it("never leads with a change older than the stock page shows", () => {
    expect(pickFilingCard([doc("OLD", comparison("10-K", "2025-06-01", { added: ["Old news is here now."] }))], TODAY)).toBeNull();
  });
});

const REPORT = { date: "2026-11-02", quarter: "Q4", acceptedAt: "2026-11-02T21:30:00Z", url: null };

function inputs(ticker: string, values: ConditionInputs["values"], report = REPORT): ConditionInputs {
  return { ticker, report, values };
}

const fig = (value: number, asOf = "2026-11-03T02:00:00Z") => ({ value, asOf, source: "stored", href: null });

describe("pickLineCard", () => {
  it("shows the line with the newest report, with its figure, bar and a sentence in budget", () => {
    const judged = [
      { ticker: "AAPL", result: judgeConditions([{ metric: "gross_margin", op: "above", value: 45 }], inputs("AAPL", { gross_margin: fig(48.8) }), TODAY)[0]! },
      {
        ticker: "NVDA",
        result: judgeConditions(
          [{ metric: "revenue_growth", op: "above", value: 40 }],
          inputs("NVDA", { revenue_growth: fig(83.4, "2026-08-27T02:00:00Z") }, { ...REPORT, date: "2026-08-26", quarter: "Q2", acceptedAt: "2026-08-26T20:00:00Z" }),
          TODAY,
        )[0]!,
      },
    ];
    const card = pickLineCard(judged)!;
    expect(card).toMatchObject({ ticker: "AAPL", holds: true, nowText: "49%", holdsIf: "Holds if gross margin > 45%", when: "Q4 report, Nov 2" });
    expect(card.scale).toMatchObject({ from: 0, to: 100 });
    expect(lineAsk(card.ticker, card.condition)).toBe("Tell me if AAPL's gross margin drops under 45%.");
  });

  it("leaves out a line still waiting for its figure", () => {
    // The figure is from before the report landed: the line waits.
    const waiting = judgeConditions([{ metric: "gross_margin", op: "above", value: 45 }], inputs("AAPL", { gross_margin: fig(48.8, "2026-10-20T00:00:00Z") }), TODAY)[0]!;
    expect(waiting.status).toBe("unknown");
    expect(pickLineCard([{ ticker: "AAPL", result: waiting }])).toBeNull();
    expect(pickLineCard([])).toBeNull();
  });
});

describe("replayCard", () => {
  const runs = (decisions: Array<"propose" | "nothing" | "could_not_check">) =>
    decisions.map((decision, index) => ({ day: `2026-10-${String(16 + index).padStart(2, "0")}`, decision })).reverse();

  it("marks each day oldest first and names each change once with the first reason", () => {
    const card = replayCard("AI capex", "ai-capex", {
      from: "2026-10-16",
      to: "2026-10-20",
      runs: runs(["propose", "propose", "nothing", "could_not_check", "nothing"]),
      proposals: [
        { op: "drop", ticker: "NVDA", line: "Revenue growth slowed to 71%, from 114%." },
        { op: "add", ticker: "MOD", line: "Revenue growth: +23%." },
        { op: "drop", ticker: "NVDA", line: "Again." },
      ],
    })!;
    expect(card.marks).toEqual([true, true, false, false, false]);
    expect(card.changeDays).toBe(2);
    // The day it could not check is not counted.
    expect(card.checked).toBe(4);
    expect(card.changes).toEqual([
      { op: "drop", ticker: "NVDA" },
      { op: "add", ticker: "MOD" },
    ]);
    expect(card.line).toBe("Would have said: drop NVDA, add MOD. Revenue growth slowed to 71%, from 114%.");
    expect(card).toMatchObject({ from: "2026-10-16", to: "2026-10-20" });
  });

  it("says a quiet replay plainly, and is left out with no days", () => {
    expect(replayCard("AI capex", "ai-capex", { from: "", to: "", runs: runs(["nothing", "nothing"]), proposals: [] })!.line).toBe("No change proposed in 2 market days.");
    expect(replayCard("AI capex", "ai-capex", { from: "", to: "", runs: [], proposals: [] })).toBeNull();
  });

  it("drops the reason when the line would run over the budget", () => {
    const card = replayCard("X", "x", {
      from: "",
      to: "",
      runs: runs(["propose"]),
      proposals: [{ op: "drop", ticker: "AAA", line: "A very long reason that goes on and on well past the fifteen word budget for a card." }],
    })!;
    expect(card.line).toBe("Would have said: drop AAA.");
  });
});

describe("thesisSentence", () => {
  it("says the lines and the newest risk filing in day words, within budget", () => {
    const risk = { ticker: "AAPL", form: "10-K", filed: "2026-11-03", added: 1 };
    expect(thesisSentence({ lines: 4, holds: 4, broke: 0, risk, today: TODAY })).toBe("All 4 lines hold, but AAPL's 10-K added a risk on Nov 3.");
    expect(thesisSentence({ lines: 4, holds: 4, broke: 0, risk: { ...risk, filed: "2026-11-12" }, today: TODAY })).toBe("All 4 lines hold, but AAPL's 10-K added a risk yesterday.");
    expect(thesisSentence({ lines: 4, holds: 2, broke: 1, risk: { ...risk, added: 2 }, today: TODAY })).toBe("1 of 4 lines broke, and AAPL's 10-K added 2 risks on Nov 3.");
    expect(thesisSentence({ lines: 4, holds: 3, broke: 0, risk: null, today: TODAY })).toBe("3 of 4 lines hold, and no new risks filed.");
    // Nothing judged yet: never "0 of 4 lines hold".
    expect(thesisSentence({ lines: 4, holds: 0, broke: 0, risk: null, today: TODAY })).toBe("Waiting for the figures on all 4 lines.");
    expect(thesisSentence({ lines: 4, holds: 0, broke: 0, risk, today: TODAY })).toBe("Waiting for figures; AAPL's 10-K added a risk.");
  });

  it("agrees with the thesis monitor's rollup on the example lines", () => {
    const verdicts = EXAMPLE_LINES.map(({ ticker }) => ({ ticker, status: "holds" as const }));
    expect(rollUp(verdicts, []).status).toBe("holds");
    expect(rollUp(verdicts, [{ ticker: "AAPL" }]).status).toBe("strain");
  });
});

describe("spanWords", () => {
  it("names a span once", () => {
    expect(spanWords("2026-10-16", "2026-11-12")).toBe("Oct 16 – Nov 12");
    expect(spanWords("2026-11-12", "2026-11-12")).toBe("Nov 12");
  });
});

describe("earnings ahead and the big move", () => {
  const position = (ticker: string, kind: string, date: string | null) => ({ ticker, kind, nextEarnings: date ? { date, time: "amc" as const } : null });

  it("takes the holding that reports next, never a past date or a watched name", () => {
    const card = pickEarningsCard([position("COST", "holding", "2026-12-10"), position("NVDA", "holding", "2026-11-17"), position("AMD", "watchlist", "2026-11-14"), position("JPM", "holding", "2026-10-13")], TODAY);
    expect(card).toEqual({ kind: "earnings", ticker: "NVDA", date: "2026-11-17", time: "amc" });
    expect(earningsSentence(card!, TODAY)).toBe("NVDA reports on Tuesday, after the close.");
    expect(pickEarningsCard([position("JPM", "holding", null)], TODAY)).toBeNull();
    // A report weeks away is not "a few days before".
    expect(pickEarningsCard([position("COST", "holding", "2026-12-10")], TODAY)).toBeNull();
  });

  it("takes the newest run that found a move, with the move's own day", () => {
    const runs = [
      { day: "2026-11-12", decision: "nothing", findings: [] },
      { day: "2026-11-11", decision: "notify", findings: [{ ticker: "NVDA", headline: "NVDA fell 5.47% in a day", change_pct: -5.47, at: "2026-11-10" }] },
    ];
    expect(pickMoveCard(runs)).toEqual({ kind: "move", ticker: "NVDA", pct: -5.47, day: "2026-11-10", headline: "NVDA fell 5.47% in a day", ranOn: "2026-11-11" });
    // The biggest move of a run that found several.
    const several = [{ day: "2026-11-11", decision: "notify", findings: [{ ticker: "AAPL", headline: "AAPL rose 5.1% in a day", change_pct: 5.1, at: "2026-11-10" }, { ticker: "NVDA", headline: "NVDA fell 7% in a day", change_pct: -7, at: "2026-11-10" }] }];
    expect(pickMoveCard(several)?.ticker).toBe("NVDA");
    expect(pickMoveCard([runs[0]!])).toBeNull();
  });
});

describe("the requests", () => {
  it("keeps every request short and in plain words", () => {
    const cards: WatchCard[] = [
      { kind: "earnings", ticker: "NVDA", date: "2026-11-17", time: "amc" },
      { kind: "move", ticker: "NVDA", pct: -5.47, day: "2026-11-10", headline: "NVDA fell 5.47% in a day", ranOn: "2026-11-11" },
      { kind: "filing", ticker: "NVDA", form: "10-Q", filed: "2026-08-26", url: "", op: "added", count: 1, quote: "Our debt may hurt us." },
      { kind: "replay", name: "AI capex", slug: "ai-capex", from: "", to: "", marks: [], checked: 0, changeDays: 0, changes: [], line: "" },
      { kind: "thesis", name: "Big tech keeps growing", status: "holds", lines: 4, holds: 4, broke: 0, companies: [], line: "" },
    ];
    for (const card of cards) expect(wordCount(askOf(card)), askOf(card)).toBeLessThanOrEqual(12);
    expect(lineAsk("NVDA", { metric: "revenue_growth", op: "above", value: 40 })).toBe("Tell me if NVDA's revenue growth drops under 40%.");
    expect(lineAsk("XOM", { metric: "pe", op: "below", value: 30 })).toBe("Tell me if XOM's P/E rises over 30.");
  });
});
