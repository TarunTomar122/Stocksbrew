import { describe, expect, it } from "vitest";

import type { BriefingItem, BriefingPosition } from "@/lib/briefing";
import { buildDesk, decisionWords, lineAsOf, pairs, settledFact, type DeskInput } from "@/lib/briefing-desk";
import type { DoCard, LevelRow, MovedCard } from "@/lib/briefing-face";
import type { OvernightCard } from "@/lib/briefing-overnight";
import type { Proposal } from "@/lib/proposals";

const TODAY = "2026-11-13";
const NOW = new Date("2026-11-13T15:00:00Z");

function position(overrides: Partial<BriefingPosition> & { ticker: string }): BriefingPosition {
  return {
    instrument_id: `US_${overrides.ticker}`,
    name: `${overrides.ticker} Inc.`,
    relation: "holding",
    price: 100,
    day_change_pct: 1,
    price_as_of: "2026-11-13T15:00:00.000Z",
    stance: "Buy more",
    call_summary: null,
    watch_out: null,
    add_below: 90,
    breakout_above: null,
    trim_above: null,
    earnings_date: null,
    earnings_time: null,
    pre_earnings_headline: null,
    ...overrides,
  };
}

function proposal(overrides: Partial<Proposal> & { id: string; kind: Proposal["kind"]; ticker: string }): Proposal {
  return {
    uid: "u",
    version: 1,
    status: "pending",
    instrument_id: `US_${overrides.ticker}`,
    event: { key: overrides.id, kind: overrides.kind, at: TODAY, refs: [] },
    idea: overrides.id,
    title: `Set an alert on ${overrides.ticker} at $90.00`,
    why: [`${overrides.ticker} reported on Monday and fell 8%.`],
    does: "",
    read: [{ label: `${overrides.ticker} results (Alpha Vantage)`, at: "2026-11-11T23:00:00Z", href: null }],
    figures: [],
    action: { type: "alert_price", ticker: overrides.ticker, instrument_id: `US_${overrides.ticker}`, condition: "below", price: 90, replaces: null },
    priority: 50,
    result: null,
    created_at: "2026-11-12T12:00:00Z",
    expires_at: "2026-11-19T12:00:00Z",
    decided_at: null,
    updated_at: "2026-11-12T12:00:00Z",
    ...overrides,
  };
}

function moved(ticker: string, kind: MovedCard["kind"] = "move", price = 100): MovedCard {
  return { ticker, name: `${ticker} Inc.`, price, pct: -6, call: "Buy more", href: `/stock/${ticker}`, line: `${ticker} fell on a downgrade.`, source: { name: "Reuters", url: null, at: TODAY }, kind };
}

function input(overrides: Partial<DeskInput>): DeskInput {
  return {
    today: TODAY,
    now: NOW,
    waiting: [],
    all: [],
    fresh: true,
    moved: [],
    overnight: [],
    levels: [],
    doCards: [],
    positions: [],
    items: [],
    ...overrides,
  };
}

const words = (day: string) => (day === "2026-11-12" ? "Yesterday" : day);

