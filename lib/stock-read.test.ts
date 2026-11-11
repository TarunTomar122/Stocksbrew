import { describe, expect, it } from "vitest";

import { buildStockRead, callSince, matchingCompanyReason, previousCall, stabilityFromState } from "@/lib/stock-read";
import type { CallStabilityStateDoc, StockIntelligenceDoc } from "@/lib/stock";

const base = {
  instrument_id: "US_NVDA",
  headline: "Leadership scrutiny competes with growth",
  body: "Nvidia fell as its board opened a review.",
  generated_at: "2026-11-09T15:15:10+00:00",
  key_points: ["Growth is still far ahead of peers.", "A fourth point."],
  evidence_history: { article_count: 19, source_count: 14 },
  directive_v2: {
    stance: "hold",
    confidence: "medium",
    horizon: "weeks",
    action: { label: "Hold here", summary: "Keep the position; do not add." },
    zones: { accumulate_below: 177.59, trim_above: 310.62 },
    invalidation: "Revisit if momentum breaks.",
    watch_out: "Revisit if momentum breaks.",
    evidence: [
      { type: "driver", text: "Revenue is growing faster than peers." },
      { type: "driver", text: "Rubin is rated above competing chips." },
      { type: "risk", text: "A damaging finding could weaken trust." },
    ],
  },
} as unknown as StockIntelligenceDoc;

describe("buildStockRead", () => {
  it("returns null when there is no brief", () => {
    expect(buildStockRead(null)).toBeNull();
    expect(buildStockRead({ instrument_id: "US_X" })).toBeNull();
  });

  it("prefers the stock-specific call reason and falls back to the old summary", () => {
    expect(buildStockRead(base)!.actionSummary).toBe("Keep the position; do not add.");
    const withReason = {
      ...base,
      directive_v2: { ...base.directive_v2, call_reason: "Nvidia is down 6% this week, so we'd hold rather than add." },
    } as unknown as StockIntelligenceDoc;
    expect(buildStockRead(withReason)!.actionSummary).toBe("Nvidia is down 6% this week, so we'd hold rather than add.");
  });

  it("puts the company reason under the call only when it was written for the same call", () => {
    const companyReason = {
      text: "NVIDIA fell 18% over the past week, far more than other chip stocks (down 3.3%), even though its sales grew 83% over the past year. The Nov 17 report decides the next step.",
      call: "Hold" as const,
      source: "company",
    };
    const withBriefReason = {
      ...base,
      directive_v2: { ...base.directive_v2, call_reason: "Nvidia is down 6% this week, so we'd hold rather than add." },
    } as unknown as StockIntelligenceDoc;
    expect(buildStockRead(withBriefReason, { companyReason })!.actionSummary).toBe(companyReason.text);
    // Written for another call (the brief changed since the snapshot): the brief's own line stays.
    expect(buildStockRead(withBriefReason, { companyReason: { ...companyReason, call: "Add" } })!.actionSummary).toBe(
      "Nvidia is down 6% this week, so we'd hold rather than add.",
    );
    // The template a row carries when its numbers said too little is not a company reason.
    expect(buildStockRead(base, { companyReason: { ...companyReason, source: "template" } })!.actionSummary).toBe("Keep the position; do not add.");
    expect(buildStockRead(base, { companyReason: null })!.actionSummary).toBe("Keep the position; do not add.");
  });

  it("drops sector-wide lines from what would change the call once a company reason is shown", () => {
    const withSector = {
      ...base,
      visual_cards: { risk_cards: [{ risk: "Technology sector keeps weakening", trigger: "Technology breadth remains weak" }] },
    } as unknown as StockIntelligenceDoc;
    expect(buildStockRead(withSector)!.changers).toContain("Technology breadth remains weak");
    const read = buildStockRead(withSector, { companyReason: { text: "NVIDIA fell 18% over the past week.", call: "Hold", source: "company" } })!;
    expect(read.changers).toEqual(["A damaging finding could weaken trust."]);
  });

  it("splits evidence into reasons and what would change the call", () => {
    const read = buildStockRead(base)!;
    expect(read.call).toBe("Hold");
    expect(read.actionLabel).toBe("Hold here");
    expect(read.reasons).toEqual([
      "Revenue is growing faster than peers.",
      "Rubin is rated above competing chips.",
      "Growth is still far ahead of peers.",
    ]);
    expect(read.changers).toEqual(["A damaging finding could weaken trust.", "Revisit if momentum breaks."]);
    expect(read.confidence).toBe("medium");
    expect(read.zones).toEqual({ addBelow: 177.59, addAbove: null, trimAbove: 310.62 });
    expect(read.articleCount).toBe(19);
    expect(read.sourceCount).toBe(14);
    expect(read.writtenAt).toBe("2026-11-09T15:15:10+00:00");
    expect(read.changed).toBeNull();
  });

  it("never repeats a point and caps each list at three", () => {
    const read = buildStockRead({
      ...base,
      key_points: ["Revenue is growing faster than peers", "b", "c", "d"],
    } as StockIntelligenceDoc)!;
    expect(read.reasons).toHaveLength(3);
    expect(new Set(read.reasons).size).toBe(3);
    expect(read.reasons).not.toContain("Revenue is growing faster than peers");
  });

  it("drops a body that only repeats the headline and reports a changed call", () => {
    const read = buildStockRead({
      instrument_id: "US_X",
      headline: "Same line.",
      body: "Same line",
      directive_v2: { stance: "accumulate", changed_from_previous: true, change_reason: "Earnings beat.", zones: { accumulate_below: 0 } },
    })!;
    expect(read.body).toBeNull();
    expect(read.call).toBe("Add");
    expect(read.changed).toEqual({ reason: "Earnings beat.", from: null });
    expect(read.zones.addBelow).toBeNull();
    expect(read.confidence).toBeNull();
  });
});

