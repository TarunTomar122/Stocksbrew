import { describe, expect, it } from "vitest";

import { fitCut, levelColumns, type CardMeasure } from "@/components/calendar/level";

const OPTIONS = { gap: 8, button: 32, pad: 8 };
const heading = { height: 30, row: false };
const row = (height = 46) => ({ height, row: true });
/** A card of one heading and `rows` rows of 46px under a 60px header; the server shows `ssrCut` blocks. */
const card = (rows: number, ssrCut = rows + 1): CardMeasure => ({ head: 60, items: [heading, ...Array.from({ length: rows }, () => row())], ssrCut });

describe("fitCut", () => {
  it("shows everything that fits", () => {
    expect(fitCut(card(4), 30 + 4 * 46 + 8, OPTIONS)).toBe(5);
  });

  it("cuts on whole rows with room for the button, never on a heading, never hiding one row", () => {
    // 300px: heading 30 + 5 rows (230) + button 32 = 292.
    expect(fitCut(card(10), 300, OPTIONS)).toBe(6);
    // Room for all but one row: hides two instead of "Show 1 more".
    const nine = 30 + 8 * 46 + 32;
    expect(fitCut(card(9), nine, OPTIONS)).toBe(8);
    // A second heading at the cut is not left dangling.
    const two: CardMeasure = { head: 60, items: [heading, row(), row(), heading, row(), row(), row()], ssrCut: 7 };
    expect(fitCut(two, 30 + 92 + 30 + 32, OPTIONS)).toBe(3);
    // Always at least the first row.
    expect(fitCut(card(5), 10, OPTIONS)).toBe(2);
  });
});

describe("levelColumns", () => {
  it("keeps the server's rows by default: a quiet day shorter than the busy days' fold stretches to it", () => {
    const { target, cuts } = levelColumns([{ cards: [card(8)] }, { cards: [card(20, 10)] }], OPTIONS);
    expect(target).toBe(60 + 30 + 9 * 46 + 32);
    expect(cuts).toEqual([[9], [10]]);
  });

  it("with a lower floor, folds busy columns to the quiet one's height", () => {
    // A quiet day of 8 rows (full, unfolded) beside busy days the server cut at 9 rows.
    const quiet = card(8);
    const busy = () => card(20, 10);
    const { target, cuts } = levelColumns([{ cards: [quiet] }, { cards: [busy()] }, { cards: [busy()] }], { ...OPTIONS, floorRatio: 0.85 });
    const quietHeight = 60 + 30 + 8 * 46 + 8;
    expect(target).toBe(quietHeight);
    expect(cuts[0]).toEqual([9]);
    // A busy day shows whole rows plus its button within the quiet day's height.
    const shown = cuts[1]![0]!;
    expect(60 + 30 + (shown - 1) * 46 + 32).toBeLessThanOrEqual(target);
    expect(60 + 30 + shown * 46 + 32).toBeGreaterThan(target);
  });

  it("never folds a busy day far below the server's fold for a very quiet one", () => {
    const { target, cuts } = levelColumns([{ cards: [card(1)] }, { cards: [card(20, 10)] }], { ...OPTIONS, floorRatio: 0.85 });
    const ssr = 60 + 30 + 9 * 46 + 32;
    expect(target).toBeCloseTo(ssr * 0.85);
    expect(cuts[1]![0]!).toBeGreaterThanOrEqual(7);
  });

  it("levels sparse days (nothing folded) to the fullest one without cutting any", () => {
    const { target, cuts } = levelColumns([{ cards: [card(3)] }, { cards: [card(1)] }, { cards: [card(2)] }], OPTIONS);
    expect(target).toBe(60 + 30 + 3 * 46 + 8);
    expect(cuts).toEqual([[4], [2], [3]]);
  });

  it("folds the last card of a stack, keeping the server's cut above it", () => {
    const { cuts } = levelColumns([{ cards: [card(2), card(12, 6)] }, { cards: [card(6)] }], OPTIONS);
    expect(cuts[0]![0]).toBe(3);
    expect(cuts[0]![1]).toBeLessThan(13);
  });

  it("handles an empty week", () => {
    expect(levelColumns([], OPTIONS)).toEqual({ target: 0, cuts: [] });
  });
});
