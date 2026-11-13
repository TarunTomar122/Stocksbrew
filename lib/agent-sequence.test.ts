import { describe, expect, it } from "vitest";

import { firstSequence, pickSequenceDraft, runDaysOf, sequenceOf, RUN_DAYS_SHOWN } from "./agent-sequence";
import { candidates, wordCount, type ProposalInputs } from "./proposals";

const TODAY = "2026-11-12";
const NOW = new Date("2026-11-12T22:00:00.000Z");

/** 60 closes ending today, flat at `flat`, with one dip to `low` twenty sessions back. */
function series(flat: number, low: number) {
  const out: Array<{ date: string; close: number }> = [];
  const start = new Date("2026-08-15T12:00:00Z");
  for (let index = 0; index < 60; index += 1) {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, close: index === 40 ? low : flat });
  }
  out[out.length - 1] = { date: TODAY, close: flat };
  return out;
}

/** The example portfolio on the day of the landing's first strip: NVDA fell 5.5% on Tuesday with a sourced reason. */
function inputs(patch: Partial<ProposalInputs> = {}): ProposalInputs {
  return {
    now: NOW,
    today: TODAY,
    plan: "pro",
    stocks: [{ ticker: "NVDA", instrumentId: "US_NVDA", position: "holding" }],
    levels: { NVDA: { add_below: 173.85, trim_above: 310.62 } },
    calls: { NVDA: { call: "Hold", changes: [] } },
    series: { NVDA: series(180, 166.19) },
    quotes: { NVDA: { price: 166.04, dayPct: -4.43, at: "2026-11-12T20:59:00+00:00" } },
    alerts: [],
    practice: {},
    results: [],
    filings: [],
    runs: [
      { id: "r2", job_id: "examplebigmove", job_name: "Big moves", day: "2026-11-12", ran_at: "2026-11-12T22:00:00Z", decision: "nothing", findings: [] },
      {
        id: "r1",
        job_id: "examplebigmove",
        job_name: "Big moves",
        day: "2026-11-11",
        ran_at: "2026-11-11T11:19:08Z",
        decision: "notify",
        findings: [{ ticker: "NVDA", headline: "NVDA fell", kind: "move", change_pct: -5.47, close: 173.7, url: "https://example.com/story", source: "Daily closing prices", at: "2026-11-10" }],
      },
    ],
    jobs: [],
    upcoming: [],
    ...patch,
  };
}

describe("pickSequenceDraft", () => {
  it("takes the engine's strongest proposal that has a stock and a visual", () => {
    const draft = pickSequenceDraft(candidates(inputs()));
    expect(draft?.kind).toBe("big_move");
    expect(draft?.ticker).toBe("NVDA");
  });

  it("returns null when the engine has nothing", () => {
    expect(pickSequenceDraft(candidates(inputs({ runs: [] })))).toBeNull();
    expect(pickSequenceDraft([])).toBeNull();
  });

  it("skips proposals with no stock, such as pausing an agent", () => {
    const draft = pickSequenceDraft(candidates(inputs({ runs: [] })).concat([{ ...candidates(inputs())[0]!, ticker: null }]));
    expect(draft).toBeNull();
  });
});

