import { describe, expect, it } from "vitest";

import { foldDay, stackDays, weekBudget } from "@/components/calendar/fold-day";

const head = (id: string) => ({ id, weight: 0 });
const row = (id: string, weight = 1) => ({ id, weight });

describe("foldDay", () => {
  it("shows a short day whole", () => {
    const blocks = [head("h"), row("a"), row("b")];
    expect(foldDay(blocks, 12)).toEqual({ shown: blocks, rest: [], hidden: 0 });
  });

  it("cuts after the budget and counts the rows left", () => {
    const blocks = [head("h1"), ...Array.from({ length: 10 }, (_, i) => row(`a${i}`)), head("h2"), ...Array.from({ length: 6 }, (_, i) => row(`b${i}`))];
    const out = foldDay(blocks, 12);
    expect(out.shown.filter((block) => block.weight > 0)).toHaveLength(12);
    expect(out.hidden).toBe(4);
    expect([...out.shown, ...out.rest]).toEqual(blocks);
  });

  it("never ends the shown part on a heading", () => {
    const blocks = [head("h1"), ...Array.from({ length: 12 }, (_, i) => row(`a${i}`)), head("h2"), row("b0"), row("b1")];
    const out = foldDay(blocks, 12);
    expect(out.shown.at(-1)?.weight).toBeGreaterThan(0);
    expect(out.rest[0]).toEqual(head("h2"));
    expect(out.hidden).toBe(2);
  });

  it("does not fold away a single row", () => {
    const blocks = [head("h"), ...Array.from({ length: 13 }, (_, i) => row(`a${i}`))];
    expect(foldDay(blocks, 12).hidden).toBe(0);
  });

  it("weighs tall rows and always shows the first", () => {
    const blocks = [head("ipo"), row("big", 20), row("next", 3), row("last", 3)];
    const out = foldDay(blocks, 12);
    expect(out.shown.map((block) => block.id)).toEqual(["ipo", "big"]);
    expect(out.hidden).toBe(2);
  });

  it("with a button, counts headings and keeps room for the Show more line", () => {
    const blocks = [{ id: "h1", weight: 0, height: 1 }, ...Array.from({ length: 10 }, (_, i) => row(`a${i}`)), { id: "h2", weight: 0, height: 1 }, ...Array.from({ length: 6 }, (_, i) => row(`b${i}`))];
    const out = foldDay(blocks, 10, { button: 1 });
    // 1 heading + 8 rows + the button = 10.
    expect(out.shown.filter((block) => block.weight > 0)).toHaveLength(8);
    expect(out.hidden).toBe(8);
  });

  it("with a button, never folds a day that fits whole, and lets a tall row run over by less than a cut would leave", () => {
    const fits = [{ id: "h", weight: 0, height: 1 }, ...Array.from({ length: 8 }, (_, i) => row(`a${i}`))];
    expect(foldDay(fits, 9, { button: 1 }).hidden).toBe(0);
    // 1 + 1.5 shown; an IPO heading and a 2-row IPO would end at 6.5 with the button, against 3.5 if cut before it.
    const tall = [{ id: "h", weight: 0, height: 1 }, row("a", 1.5), { id: "ipo", weight: 0, height: 1 }, row("i1", 2), row("i2", 2), row("i3", 2)];
    const out = foldDay(tall, 6, { button: 1 });
    expect(out.shown.map((block) => block.id)).toEqual(["h", "a", "ipo", "i1"]);
    expect(out.hidden).toBe(2);
  });
});

describe("weekBudget", () => {
  const day = (rows: number, headings = 1) => [...Array.from({ length: headings }, (_, i) => ({ id: `h${i}`, weight: 0, height: 1 })), ...Array.from({ length: rows }, (_, i) => row(`r${i}`))];

  it("folds the week to its quietest day with events, within the bounds", () => {
    // Heights 15, 12, 10 (judge90's week: one day of ten lines beside days of 14 and more): every day ends at 10.
    expect(weekBudget([day(14), day(11), day(7, 3)], { min: 8, max: 15 })).toBe(10);
    // A busy week never runs past the cap.
    expect(weekBudget([day(30), day(25)], { min: 8, max: 15 })).toBe(15);
    // A near-empty day keeps its own height; the rest fold no shorter than the floor.
    expect(weekBudget([day(2), day(20), day(9)], { min: 8, max: 15 })).toBe(10);
    // Empty days and a week of only near-empty days.
    expect(weekBudget([[], day(1)], { min: 8, max: 15 })).toBe(15);
  });
});

describe("stackDays", () => {
  it("keeps busy days in their own columns", () => {
    expect(stackDays([18, 18, 18, 18, 18], { limit: 19 })).toEqual([[0], [1], [2], [3], [4]]);
    // A quiet day beside busy ones has nobody to share with.
    expect(stackDays([12, 18, 18, 18, 18], { limit: 19 })).toEqual([[0], [1], [2], [3], [4]]);
  });

  it("stacks quiet neighbours so the columns end closest together", () => {
    // Thanksgiving week: a quiet Friday and Monday share a column between busy days.
    expect(stackDays([17, 17, 6, 8, 17], { limit: 19 })).toEqual([[0], [1], [2, 3], [4]]);
    // A sparse window (My stocks only): one fuller day, then two quiet ones together.
    expect(stackDays([10, 7, 5], { limit: 18 })).toEqual([[0], [1, 2]]);
    // Equal quiet days already end level: each keeps its column.
    expect(stackDays([5, 5, 5, 5], { limit: 19 })).toEqual([[0], [1], [2], [3]]);
    // Uneven quiet days pair up to end level.
    expect(stackDays([4, 6, 6, 4], { limit: 19 })).toEqual([[0, 1], [2, 3]]);
  });

  it("never stacks today, nor anything onto it, nor past the limit", () => {
    expect(stackDays([5, 5, 10, 5, 5], { limit: 19, alone: [2] })).toEqual([[0, 1], [2], [3, 4]]);
    expect(stackDays([5, 5], { limit: 19, alone: [0] })).toEqual([[0], [1]]);
    expect(stackDays([10, 10], { limit: 19 })).toEqual([[0], [1]]);
    expect(stackDays([], { limit: 19 })).toEqual([]);
    expect(stackDays([4], { limit: 19 })).toEqual([[0]]);
  });
});
