import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

import {
  changedLines,
  holdingsOf,
  parseThesisDraft,
  readThesisSpec,
  readThesisState,
  thesisEditHref,
  thesisHref,
  THESIS_STATE_VERSION,
} from "./model";

const NVDA = { ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] };
const VRT = { ticker: "VRT", conditions: [{ metric: "gross_margin", op: "above", value: 35 }] };

describe("parseThesisDraft: line validation", () => {
  it("keeps the statement, the name and each company's lines, cleaned", () => {
    const result = parseThesisDraft({ statement: "  AI infrastructure   demand keeps growing ", name: "AI infra", lines: [NVDA, { ...VRT, ticker: "vrt" }] });
    expect(result).toEqual({
      ok: true,
      draft: {
        statement: "AI infrastructure demand keeps growing",
        name: "AI infra",
        lines: [
          { ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] },
          { ticker: "VRT", conditions: [{ metric: "gross_margin", op: "above", value: 35 }] },
        ],
      },
    });
  });

  it("refuses a missing or overlong statement, and a thesis with no line", () => {
    expect(parseThesisDraft({ statement: " ", lines: [NVDA] })).toMatchObject({ ok: false, error: "Say the thesis in a sentence." });
    expect(parseThesisDraft({ statement: "x".repeat(281), lines: [NVDA] })).toMatchObject({ ok: false });
    expect(parseThesisDraft({ statement: "AI", lines: [] })).toMatchObject({ ok: false, error: "Give at least one company a line." });
    // A company sent with no lines is left out, not counted.
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: [] }] })).toMatchObject({ ok: false, error: "Give at least one company a line." });
  });

  it("refuses an unknown figure, a side the figure does not take, a number out of bounds and three lines on one company", () => {
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: [{ metric: "vibes", op: "above", value: 1 }] }] })).toMatchObject({ ok: false });
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: [{ metric: "dividend", op: "below", value: 1 }] }] })).toMatchObject({ ok: false });
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: [{ metric: "gross_margin", op: "above", value: 140 }] }] })).toMatchObject({ ok: false });
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: [{ metric: "gross_margin", op: "above", value: Number.NaN }] }] })).toMatchObject({ ok: false });
    const three = [
      { metric: "revenue_growth", op: "above", value: 40 },
      { metric: "gross_margin", op: "above", value: 60 },
      { metric: "pe", op: "below", value: 40 },
    ];
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: three }] })).toEqual({ ok: false, error: "NVDA can have up to 2 lines." });
    // The same figure twice on one company is refused too.
    const twice = [
      { metric: "gross_margin", op: "above", value: 60 },
      { metric: "gross_margin", op: "below", value: 90 },
    ];
    expect(parseThesisDraft({ statement: "AI", lines: [{ ticker: "NVDA", conditions: twice }] })).toMatchObject({ ok: false });
  });

  it("drops bad tickers and keeps the first of a duplicate", () => {
    const result = parseThesisDraft({ statement: "AI", lines: [{ ticker: "not a ticker!", conditions: NVDA.conditions }, NVDA, { ...NVDA, conditions: [{ metric: "pe", op: "below", value: 50 }] }] });
    expect(result.ok && result.draft.lines).toEqual([{ ticker: "NVDA", conditions: [{ metric: "revenue_growth", op: "above", value: 40 }] }]);
  });

  it("refuses more than twelve companies", () => {
    const lines = Array.from({ length: 13 }, (_, index) => ({ ticker: `T${String.fromCharCode(65 + index)}`, conditions: NVDA.conditions }));
    expect(parseThesisDraft({ statement: "AI", lines })).toMatchObject({ ok: false, error: "A thesis spans up to 12 companies." });
  });
});

describe("changedLines", () => {
  it("returns only new or changed lines, so an old line whose figure has gone never blocks a save", () => {
    const before = readThesisSpec({ statement: "AI", lines: [NVDA, { ticker: "KO", conditions: [{ metric: "dividend", op: "above", value: 0.5 }] }] });
    const next = [
      { ticker: "NVDA", conditions: [{ metric: "revenue_growth" as const, op: "above" as const, value: 40 }, { metric: "pe" as const, op: "below" as const, value: 50 }] },
      { ticker: "KO", conditions: [{ metric: "dividend" as const, op: "above" as const, value: 0.5 }] },
      { ticker: "VRT", conditions: [{ metric: "gross_margin" as const, op: "above" as const, value: 35 }] },
    ];
    expect(changedLines(before, next)).toEqual([
      { ticker: "NVDA", conditions: [{ metric: "pe", op: "below", value: 50 }] },
      { ticker: "VRT", conditions: [{ metric: "gross_margin", op: "above", value: 35 }] },
    ]);
    expect(changedLines(null, next)).toHaveLength(3);
  });
});