describe("sequenceOf", () => {
  const run = (patch: Partial<ProposalInputs> = {}, nextCheck: string | null = "2026-11-13") => {
    const all = inputs(patch);
    const draft = pickSequenceDraft(candidates(all))!;
    return sequenceOf(draft, { inputs: all, today: TODAY, nextCheck, runs: all.runs ?? [], levelsAsOf: { NVDA: "2026-11-11" } });
  };

  it("tells the drop as five steps, each with real figures and their days", () => {
    const sequence = run()!;
    expect(sequence.day).toBe("2026-11-10");
    expect(sequence.event.label).toBe("Tuesday's move");
    expect(sequence.event.figure).toMatchObject({ value: "−5.5%", tone: "down", asOf: "2026-11-10" });
    // The price shows in the header and the new alert in the proposal: the checks are what else was weighed.
    // Our call is Keep, so its buy-more level stays out (owner rule 9): the recent low and the price it was held against.
    // The low is of daily closes and the price is the quote, which here sits under a low that closed today: said so.
    expect(sequence.checked.map((figure) => figure.label)).toEqual(["60-day closing low", "Price, under it"]);
    expect(sequence.checked[0]).toMatchObject({ value: "$166.19", asOf: TODAY });
    expect(sequence.checked[1]).toMatchObject({ value: "$166.04", asOf: "2026-11-12T20:59:00+00:00" });
    expect(sequence.proposal).toMatchObject({ label: "Proposed alert", value: "$158", level: { price: 158, label: "Alert" } });
    // A weekday, never "tomorrow": the strip is cached.
    expect(sequence.next).toMatchObject({ label: "Next check", when: "Fri after the close", price: 166.04, dayPct: -4.43 });
    expect(sequence.runs).toEqual([
      { day: "2026-11-11", found: true },
      { day: "2026-11-12", found: false },
    ]);
  });

  it("keeps every step's label within four words", () => {
    for (const sequence of [run()!, run({ calls: { NVDA: { call: "Add", changes: [] } } })!]) {
      for (const words of [sequence.event.label, sequence.proposal.label, sequence.next.label]) expect(wordCount(words)).toBeLessThanOrEqual(4);
    }
  });

  it("labels a price inside the closing range plainly", () => {
    const sequence = run({ series: { NVDA: series(180, 150) }, quotes: { NVDA: { price: 160, dayPct: -1, at: "2026-11-12T20:59:00+00:00" } } })!;
    // The alert sits on the low, so the low is the proposal's level and the price leads the checks.
    expect(sequence.proposal.level).toEqual({ price: 150, label: "60-day low" });
    expect(sequence.checked.map((figure) => figure.label)).toEqual(["Price", "60-day closing low"]);
  });

  it("shows the call's levels under a Buy more call", () => {
    const sequence = run({ calls: { NVDA: { call: "Add", changes: [] } } })!;
    expect(sequence.checked.map((figure) => figure.label)).toEqual(["Buy-more level", "60-day closing low"]);
    expect(sequence.checked[0]).toMatchObject({ value: "$173.85", asOf: "2026-11-11", source: "Our call on NVDA" });
  });

  it("never names or lists a level the call does not show", () => {
    // Keep: the alert may sit on the buy-more level, but the strip calls it only an alert.
    const sequence = run({ levels: { NVDA: { add_below: 150, trim_above: 310 } } })!;
    expect(sequence.proposal.value).toBe("$150");
    expect(sequence.proposal.level).toEqual({ price: 150, label: "Alert" });
    expect(sequence.checked.some((figure) => /level/.test(figure.label))).toBe(false);
    // An unread call shows none either.
    expect(run({ calls: {}, levels: { NVDA: { add_below: 150, trim_above: 310 } } })!.proposal.level?.label).toBe("Alert");
  });

  it("names the level when the alert sits on one", () => {
    // A buy-more level more than 2% under the price is the alert's level.
    const sequence = run({ calls: { NVDA: { call: "Add", changes: [] } }, levels: { NVDA: { add_below: 150, trim_above: 310 } } })!;
    expect(sequence.proposal.level).toEqual({ price: 150, label: "Buy-more level" });
    expect(sequence.checked.some((figure) => figure.value === "$150")).toBe(false);
  });

  it("says when the agents last checked when a next check is not proven", () => {
    expect(run({}, null)!.next).toMatchObject({ label: "Last check", when: "Thu after the close" });
  });

  it("never shows a day's mark twice when the next check is today", () => {
    const sequence = run({}, TODAY)!;
    expect(sequence.next.when).toBe("Thu after the close");
    expect(sequence.runs.map((entry) => entry.day)).toEqual(["2026-11-11"]);
  });

  it("drops a proposal with too little to show as checks", () => {
    const all = inputs({ levels: {}, series: { NVDA: [] } });
    const draft = pickSequenceDraft(candidates(all))!;
    expect(draft).not.toBeNull();
    // Only the price is left to show as a check: one figure is not a check worth a step.
    expect(sequenceOf(draft, { inputs: all, today: TODAY, nextCheck: null })).toBeNull();
  });
});

describe("runDaysOf", () => {
  it("keeps one mark per day, newest days, oldest first, leaving out runs that could not check", () => {
    const runs = [
      { day: "2026-11-05", decision: "nothing" },
      { day: "2026-11-06", decision: "notify" },
      { day: "2026-11-09", decision: "could_not_check" },
      { day: "2026-11-10", decision: "nothing" },
      { day: "2026-11-10", decision: "notify" },
      { day: "2026-11-11", decision: "nothing" },
      { day: "2026-11-12", decision: "nothing" },
      { day: "bad", decision: "notify" },
    ];
    const days = runDaysOf(runs);
    expect(days).toHaveLength(RUN_DAYS_SHOWN);
    expect(days).toEqual([
      { day: "2026-11-06", found: true },
      { day: "2026-11-10", found: true },
      { day: "2026-11-11", found: false },
      { day: "2026-11-12", found: false },
    ]);
  });
});

describe("firstSequence", () => {
  it("passes over a proposal that cannot fill the strip for the next one that can", () => {
    const all = inputs();
    const good = pickSequenceDraft(candidates(all))!;
    // Same proposal with nothing left to check (only the price and the alert): it gives way.
    const thin = { ...good, event: { ...good.event, key: "thin" }, figures: good.figures.filter((entry) => ["Move", "Price", "New alert"].includes(entry.label)) };
    const sequence = firstSequence([thin, good], { inputs: all, today: TODAY, nextCheck: "2026-11-13" });
    expect(sequence?.checked.map((figure) => figure.label)).toEqual(["60-day closing low", "Price, under it"]);
    expect(firstSequence([thin], { inputs: all, today: TODAY, nextCheck: "2026-11-13" })).toBeNull();
  });

  it("tells results with a guidance cut and no move yet by the guidance, not twice", () => {
    const all = inputs({
      runs: [],
      results: [{ ticker: "NVDA", reportDate: "2026-11-11", movePct: null, guidance: "lowered", epsVerdict: "miss", epsSurprisePct: -7.3, revenueVerdict: "beat", sources: [] }],
    });
    const sequence = firstSequence(candidates(all), { inputs: all, today: TODAY, nextCheck: "2026-11-13" })!;
    expect(sequence.kind).toBe("results");
    expect(sequence.event).toMatchObject({ label: "Yesterday's guidance cut", figure: { value: "Lowered" } });
    expect(sequence.checked.map((figure) => figure.label)).not.toContain("Guidance");
  });
});