describe("dated company reasons expire", () => {
  const text = "NVIDIA fell 18% over the past week, far more than other chip stocks. The Nov 17 report decides what we do: we'd buy more if sales keep growing this fast.";
  it("keeps the plan until the report date", async () => {
    const { dropPastDatedSentences } = await import("./stock-read");
    expect(dropPastDatedSentences(text, "2026-11-17")).toBe(text);
  });
  it("drops the plan once the report has passed, keeping the evidence", async () => {
    const { dropPastDatedSentences } = await import("./stock-read");
    expect(dropPastDatedSentences(text, "2026-11-18")).toBe("NVIDIA fell 18% over the past week, far more than other chip stocks.");
  });
  it("reads a December report named in January as last year's", async () => {
    const { dropPastDatedSentences } = await import("./stock-read");
    expect(dropPastDatedSentences("The Dec 16 report decides what we do.", "2027-01-05")).toBe("");
  });

  it("names the call before when the ledger switched into this call near the brief", () => {
    const doc = {
      instrument_id: "US_X",
      headline: "Line.",
      generated_at: "2026-11-10T21:30:00Z",
      directive_v2: { stance: "hold", changed_from_previous: true, change_reason: "", zones: {} },
    } as StockIntelligenceDoc;
    const read = buildStockRead(doc, { callChanges: [{ date: "2026-03-01", from: null, to: "Add" }, { date: "2026-11-09", from: "Add", to: "Hold" }] })!;
    expect(read.changed).toEqual({ reason: null, from: "Add" });
  });
});

describe("previousCall", () => {
  const changes = [
    { date: "2026-01-05", from: null, to: "Trim" as const },
    { date: "2026-11-09", from: "Trim" as const, to: "Add" as const },
  ];
  it("gives the call before a recent switch into the current call", () => {
    expect(previousCall(changes, "Add", "2026-11-10T21:30:00Z")).toBe("Trim");
  });
  it("is null when the last switch went somewhere else, is old, or there is no brief time", () => {
    expect(previousCall(changes, "Hold", "2026-11-10T21:30:00Z")).toBeNull();
    expect(previousCall(changes, "Add", "2026-12-10T21:30:00Z")).toBeNull();
    expect(previousCall(changes, "Add", null)).toBeNull();
    expect(previousCall([{ date: "2026-11-09", from: null, to: "Add" }], "Add", "2026-11-10T21:30:00Z")).toBeNull();
  });
});