describe("pairs", () => {
  it("pairs a report by its report day only", () => {
    const results = proposal({ id: "a", kind: "results", ticker: "ASTS", event: { key: "results:ASTS:2026-11-10", kind: "results", at: "2026-11-10", refs: [] } });
    expect(pairs(results, { ticker: "ASTS", source: "moved:results", day: "2026-11-10" }, TODAY)).toBe(true);
    // Another report, or one the page cannot date, is not this one.
    expect(pairs(results, { ticker: "ASTS", source: "moved:results", day: "2026-08-10" }, TODAY)).toBe(false);
    expect(pairs(results, { ticker: "ASTS", source: "moved:results", day: null }, TODAY)).toBe(false);
    expect(pairs(results, { ticker: "NVDA", source: "moved:results", day: "2026-11-10" }, TODAY)).toBe(false);
    // A news move is not a report.
    expect(pairs(results, { ticker: "ASTS", source: "moved:news", day: "2026-11-10" }, TODAY)).toBe(false);
  });

  it("pairs a big move only when it is today's or the last session's, by its New York day", () => {
    const at = (iso: string) => proposal({ id: iso, kind: "big_move", ticker: "NVDA", event: { key: iso, kind: "big_move", at: iso, refs: [] } });
    const finding = { ticker: "NVDA", source: "moved:move" as const, day: null };
    expect(pairs(at("2026-11-13"), finding, TODAY)).toBe(true);
    expect(pairs(at("2026-11-12"), finding, TODAY)).toBe(true);
    expect(pairs(at("2026-11-10"), finding, TODAY)).toBe(false);
    // 01:00 UTC on the 12th is the 11th in New York: two sessions back.
    expect(pairs(at("2026-11-12T01:00:00Z"), finding, TODAY)).toBe(false);
  });

  it("never pairs an agent's flag with a move", () => {
    const flag = proposal({ id: "f", kind: "agent_flagged", ticker: "NVDA" });
    expect(pairs(flag, { ticker: "NVDA", source: "moved:news", day: null }, TODAY)).toBe(false);
  });

  it("pairs a call change, an alert and an upcoming report by the item's own day", () => {
    const call = proposal({ id: "c", kind: "call_change", ticker: "AMD", event: { key: "c", kind: "call_change", at: "2026-11-12", refs: [] } });
    expect(pairs(call, { ticker: "AMD", source: "do:call", day: "2026-11-12" }, TODAY)).toBe(true);
    expect(pairs(call, { ticker: "AMD", source: "do:call", day: "2026-11-13" }, TODAY)).toBe(false);
    const soon = proposal({ id: "e", kind: "earnings_soon", ticker: "AMD", event: { key: "e", kind: "earnings_soon", at: "2026-11-14", refs: [] } });
    expect(pairs(soon, { ticker: "AMD", source: "do:earnings", day: "2026-11-14" }, TODAY)).toBe(true);
    expect(pairs(soon, { ticker: "AMD", source: "do:earnings", day: "2026-11-20" }, TODAY)).toBe(false);
  });

  it("pairs a level row with a recent cross that still waits", () => {
    const level = (at: string) => proposal({ id: at, kind: "level_reached", ticker: "LLY", event: { key: at, kind: "level_reached", at, refs: [] } });
    expect(pairs(level("2026-11-11"), { ticker: "LLY", source: "level", day: null }, TODAY)).toBe(true);
    expect(pairs(level("2026-11-01"), { ticker: "LLY", source: "level", day: null }, TODAY)).toBe(false);
    expect(pairs(level("2026-11-11"), { ticker: "LLY", source: "moved:move", day: null }, TODAY)).toBe(false);
  });
});

describe("lineAsOf", () => {
  it("says a stored line's yesterday and today against today", () => {
    expect(lineAsOf("LLY closed under its buy-more level yesterday.", "2026-11-11", TODAY)).toBe("LLY closed under its buy-more level on Tuesday.");
    expect(lineAsOf("LLY closed under its buy-more level today.", "2026-11-12", TODAY)).toBe("LLY closed under its buy-more level yesterday.");
    expect(lineAsOf("Same day today.", TODAY, TODAY)).toBe("Same day today.");
  });
});

describe("settledFact", () => {
  it("says how far the price is from its own call's level", () => {
    expect(settledFact(position({ ticker: "A", price: 100, add_below: 90 }), 100)).toBe("11.1% over the buy-more price");
  });
  it("uses the card's price (an after-hours drop through the level is a decision, not nothing)", () => {
    expect(settledFact(position({ ticker: "A", price: 100, add_below: 90 }), 89)).toBeNull();
    expect(settledFact(position({ ticker: "A", price: 100, add_below: 90 }), 90.2)).toBeNull();
  });
  it("says the call stands where it names no level, and nothing without a call", () => {
    expect(settledFact(position({ ticker: "A", stance: "Keep", add_below: null }), 100)).toBe("Our call stays Keep");
    expect(settledFact(position({ ticker: "A", stance: null }), 100)).toBeNull();
  });
});

describe("decisionWords", () => {
  it("names what an accepted proposal did, and a dismissal", () => {
    expect(decisionWords(proposal({ id: "a", kind: "results", ticker: "ASTS", status: "accepted" }))).toBe("Alert set at $90.00");
    expect(decisionWords(proposal({ id: "a", kind: "results", ticker: "ASTS", status: "dismissed" }))).toBe("Dismissed");
    expect(decisionWords(proposal({ id: "a", kind: "results", ticker: "ASTS", status: "pending" }))).toBeNull();
  });
});