describe("reading what is stored", () => {
  it("reads a thesis and drops malformed lines; no line left is no thesis", () => {
    expect(readThesisSpec({ statement: "AI", lines: [NVDA, { ticker: "VRT", conditions: [{ metric: "nope" }] }], version: 3 })).toMatchObject({ statement: "AI", lines: [{ ticker: "NVDA" }], version: 3 });
    expect(readThesisSpec({ statement: "AI", lines: [{ ticker: "VRT", conditions: [] }] })).toBeNull();
    expect(readThesisSpec(null)).toBeNull();
  });

  it("reads a state back only for its own person", () => {
    const doc = {
      version: THESIS_STATE_VERSION,
      uid: "u1",
      basket_id: "abc123def456",
      day: "2026-11-13",
      status: "strain",
      status_since: "2026-11-12",
      previous_status: "holds",
      counts: { lines: 3, holds: 2, broke: 1, waiting: 0 },
      affected: ["VRT"],
      lines: [{ ticker: "VRT", records: [] }],
      risks: [{ ticker: "MU", form: "10-Q", filed: "2026-11-10", accession: "a", added: 1, first: null, url: "https://evil.example/x" }],
      events: [{ key: "k", kind: "status", day: "2026-11-12", text: "Now under strain: 1 of 3 lines broke.", status: "strain" }, { kind: "bogus" }],
      history: [{ day: "2026-11-12", status: "strain", holds: 2, broke: 1, waiting: 0 }],
    };
    const state = readThesisState(doc, "u1");
    expect(state).toMatchObject({ status: "strain", previous_status: "holds", affected: ["VRT"] });
    // Only SEC's own address is ever linked.
    expect(state!.risks).toEqual([]);
    expect(state!.events).toHaveLength(1);
    expect(state!.events[0]!.status).toBe("strain");
    expect(readThesisState(doc, "someone-else")).toBeNull();
    expect(readThesisState({ ...doc, version: 99 }, "u1")).toBeNull();
  });
});

describe("holdingsOf", () => {
  it("reads held US stocks in tracking order, marked or with shares", () => {
    expect(
      holdingsOf({
        tracked_stocks: ["US_NVDA", "US_AAPL", "US_BRK_B", "IN_TCS", "US_MSFT", "US_NVDA"],
        watchlist_positions: { US_NVDA: "holding", US_AAPL: "watchlist", IN_TCS: "holding" },
        watchlist_holdings: { US_BRK_B: { quantity: 1 }, US_AAPL: { quantity: 3 } },
      }),
    ).toEqual(["NVDA", "BRK.B"]);
    expect(holdingsOf(null)).toEqual([]);
  });
});

describe("links", () => {
  it("names the thesis page and the editor", () => {
    expect(thesisHref("abc123def456")).toBe("/agents/theses/abc123def456");
    expect(thesisEditHref("holdings")).toBe("/agents/theses/new");
    expect(thesisEditHref({ basket: "abc123def456" })).toBe("/agents/theses/new?basket=abc123def456");
    expect(thesisEditHref({ id: "abc123def456" })).toBe("/agents/theses/abc123def456/edit");
  });
});

describe("a state belongs to one thesis", () => {
  it("is read only for the thesis it was made for: lines taken off and put back start clean", async () => {
    const { stateFits } = await import("./data");
    const state = { basket_id: "abc123def456", spec_created_at: "2026-11-13T00:00:00.000Z" } as never;
    const basket = { id: "abc123def456", thesis: { created_at: "2026-11-13T00:00:00.000Z" } } as never;
    expect(stateFits(state, basket)).toBe(true);
    expect(stateFits(state, { id: "abc123def456", thesis: { created_at: "2026-11-20T00:00:00.000Z" } } as never)).toBe(false);
    expect(stateFits(state, { id: "abc123def456", thesis: null } as never)).toBe(false);
    expect(stateFits(null, basket)).toBe(false);
  });
});