describe("callSince", () => {
  const changes = [
    { date: "2026-10-01", from: null, to: "Add" as const },
    { date: "2026-10-20", from: "Add" as const, to: "Hold" as const },
  ];

  it("uses the steady call's own date first", () => {
    expect(callSince(changes, "Hold", { stabilitySince: "2026-09-02" })).toBe("2026-09-02");
  });

  it("prefers the ledger over a steady call that only started when the rule was switched on", () => {
    expect(callSince(changes, "Hold", { stabilitySince: "2026-11-12", stabilityTrigger: "start" })).toBe("2026-10-20");
    expect(callSince(changes, "Hold", { stabilitySince: "2026-11-12", stabilityTrigger: "confirmed" })).toBe("2026-11-12");
  });

  it("falls back to the last switch into the current call in the ledger", () => {
    expect(callSince(changes, "Hold")).toBe("2026-10-20");
    expect(callSince([{ date: "2026-10-01", from: null, to: "Add" }], "Add")).toBe("2026-10-01");
  });

  it("gives the brief's own New York day when the ledger has not caught up", () => {
    expect(callSince(changes, "Trim", { writtenAt: "2026-11-10T20:45:00+00:00" })).toBe("2026-11-10");
    expect(callSince([], null)).toBeNull();
  });
});

describe("steady call", () => {
  const steady = {
    ...base,
    directive_v2: {
      ...base.directive_v2,
      watch_out: "We plan to hold this call until at least Dec 2; before then only a results report could change it.",
      invalidation: "We plan to hold this call until at least Dec 2; before then only a results report could change it.",
      stability: {
        since: "2026-11-04",
        since_reason: "Nvidia reported results on Nov 3, so we moved our call from Buy more to Keep.",
        trigger: "earnings",
        what_would_change: "We plan to hold this call until at least Dec 2; before then only a results report could change it.",
        held_against_vote: true,
        vote: "Trim",
      },
    },
  } as unknown as StockIntelligenceDoc;

  it("carries the steady call's date and its rule, and keeps the rule out of the lower list", () => {
    const read = buildStockRead(steady, { callChanges: [{ date: "2026-10-01", from: null, to: "Hold" }] })!;
    expect(read.since).toBe("2026-11-04");
    expect(read.whatWouldChange).toMatch(/^We plan to hold this call until at least Dec 2/);
    expect(read.changers.some((item) => item.startsWith("We plan"))).toBe(false);
    expect(read.heldAgainst).toBe("Trim");
    expect(read.steadySince).toBe("2026-11-04");
  });

  it("is null on a brief without the steady call", () => {
    expect(buildStockRead(base)!.whatWouldChange).toBeNull();
    expect(buildStockRead(base)!.heldAgainst).toBeNull();
    expect(buildStockRead(base)!.steadySince).toBeNull();
  });
});

