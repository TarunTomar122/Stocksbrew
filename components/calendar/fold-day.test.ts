import { describe, expect, it } from "vitest";

import { foldDay } from "@/components/calendar/fold-day";

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
});
