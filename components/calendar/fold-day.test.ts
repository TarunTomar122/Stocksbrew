import { describe, expect, it } from "vitest";

import { foldDay, weekBudget } from "@/components/calendar/fold-day";

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