describe("steady call from its stored state", () => {
  // tm_call_stability/US_NVDA as the backend stores it (only the fields the page reads, plus a few it ignores).
  const state: CallStabilityStateDoc & Record<string, unknown> = {
    version: "stability-1",
    call: "Hold",
    since: "2026-11-04",
    since_reason: "Nvidia reported results on Nov 3, so we moved our call from Buy more to Keep.",
    since_trigger: "earnings",
    levels: { accumulate_below: 177.59, set_on: "2026-11-04" },
    session: "2026-11-10",
    votes: [{ day: "2026-11-10", call: "Trim" }],
    rev: 3,
  };

  it("maps the state to the brief's stability shape when its call is the brief's", () => {
    expect(stabilityFromState(state, "Hold")).toEqual({
      version: "stability-1",
      since: "2026-11-04",
      since_reason: "Nvidia reported results on Nov 3, so we moved our call from Buy more to Keep.",
      trigger: "earnings",
      what_would_change: null,
      levels_set_on: "2026-11-04",
      held_against_vote: null,
      vote: null,
    });
  });

  it("is null when the calls differ, the version is unknown, or the date is not a day", () => {
    expect(stabilityFromState(state, "Add")).toBeNull();
    expect(stabilityFromState(state, null)).toBeNull();
    expect(stabilityFromState({ ...state, version: "stability-2" }, "Hold")).toBeNull();
    expect(stabilityFromState({ ...state, since: "soon" }, "Hold")).toBeNull();
    expect(stabilityFromState(null, "Hold")).toBeNull();
    expect(stabilityFromState({ ...state, since_trigger: "whim", levels: null }, "Hold")).toMatchObject({ trigger: null, levels_set_on: null });
  });

  it("gives a brief without stability the steady call's day", () => {
    const read = buildStockRead(base, { steadyState: state, callChanges: [{ date: "2026-10-01", from: null, to: "Hold" }] })!;
    expect(read.steadySince).toBe("2026-11-04");
    expect(read.since).toBe("2026-11-04");
    // The state keeps no sentence of what would change the call, and no vote to hold against.
    expect(read.whatWouldChange).toBeNull();
    expect(read.heldAgainst).toBeNull();
    // So the brief's own lines stay in the list, as they did before.
    expect(read.changers).toContain("Revisit if momentum breaks.");
  });

  it("leaves the brief as it is when the steady call has moved on", () => {
    const read = buildStockRead(base, { steadyState: { ...state, call: "Trim" } })!;
    expect(read.steadySince).toBeNull();
    expect(read.since).toBeNull();
  });

  it("never overrides a brief that carries its own stability", () => {
    const own = {
      ...base,
      directive_v2: { ...base.directive_v2, stability: { since: "2026-11-06", trigger: "confirmed", what_would_change: "Rule sentence." } },
    } as unknown as StockIntelligenceDoc;
    const read = buildStockRead(own, { steadyState: state })!;
    expect(read.steadySince).toBe("2026-11-06");
    expect(read.whatWouldChange).toBe("Rule sentence.");
  });

  it("takes the step from the state's own changes, not the ledger", () => {
    // Seeded the day the ledger flipped: the rule made no move that day, so falls still count inside the hold.
    const seeded = { ...state, since: "2026-11-05", since_trigger: "start", changes: [] };
    expect(buildStockRead(base, { steadyState: seeded })!.steadyStep).toBe(0);
    const down = { ...state, changes: [{ date: "2026-11-04", from: "Add", to: "Hold", trigger: "earnings" }] };
    expect(buildStockRead(base, { steadyState: down })!.steadyStep).toBe(-1);
    const older = { ...state, changes: [{ date: "2026-10-01", from: "Trim", to: "Hold" }] };
    expect(buildStockRead(base, { steadyState: older })!.steadyStep).toBe(0);
    expect(buildStockRead(base, { steadyState: { ...state, changes: [null, "x"] } })!.steadyStep).toBe(0);
  });

  it("leaves the step to the ledger for a brief's own stability, except a start", () => {
    const own = (trigger: string) =>
      ({ ...base, directive_v2: { ...base.directive_v2, stability: { since: "2026-11-06", trigger } } }) as unknown as StockIntelligenceDoc;
    expect(buildStockRead(own("confirmed"))!.steadyStep).toBeNull();
    expect(buildStockRead(own("start"))!.steadyStep).toBe(0);
    expect(buildStockRead(base)!.steadyStep).toBeNull();
  });

  it("keeps the ledger's longer run when the state only records when the steady call began", () => {
    const seeded = { ...state, since: "2026-11-09", since_trigger: "start" };
    const read = buildStockRead(base, { steadyState: seeded, callChanges: [{ date: "2026-10-01", from: null, to: "Hold" }] })!;
    expect(read.since).toBe("2026-10-01");
    expect(read.steadySince).toBe("2026-11-09");
  });
});

describe("company reason conditions", () => {
  const reason = (text: string) => ({ text, call: "Hold" as const, source: "company" });

  it("drops an old condition nobody can check and keeps the facts", () => {
    const text =
      "NVIDIA fell 18% over the past week, even though its sales grew 83% over the past year. The Nov 17 report decides what we do: we'd buy more if sales keep growing this fast, and sell some if they slow sharply.";
    expect(matchingCompanyReason(reason(text), "Hold", "2026-11-11")).toBe(
      "NVIDIA fell 18% over the past week, even though its sales grew 83% over the past year.",
    );
  });

  it("keeps a condition with a bar in it", () => {
    const text =
      "NVIDIA fell 18% over the past week, even though its sales grew 83% over the past year. The Nov 17 report decides what we do: we'd buy more if sales growth stays above 83%, and sell some if growth falls below 42%.";
    expect(matchingCompanyReason(reason(text), "Hold", "2026-11-11")).toBe(text);
  });
});