describe("buildDesk", () => {
  it("takes a finding a waiting proposal is about out of its module, and never calls that stock checked", () => {
    const waiting = [proposal({ id: "a", kind: "results", ticker: "ASTS", event: { key: "a", kind: "results", at: "2026-11-12", refs: [] } })];
    const desk = buildDesk(input({ waiting, all: waiting, moved: [moved("ASTS", "results")], reportDays: { ASTS: "2026-11-12" }, positions: [position({ ticker: "ASTS" })] }), words);
    expect(desk.taken.has("ASTS")).toBe(true);
    expect(desk.checked).toEqual([]);
  });

  it("leaves a finding where it was when the stock's proposal is about something else, and does not call it checked", () => {
    const waiting = [proposal({ id: "a", kind: "level_reached", ticker: "NVDA" })];
    const desk = buildDesk(input({ waiting, all: waiting, moved: [moved("NVDA", "news")], positions: [position({ ticker: "NVDA" })] }), words);
    expect(desk.taken.has("NVDA")).toBe(false);
    expect(desk.checked).toEqual([]);
  });

  it("says checked with the settling fact for a move nothing waits on", () => {
    const desk = buildDesk(input({ moved: [moved("AMD")], positions: [position({ ticker: "AMD" })] }), words);
    expect(desk.checked).toHaveLength(1);
    expect(desk.checked[0]).toMatchObject({ ticker: "AMD", decision: "11.1% over the buy-more price", source: null });
    expect(desk.taken.has("AMD")).toBe(true);
  });

  it("claims nothing checked from a queue that is not fresh, but still shows what waits", () => {
    const waiting = [proposal({ id: "a", kind: "level_reached", ticker: "LLY" })];
    const desk = buildDesk(input({ fresh: false, waiting, all: waiting, moved: [moved("AMD")], positions: [position({ ticker: "AMD" })] }), words);
    expect(desk.checked).toEqual([]);
    expect(desk.waiting).toHaveLength(1);
  });

  it("leaves a stock that reports within a day out of checked", () => {
    const desk = buildDesk(input({ moved: [moved("AMD", "results")], positions: [position({ ticker: "AMD", earnings_date: "2026-11-12" })] }), words);
    expect(desk.checked).toEqual([]);
  });

  it("says the fact at this morning's price before the open", () => {
    const desk = buildDesk(input({ moved: [moved("AMD")], prices: { AMD: 89 }, positions: [position({ ticker: "AMD" })] }), words);
    expect(desk.checked).toEqual([]);
  });

  it("never calls a move at its level checked", () => {
    const desk = buildDesk(input({ moved: [moved("CCC", "move", 90.1)], positions: [position({ ticker: "CCC" })] }), words);
    expect(desk.checked).toEqual([]);
  });

  it("shows at most four checked cards and leaves the rest in their modules", () => {
    const tickers = ["A", "B", "C", "D", "E", "F"];
    const desk = buildDesk(input({ moved: tickers.map((ticker) => moved(ticker)), positions: tickers.map((ticker) => position({ ticker })) }), words);
    expect(desk.checked.map((card) => card.ticker)).toEqual(["A", "B", "C", "D"]);
    expect(desk.taken.has("E")).toBe(false);
  });

  it("claims nothing checked when the queue could not be read", () => {
    const desk = buildDesk(input({ waiting: null, moved: [moved("AMD")], positions: [position({ ticker: "AMD" })] }), words);
    expect(desk.checked).toEqual([]);
    expect(desk.taken.size).toBe(0);
  });

  it("does not call checked a stock whose call changed today, one in Do today, or one at its level", () => {
    const items = [{ id: "c", kind: "call_changed", ticker: "AAA" } as BriefingItem];
    const doCards: DoCard[] = [{ ticker: "BBB", name: "B", price: 100, pct: 1, call: "Keep", href: "/stock/BBB", reason: "earnings", line: "Reports tomorrow" }];
    const desk = buildDesk(
      input({
        items,
        doCards,
        moved: [moved("AAA"), moved("BBB"), moved("CCC", "move", 90.1)],
        positions: [position({ ticker: "AAA" }), position({ ticker: "BBB" }), position({ ticker: "CCC" })],
      }),
      words,
    );
    expect(desk.checked).toEqual([]);
  });

  it("does not explain a stock the plan does not cover", () => {
    const desk = buildDesk(input({ moved: [moved("AMD")], positions: [position({ ticker: "AMD", covered: false })] }), words);
    expect(desk.checked).toEqual([]);
  });

  it("shows what the person answered in the last few days, dated, and pairs it with its finding only when it is about the same event", () => {
    const answered = proposal({
      id: "a",
      kind: "results",
      ticker: "ASTS",
      status: "accepted",
      decided_at: "2026-11-12T14:00:00Z",
      event: { key: "a", kind: "results", at: "2026-11-10", refs: [] },
    });
    const old = proposal({ id: "b", kind: "results", ticker: "OLD", status: "accepted", decided_at: "2026-11-05T14:00:00Z" });
    const desk = buildDesk(input({ all: [answered, old], moved: [moved("ASTS", "results")], reportDays: { ASTS: "2026-11-10" }, positions: [position({ ticker: "ASTS" })] }), words);
    expect(desk.answered.map((card) => [card.ticker, card.decision, card.when])).toEqual([["ASTS", "Alert set at $90.00", "Yesterday"]]);
    expect(desk.answered[0]!.line).toBe("ASTS reported on Monday and fell 8%.");
    expect(desk.taken.has("ASTS")).toBe(true);
    // Never also "checked".
    expect(desk.checked).toEqual([]);
  });

  it("keeps a finding on a stock whose answer was about another event, and does not call it checked", () => {
    const answered = proposal({ id: "a", kind: "level_reached", ticker: "NVDA", status: "dismissed", decided_at: "2026-11-12T14:00:00Z" });
    const desk = buildDesk(input({ all: [answered], moved: [moved("NVDA", "news")], positions: [position({ ticker: "NVDA" })] }), words);
    expect(desk.answered).toHaveLength(1);
    expect(desk.taken.has("NVDA")).toBe(false);
    expect(desk.checked).toEqual([]);
  });

  it("does not show an answer on a stock that has a new proposal waiting", () => {
    const answered = proposal({ id: "a", kind: "results", ticker: "ASTS", status: "accepted", decided_at: "2026-11-12T14:00:00Z" });
    const waiting = [proposal({ id: "b", kind: "level_reached", ticker: "ASTS" })];
    const desk = buildDesk(input({ waiting, all: [answered, ...waiting] }), words);
    expect(desk.answered).toEqual([]);
  });

  it("checks an after-hours move at its after-hours price and keeps its drop time", () => {
    const card: OvernightCard = { ticker: "CBRS", name: "Cerebras", session: "post", pct: 18, price: 118, asOf: "2026-11-13T00:59:00Z", line: null, holding: true };
    const desk = buildDesk(input({ overnight: [card], overnightDropAt: 123, positions: [position({ ticker: "CBRS" })] }), words);
    expect(desk.checked[0]).toMatchObject({ ticker: "CBRS", line: "Moved after hours", decision: "31.1% over the buy-more price", dropAt: 123 });
  });

  it("only takes a finding off its module for an answer the desk lists", () => {
    const tickers = ["A", "B", "C", "D"];
    const all = tickers.map((ticker, index) =>
      proposal({ id: ticker, kind: "level_reached", ticker, status: "accepted", decided_at: `2026-11-12T1${index}:00:00Z` }),
    );
    const levels = tickers.map((ticker) => ({ ticker }) as LevelRow);
    const desk = buildDesk(input({ all, levels }), words);
    // Newest first: D, C and B are listed and their level rows go; A is past the three shown and keeps its row.
    expect(desk.answered.map((card) => card.ticker)).toEqual(["D", "C", "B", "A"]);
    expect([...desk.taken].sort()).toEqual(["B", "C", "D"]);
  });

  it("keeps a finding whose answer cannot be worded", () => {
    const answer = proposal({ id: "a", kind: "level_reached", ticker: "LLY", status: "accepted", decided_at: "2026-11-12T14:00:00Z", why: [] });
    const desk = buildDesk(input({ all: [answer], levels: [{ ticker: "LLY" } as LevelRow] }), words);
    expect(desk.answered).toEqual([]);
    expect(desk.taken.has("LLY")).toBe(false);
  });

  it("takes a level row a level proposal is about", () => {
    const row = { ticker: "LLY" } as LevelRow;
    const waiting = [proposal({ id: "a", kind: "level_reached", ticker: "LLY" })];
    const desk = buildDesk(input({ waiting, levels: [row] }), words);
    expect(desk.taken.has("LLY")).toBe(true);
  });
});
