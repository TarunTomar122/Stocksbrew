import { describe, expect, it } from "vitest";

import { lastSpan, memoCell, memoGrid, wideColumns } from "./rows";

describe("memo card rows", () => {
  it("puts up to five in one row, else rows of four or three, and the last card fills its row", () => {
    expect([1, 2, 5, 6, 7, 8, 9].map(wideColumns)).toEqual([1, 2, 5, 3, 4, 4, 3]);
    expect(lastSpan(5)).toBe(1);
    expect(lastSpan(7)).toBe(2);
    expect(memoCell(4, 5)).toBe("min-w-0 col-span-2 lg:col-span-1");
    expect(memoCell(0, 5)).toBe("min-w-0");
    expect(memoGrid(6)).toContain("lg:grid-cols-3");
    expect(memoGrid(13)).toContain("lg:grid-cols-4");
    expect(memoCell(12, 13)).toBe("min-w-0 col-span-2 lg:col-span-4");
  });
});
