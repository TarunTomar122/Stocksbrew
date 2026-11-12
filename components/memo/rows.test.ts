import { describe, expect, it } from "vitest";

import { packRows, packedGrid, packedSection, wideColumns } from "./rows";

type Key = "movers" | "calls" | "hurt" | "look" | "also";
const shape = (counts: Partial<Record<Key, number>>) =>
  packRows<Key>((["movers", "calls", "hurt", "look", "also"] as const).map((key) => ({ key, count: counts[key] ?? 0 }))).map((row) =>
    row.map((block) => `${block.key}:${block.span}/${block.cols}`).join(" "),
  );

describe("memo card rows", () => {
  it("gives a big section rows of its own: up to five across, else four or three", () => {
    expect([5, 6, 7, 8, 9].map(wideColumns)).toEqual([5, 3, 4, 4, 3]);
    expect(shape({ movers: 5 })).toEqual(["movers:12/5"]);
    expect(shape({ movers: 6 })).toEqual(["movers:12/3"]);
  });

  it("puts short sections side by side so each row fills the width (the owner's memo: 1, 2 and 2 cards)", () => {
    expect(shape({ movers: 6, hurt: 1, look: 2, also: 2 })).toEqual(["movers:12/3", "hurt:4/1 look:8/2", "also:12/2"]);
    expect(shape({ hurt: 1, look: 2 })).toEqual(["hurt:4/1 look:8/2"]);
    expect(shape({ hurt: 2, look: 2 })).toEqual(["hurt:6/2 look:6/2"]);
    expect(shape({ calls: 1, hurt: 1, look: 1, also: 1 })).toEqual(["calls:3/1 hurt:3/1 look:3/1 also:3/1"]);
    expect(shape({ hurt: 4, look: 4, also: 4 })).toEqual(["hurt:12/4", "look:12/4", "also:12/4"]);
    expect(shape({ calls: 2, hurt: 1, look: 2, also: 1 })).toEqual(["calls:8/2 hurt:4/1", "look:8/2 also:4/1"]);
  });

  it("drops empty sections and never leaves a lone card on a row when a neighbour can share it", () => {
    expect(shape({})).toEqual([]);
    expect(shape({ hurt: 1 })).toEqual(["hurt:12/1"]);
    expect(shape({ hurt: 1, also: 1 })).toEqual(["hurt:6/1 also:6/1"]);
    expect(shape({ hurt: 1, look: 4 })).toEqual(["hurt:12/1", "look:12/4"]);
    expect(shape({ hurt: 3, look: 1 })).toEqual(["hurt:9/3 look:3/1"]);
    expect(shape({ hurt: 2, look: 1, also: 2 })).toEqual(["hurt:8/2 look:4/1", "also:12/2"]);
    for (const counts of [{ hurt: 0, look: 2, also: 4 }, { calls: 3, hurt: 2, look: 2, also: 1 }, { movers: 2, calls: 1, hurt: 1 }]) {
      for (const row of packRows<Key>(Object.entries(counts).map(([key, count]) => ({ key: key as Key, count })))) {
        expect(row.reduce((sum, block) => sum + block.span, 0)).toBe(12);
      }
    }
  });

  it("writes whole class names", () => {
    expect(packedSection({ span: 8 })).toContain("lg:col-span-8");
    expect(packedGrid({ cols: 2 }, "stock")).toBe("grid grid-cols-2 gap-3 lg:grid-cols-2");
    expect(packedGrid({ cols: 1 }, "text")).toBe("grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-1");
  });
});
