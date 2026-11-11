import { describe, expect, it } from "vitest";

import { checkReport, cleanCitations, splitSentences } from "./check";
import type { ResearchBody } from "./types";

const EVIDENCE = {
  facts: {
    financials: { history: [{ period: "TTM", revenue: 302970000000, operating_margin_pct: 65.21, net_margin_pct: 63.66 }], revenue_growth_yoy_pct: 83.38 },
    peers: { self: { pe: 45.2 }, peer_medians: { pe: 31.4 } },
    earnings: { next_report: { date: "2026-11-19" } },
  },
  sources: [{ id: "S1", label: "Financials" }, { id: "S2", label: "Screener" }],
};

function body(patch: Partial<ResearchBody>): ResearchBody {
  return {
    headline: "Revenue grew 83% in the last year [S1].",
    summary: [],
    business: [],
    drivers: [],
    bull: [],
    bear: [],
    valuation: [],
    numbers: [],
    ownership: [],
    risks: [],
    change: [],
    watch: [],
    ...patch,
  };
}

function run(patch: Partial<ResearchBody>) {
  return checkReport({ body: body(patch), evidence: EVIDENCE, sourceIds: new Set(["S1", "S2"]), dates: new Set(["2026-11-19"]) });
}

describe("the numbers check", () => {
  it("keeps figures that round from the evidence", () => {
    const { body: out, audit } = run({ numbers: ["Revenue was $303 billion over the last 12 months [S1]. The operating margin was 65.2% [S1]."] });
    expect(out.numbers).toEqual(["Revenue was $303 billion over the last 12 months [S1]. The operating margin was 65.2% [S1]."]);
    expect(audit.removed).toEqual([]);
    expect(audit.traced).toBe(audit.checked);
  });

  it("removes a sentence whose figure matches nothing, and only that sentence", () => {
    const { body: out, audit } = run({ valuation: ["The P/E is 45.2 [S2]. That is 44% above peers [S2]. Peers sit at 31.4 [S2]."] });
    expect(out.valuation).toEqual(["The P/E is 45.2 [S2]. Peers sit at 31.4 [S2]."]);
    expect(audit.removed).toEqual(["That is 44% above peers [S2]."]);
  });

  it("drops a paragraph and a point that lose every sentence", () => {
    const { body: out } = run({
      drivers: ["Shares rose 19% last week [S1]."],
      bull: [{ title: "Margins of 99%", text: "Margins are 65.2% [S1]." }, { title: "Growth", text: "Revenue grew 83% [S1]." }],
    });
    expect(out.drivers).toEqual([]);
    expect(out.bull).toEqual([{ title: "Growth", text: "Revenue grew 83% [S1]." }]);
  });

  it("never reads a citation marker as a figure", () => {
    const { audit } = run({ business: ["The company sells chips to data centers [S2]."] });
    expect(audit.checked).toBe(1);
  });

  it("keeps only watch dates that appear in the evidence", () => {
    const { body: out } = run({
      watch: [
        { date: "2026-11-19", text: "The next earnings report [S1]." },
        { date: "2026-12-02", text: "An investor day [S1]." },
      ],
    });
    expect(out.watch).toEqual([
      { date: "2026-11-19", text: "The next earnings report [S1]." },
      { date: null, text: "An investor day [S1]." },
    ]);
  });

  it("replaces em dashes with commas", () => {
    const { body: out } = run({ business: ["It sells GPUs — mostly to clouds [S1]."] });
    expect(out.business).toEqual(["It sells GPUs, mostly to clouds [S1]."]);
  });
});

describe("citations", () => {
  it("splits grouped markers and drops unknown ids", () => {
    expect(cleanCitations("Growth was strong [S1, S9, S2].", new Set(["S1", "S2"]))).toEqual({ text: "Growth was strong [S1][S2].", dropped: 1 });
  });

  it("splits sentences without breaking decimals or dollar figures", () => {
    expect(splitSentences("Revenue was $3.4 billion. Margins were 65.2%. $40 targets differ.")).toEqual([
      "Revenue was $3.4 billion.",
      "Margins were 65.2%.",
      "$40 targets differ.",
    ]);
  });
});

describe("figures inside filing text", () => {
  it("traces '$89 billion' to a passage that says '$89.0 billion', but not a day of the month to a percent", () => {
    const evidence = { facts: { quarterly: { mda_highlights: ["Data Center revenue was $89.0 billion, up 117% from a year ago."], filed: "2026-08-26" } } };
    const result = checkReport({
      body: { ...body({}), headline: "Data Center revenue reached $89 billion, up 117% [S1].", summary: ["Shares fell 26% [S1]."] },
      evidence,
      sourceIds: new Set(["S1"]),
      dates: new Set(),
    });
    expect(result.body.headline).toBe("Data Center revenue reached $89 billion, up 117%.");
    expect(result.body.summary).toEqual([]);
  });
});

describe("sentences about our inputs", () => {
  it("drops lines that talk about the evidence or our data instead of the company", () => {
    const evidence = { facts: { brief: { quote: { price: 515.42 } } } };
    const result = checkReport({
      body: {
        ...body({}),
        headline: "The stock closed at $515.42 [S1].",
        summary: ["The stock closed at $515.42 [S1].", "We could not reconcile these two versions from the evidence.", "Our data table shows a miss [S1]."],
        watch: [{ date: null, text: "The next earnings date, which the evidence does not give." }, { date: null, text: "Whether margins hold [S1]." }],
      },
      evidence,
      sourceIds: new Set(["S1"]),
      dates: new Set(),
    });
    expect(result.body.summary).toEqual(["The stock closed at $515.42 [S1]."]);
    expect(result.body.watch).toEqual([{ date: null, text: "Whether margins hold [S1]." }]);
  });
});
